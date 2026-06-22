const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const RECENT_MATCH_WINDOW_DAYS = 100;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeText(value) {
  return value === undefined || value === null || value === "" ? null : String(value);
}

function todayIsoDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isAuthorized(request, env) {
  if (!env.DATABASE_SYNC_TOKEN) return false;
  const url = new URL(request.url);
  const token = request.headers.get("x-sync-token") || url.searchParams.get("token");
  return token && token === env.DATABASE_SYNC_TOKEN;
}

async function fetchApiTennis(env, method, params = {}) {
  if (!env.API_TENNIS_KEY) return [];
  const url = new URL(TENNIS_API_BASE);
  url.searchParams.set("method", method);
  url.searchParams.set("APIkey", env.API_TENNIS_KEY);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${method} returned ${response.status}`);
  const payload = await response.json();
  if (payload?.success === 0 || payload?.success === false || payload?.error) throw new Error(payload.error || payload.message || `${method} failed`);
  return Array.isArray(payload.result) ? payload.result : [];
}

function makeRecentMatchId(playerId, sourceEventId) {
  return `${playerId}:${String(sourceEventId).replace(/[^a-zA-Z0-9:_-]/g, "-")}`;
}

function getApiTennisWinnerName(event) {
  const winner = String(event.event_winner || "").toLowerCase();
  if (winner.includes("first")) return event.event_first_player || event.first_player || "";
  if (winner.includes("second")) return event.event_second_player || event.second_player || "";
  return event.event_winner || "";
}

function getApiTennisScore(event) {
  return event.event_final_result || event.event_game_result || event.event_status || "";
}

function getEventDate(event) {
  const value = event.event_date || event.date || event.event_start_time || "";
  return String(value).slice(0, 10);
}

function getEventPlayer(event, side) {
  const prefix = side === "first" ? "first" : "second";
  return {
    name: event[`event_${prefix}_player`] || event[`${prefix}_player`] || "",
    key: String(event[`${prefix}_player_key`] || event[`event_${prefix}_player_key`] || ""),
  };
}

function eventSourceId(event) {
  const first = getEventPlayer(event, "first").name;
  const second = getEventPlayer(event, "second").name;
  return String(event.event_key || event.event_id || `${getEventDate(event)}:${first}:${second}`);
}

function eventIsTourSingles(event) {
  const type = String(event.event_type_type || "").toLowerCase();
  return type.includes("singles") && !type.includes("doubles") && !/itf|challenger|boys|girls|junior/.test(type);
}

function eventIsRecentFinished(event) {
  const date = getEventDate(event);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (date < todayIsoDate(-RECENT_MATCH_WINDOW_DAYS) || date > todayIsoDate()) return false;
  if (!eventIsTourSingles(event)) return false;
  const status = String(event.event_status || event.status || "").toLowerCase();
  if (/cancel|postpon|abandon|not started|scheduled|interrupted/.test(status)) return false;
  return Boolean(normalizeName(getApiTennisWinnerName(event)));
}

function getSurface(event) {
  const value = safeText(event.surface || event.event_surface || event.tournament_surface || event.event_surface_type);
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("clay")) return "Clay";
  if (normalized.includes("grass")) return "Grass";
  if (normalized.includes("hard")) return "Hard";
  if (normalized.includes("carpet")) return "Carpet";
  return null;
}

function playerMatchesEventSide(event, playerKey, playerName, side) {
  const player = getEventPlayer(event, side);
  return (playerKey && player.key && String(player.key) === String(playerKey)) || normalizeName(player.name) === normalizeName(playerName);
}

function playerWonEvent(event, playerKey, playerName) {
  const winner = String(event.event_winner || "").toLowerCase();
  if (winner.includes("first")) return playerMatchesEventSide(event, playerKey, playerName, "first");
  if (winner.includes("second")) return playerMatchesEventSide(event, playerKey, playerName, "second");
  return normalizeName(getApiTennisWinnerName(event)) === normalizeName(playerName);
}

function opponentForEvent(event, playerKey, playerName) {
  if (playerMatchesEventSide(event, playerKey, playerName, "first")) return getEventPlayer(event, "second");
  return getEventPlayer(event, "first");
}

function recentMatchStatement(db, player, event) {
  if (!eventIsRecentFinished(event)) return null;
  const opponent = opponentForEvent(event, player.player_key, player.name);
  if (!opponent.name || normalizeName(opponent.name) === normalizeName(player.name)) return null;
  const sourceEventId = eventSourceId(event);
  const won = playerWonEvent(event, player.player_key, player.name);
  return db.prepare(`
    INSERT INTO player_recent_matches (
      id, player_id, player_key, tour, match_date, source_event_id, tournament, surface,
      opponent_name, opponent_key, score, result, event_status, source, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'api-tennis-fixtures', datetime('now'))
    ON CONFLICT(player_id, source_event_id) DO UPDATE SET
      player_key = excluded.player_key,
      tour = excluded.tour,
      match_date = excluded.match_date,
      tournament = excluded.tournament,
      surface = excluded.surface,
      opponent_name = excluded.opponent_name,
      opponent_key = excluded.opponent_key,
      score = excluded.score,
      result = excluded.result,
      event_status = excluded.event_status,
      source = excluded.source,
      updated_at = datetime('now')
  `).bind(
    makeRecentMatchId(player.id, sourceEventId),
    player.id,
    safeText(player.player_key),
    player.tour,
    getEventDate(event),
    sourceEventId,
    safeText(event.tournament_name || event.league_name || event.event_name),
    getSurface(event),
    opponent.name,
    safeText(opponent.key),
    safeText(getApiTennisScore(event)),
    won ? "win" : "loss",
    safeText(event.event_status)
  );
}

async function runBatches(db, statements, batchSize = 50) {
  for (let index = 0; index < statements.length; index += batchSize) {
    await db.batch(statements.slice(index, index + batchSize));
  }
}

async function syncRecentMatches(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ error: "Missing TENNIS_DB D1 binding" }, 500);
  if (!isAuthorized(request, env)) return jsonResponse({ error: "Unauthorized" }, 401);
  if (!env.API_TENNIS_KEY) return jsonResponse({ error: "Missing API_TENNIS_KEY" }, 500);

  const url = new URL(request.url);
  const offset = Math.max(asInt(url.searchParams.get("offset"), 0), 0);
  const limit = Math.min(Math.max(asInt(url.searchParams.get("limit"), DEFAULT_LIMIT), 1), MAX_LIMIT);
  const tour = String(url.searchParams.get("tour") || "").toUpperCase();
  const db = env.TENNIS_DB;

  const whereTour = tour === "ATP" || tour === "WTA" ? "AND tour = ?" : "";
  const bindValues = tour === "ATP" || tour === "WTA" ? [tour, limit, offset] : [limit, offset];
  const playersResult = await db.prepare(`
    SELECT id, player_key, tour, name
    FROM players
    WHERE player_key IS NOT NULL AND player_key != '' ${whereTour}
    ORDER BY tour ASC, COALESCE(current_rank, 999999) ASC, name ASC
    LIMIT ? OFFSET ?
  `).bind(...bindValues).all();

  const players = playersResult.results || [];
  let matchesUpserted = 0;
  let fetchedEvents = 0;
  const missed = [];

  for (const player of players) {
    const fixtures = await fetchApiTennis(env, "get_fixtures", {
      player_key: player.player_key,
      date_start: todayIsoDate(-RECENT_MATCH_WINDOW_DAYS),
      date_stop: todayIsoDate(),
    });
    fetchedEvents += fixtures.length;
    const statements = fixtures.map((event) => recentMatchStatement(db, player, event)).filter(Boolean);
    if (statements.length) {
      await db.prepare("DELETE FROM player_recent_matches WHERE player_id = ? AND match_date >= date('now', '-100 days')").bind(player.id).run();
      await runBatches(db, statements);
    }
    matchesUpserted += statements.length;
    if (!fixtures.length) missed.push({ id: player.id, name: player.name, player_key: player.player_key });
  }

  return jsonResponse({
    ok: true,
    source: "API-Tennis get_fixtures by player_key",
    windowDays: RECENT_MATCH_WINDOW_DAYS,
    offset,
    limit,
    nextOffset: offset + limit,
    requestedPlayers: players.length,
    fetchedEvents,
    matchesUpserted,
    playersWithoutFixtures: missed.length,
    missed,
  });
}

export async function onRequestPost({ request, env }) {
  return syncRecentMatches(request, env);
}

export async function onRequestGet({ request, env }) {
  return syncRecentMatches(request, env);
}
