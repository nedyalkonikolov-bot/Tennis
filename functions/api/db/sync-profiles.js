const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 25;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function asInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeText(value) {
  return value === undefined || value === null || value === "" ? null : String(value);
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
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload.result) ? payload.result : [];
}

function profileKey(profile) {
  return String(profile.player_key || profile.player_id || "");
}

function normalizeStatType(value = "") {
  const text = String(value || "singles").toLowerCase();
  return text.includes("double") ? "doubles" : "singles";
}

function makeSeasonStatId(playerId, season, type) {
  return `${playerId}:${season || "unknown"}:${String(type || "singles").toLowerCase()}`;
}

function seasonStatStatement(db, player, stat) {
  const type = normalizeStatType(stat.type);
  const season = String(stat.season || new Date().getUTCFullYear());
  return db.prepare(`
    INSERT INTO player_season_stats (
      id, player_id, player_key, tour, season, type, season_rank, titles,
      matches_won, matches_lost, hard_won, hard_lost, clay_won, clay_lost, grass_won, grass_lost,
      source, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'api-tennis-get-players', datetime('now'))
    ON CONFLICT(player_id, season, type) DO UPDATE SET
      player_key = excluded.player_key,
      tour = excluded.tour,
      season_rank = excluded.season_rank,
      titles = excluded.titles,
      matches_won = excluded.matches_won,
      matches_lost = excluded.matches_lost,
      hard_won = excluded.hard_won,
      hard_lost = excluded.hard_lost,
      clay_won = excluded.clay_won,
      clay_lost = excluded.clay_lost,
      grass_won = excluded.grass_won,
      grass_lost = excluded.grass_lost,
      source = excluded.source,
      updated_at = datetime('now')
  `).bind(
    makeSeasonStatId(player.id, season, type),
    player.id,
    safeText(player.player_key),
    player.tour,
    season,
    type,
    asInt(stat.rank, null),
    asInt(stat.titles, 0),
    asInt(stat.matches_won, 0),
    asInt(stat.matches_lost, 0),
    asInt(stat.hard_won, 0),
    asInt(stat.hard_lost, 0),
    asInt(stat.clay_won, 0),
    asInt(stat.clay_lost, 0),
    asInt(stat.grass_won, 0),
    asInt(stat.grass_lost, 0)
  );
}

async function runBatches(db, statements, batchSize = 50) {
  for (let index = 0; index < statements.length; index += batchSize) {
    await db.batch(statements.slice(index, index + batchSize));
  }
}

async function syncProfiles(request, env) {
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
  const statements = [];
  let profilesUpserted = 0;
  let seasonStatsUpserted = 0;
  const missed = [];

  for (const player of players) {
    const rows = await fetchApiTennis(env, "get_players", { player_key: player.player_key });
    const profile = rows.find((row) => profileKey(row) === String(player.player_key)) || rows[0];
    if (!profile) {
      missed.push({ id: player.id, name: player.name, player_key: player.player_key });
      continue;
    }

    statements.push(db.prepare(`
      UPDATE players
      SET player_bday = COALESCE(?, player_bday),
          player_logo = COALESCE(?, player_logo),
          country = COALESCE(?, country),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(safeText(profile.player_bday), safeText(profile.player_logo), safeText(profile.player_country), player.id));
    profilesUpserted += 1;

    for (const stat of profile.stats || []) {
      statements.push(seasonStatStatement(db, player, stat));
      seasonStatsUpserted += 1;
    }
  }

  await runBatches(db, statements);

  return jsonResponse({
    ok: true,
    source: "API-Tennis get_players",
    offset,
    limit,
    nextOffset: offset + limit,
    requestedPlayers: players.length,
    profilesUpserted,
    seasonStatsUpserted,
    missed,
  });
}

export async function onRequestPost({ request, env }) {
  return syncProfiles(request, env);
}

export async function onRequestGet({ request, env }) {
  return syncProfiles(request, env);
}
