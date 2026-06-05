const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const MODEL_VERSION = "v1";
const RECENT_MATCH_WINDOW_DAYS = 100;
const RECENT_PLAYER_SYNC_LIMIT = 40;
const PLAYER_PROFILE_SYNC_LIMIT = 6;
const OUTCOME_SETTLE_LOOKBACK_DAYS = 45;

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

function nameParts(value = "") {
  const parts = normalizeName(value).split(" ").filter(Boolean);
  return { first: parts[0] || "", last: parts[parts.length - 1] || "" };
}

function namesMatch(a = "", b = "") {
  const normalizedA = normalizeName(a);
  const normalizedB = normalizeName(b);
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;
  const left = nameParts(a);
  const right = nameParts(b);
  if (!left.last || !right.last || left.last !== right.last) return false;
  if (!left.first || !right.first) return true;
  return left.first[0] === right.first[0];
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

function makePlayerId(tour, name, playerKey = "") {
  const cleanTour = tour === "WTA" ? "WTA" : "ATP";
  const cleanName = normalizeName(name).replace(/\s+/g, "-") || "unknown";
  return playerKey ? `${cleanTour}:${playerKey}` : `${cleanTour}:${cleanName}`;
}

function makeMatchId(source, sourceEventId) {
  return `${source}:${String(sourceEventId).replace(/[^a-zA-Z0-9:_-]/g, "-")}`;
}

function makePredictionId(matchId, modelVersion = MODEL_VERSION) {
  return `${matchId}:${modelVersion}`;
}

function makeRecentMatchId(playerId, sourceEventId) {
  return `${playerId}:${String(sourceEventId).replace(/[^a-zA-Z0-9:_-]/g, "-")}`;
}

function isAuthorized(request, env) {
  if (!env.DATABASE_SYNC_TOKEN) return false;
  const url = new URL(request.url);
  const token = request.headers.get("x-sync-token") || url.searchParams.get("token");
  return token && token === env.DATABASE_SYNC_TOKEN;
}

async function secretFingerprint(value = "") {
  if (!value) return { present: false };
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    present: true,
    length: String(value).length,
    last4: String(value).slice(-4),
    sha256Prefix: hash.slice(0, 12),
  };
}

async function fetchApiTennis(env, method, params = {}) {
  const result = await fetchApiTennisRaw(env, method, params);
  return Array.isArray(result) ? result : [];
}

function recordApiTennisIssue(env, method, issue) {
  if (!env.__apiTennisIssues) env.__apiTennisIssues = [];
  env.__apiTennisIssues.push({
    method,
    error: issue?.error || null,
    code: issue?.code || issue?.cod || null,
    msg: issue?.msg || issue?.message || null,
  });
}

async function fetchApiTennisRaw(env, method, params = {}) {
  if (!env.API_TENNIS_KEY) return null;
  const url = new URL(TENNIS_API_BASE);
  url.searchParams.set("method", method);
  url.searchParams.set("APIkey", env.API_TENNIS_KEY);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    recordApiTennisIssue(env, method, { error: response.status, message: response.statusText });
    return null;
  }
  const payload = await response.json();
  if (payload?.error) {
    const first = Array.isArray(payload.result) ? payload.result[0] : null;
    recordApiTennisIssue(env, method, first || { error: payload.error });
    return null;
  }
  return payload.result || null;
}

function buildPlayerStatements(db, player, resolvedId = "") {
  const tour = player.tour || player.sex || "ATP";
  const id = resolvedId || makePlayerId(tour, player.name, player.playerKey);
  const normalizedName = normalizeName(player.name);
  const snapshotDate = todayIsoDate();

  return [
    db.prepare(`
      INSERT INTO players (
        id, player_key, name, normalized_name, tour, country, current_rank, points, movement,
        form_rating, hold_rate, break_rate, clay_rating, hard_rating, grass_rating, source, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(tour, normalized_name) DO UPDATE SET
        player_key = COALESCE(NULLIF(excluded.player_key, ''), players.player_key),
        name = excluded.name,
        country = excluded.country,
        current_rank = excluded.current_rank,
        points = excluded.points,
        movement = excluded.movement,
        form_rating = excluded.form_rating,
        hold_rate = excluded.hold_rate,
        break_rate = excluded.break_rate,
        clay_rating = excluded.clay_rating,
        hard_rating = excluded.hard_rating,
        grass_rating = excluded.grass_rating,
        source = excluded.source,
        updated_at = datetime('now')
    `).bind(
      id,
      safeText(player.playerKey),
      player.name,
      normalizedName,
      tour,
      safeText(player.country),
      asInt(player.rank, null),
      asInt(player.points, 0),
      safeText(player.movement || player.trend),
      asInt(player.form, 50),
      asInt(player.hold, 0),
      asInt(player.breakRate, 0),
      asInt(player.clay, 0),
      asInt(player.hard, 0),
      asInt(player.grass, 0),
      "live-data"
    ),
    db.prepare(`
      INSERT INTO player_stat_snapshots (
        id, player_id, snapshot_date, rank, points, form_rating, hold_rate, break_rate,
        clay_rating, hard_rating, grass_rating, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id, snapshot_date) DO UPDATE SET
        rank = excluded.rank,
        points = excluded.points,
        form_rating = excluded.form_rating,
        hold_rate = excluded.hold_rate,
        break_rate = excluded.break_rate,
        clay_rating = excluded.clay_rating,
        hard_rating = excluded.hard_rating,
        grass_rating = excluded.grass_rating,
        source = excluded.source
    `).bind(
      `${id}:${snapshotDate}`,
      id,
      snapshotDate,
      asInt(player.rank, null),
      asInt(player.points, 0),
      asInt(player.form, 50),
      asInt(player.hold, 0),
      asInt(player.breakRate, 0),
      asInt(player.clay, 0),
      asInt(player.hard, 0),
      asInt(player.grass, 0),
      "live-data"
    ),
  ];
}

async function runBatches(db, statements, batchSize = 80) {
  for (let index = 0; index < statements.length; index += batchSize) {
    await db.batch(statements.slice(index, index + batchSize));
  }
}

async function ensureMatchPlayer(db, name, tour, playerKey = "") {
  if (!name) return null;
  const normalized = normalizeName(name);
  const found = await db.prepare("SELECT id FROM players WHERE tour = ? AND normalized_name = ? LIMIT 1").bind(tour, normalized).first();
  if (found?.id) {
    if (playerKey) {
      await db.prepare("UPDATE players SET player_key = COALESCE(NULLIF(player_key, ''), ?), updated_at = datetime('now') WHERE id = ?").bind(playerKey, found.id).run();
    }
    return found.id;
  }
  const id = makePlayerId(tour, name, playerKey);
  await db.prepare(`
    INSERT INTO players (id, player_key, name, normalized_name, tour, source, updated_at)
    VALUES (?, ?, ?, ?, ?, 'match-sync', datetime('now'))
    ON CONFLICT(id) DO UPDATE SET player_key = COALESCE(excluded.player_key, player_key), updated_at = datetime('now')
  `).bind(id, safeText(playerKey), name, normalized, tour).run();
  return id;
}

async function upsertMatchAndPrediction(db, match) {
  const tour = match.tour === "WTA" ? "WTA" : "ATP";
  const source = match.oddsSource === "Cloudbet" ? "cloudbet" : "live-data";
  const matchId = makeMatchId(source, match.id);
  const playerAId = await ensureMatchPlayer(db, match.playerA, tour, match.playerAKey);
  const playerBId = await ensureMatchPlayer(db, match.playerB, tour, match.playerBKey);

  await db.prepare(`
    INSERT INTO matches (
      id, source, source_event_id, tour, tournament, start_time, status, live, surface,
      player_a_id, player_b_id, player_a_name, player_b_name, normalized_player_a, normalized_player_b,
      score, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(source, source_event_id) DO UPDATE SET
      tour = excluded.tour,
      tournament = excluded.tournament,
      start_time = excluded.start_time,
      status = excluded.status,
      live = excluded.live,
      surface = excluded.surface,
      player_a_id = excluded.player_a_id,
      player_b_id = excluded.player_b_id,
      player_a_name = excluded.player_a_name,
      player_b_name = excluded.player_b_name,
      normalized_player_a = excluded.normalized_player_a,
      normalized_player_b = excluded.normalized_player_b,
      score = excluded.score,
      updated_at = datetime('now')
  `).bind(
    matchId,
    source,
    String(match.id),
    tour,
    safeText(match.tournament),
    safeText(match.startIso || match.startTime),
    match.status || (match.live ? "Live" : "Scheduled"),
    match.live ? 1 : 0,
    safeText(match.surface),
    playerAId,
    playerBId,
    match.playerA,
    match.playerB,
    normalizeName(match.playerA),
    normalizeName(match.playerB),
    safeText(match.score)
  ).run();

  const predictedWinnerName = match.predictedWinner || match.market || "Value watch";
  const predictedWinnerId = normalizeName(predictedWinnerName) === normalizeName(match.playerA) ? playerAId : normalizeName(predictedWinnerName) === normalizeName(match.playerB) ? playerBId : null;
  const predictionId = makePredictionId(matchId);

  await db.prepare(`
    INSERT INTO predictions (
      id, match_id, model_version, source, predicted_winner_id, predicted_winner_name,
      predicted_side, confidence, predicted_odds, model_edge, factors_json
    ) VALUES (?, ?, ?, 'tennistipz', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id, model_version) DO UPDATE SET
      predicted_winner_id = excluded.predicted_winner_id,
      predicted_winner_name = excluded.predicted_winner_name,
      predicted_side = excluded.predicted_side,
      confidence = excluded.confidence,
      predicted_odds = excluded.predicted_odds,
      model_edge = excluded.model_edge,
      factors_json = excluded.factors_json
  `).bind(
    predictionId,
    matchId,
    MODEL_VERSION,
    predictedWinnerId,
    predictedWinnerName,
    safeText(match.predictedSide),
    asInt(match.confidence, 0),
    safeText(match.predictedWinnerOdds || match.odds),
    match.modelEdge === undefined ? null : Number(match.modelEdge),
    JSON.stringify(match.predictionFactors || {})
  ).run();

  await db.prepare(`
    INSERT INTO prediction_outcomes (prediction_id, match_id, result_status)
    VALUES (?, ?, 'pending')
    ON CONFLICT(prediction_id) DO NOTHING
  `).bind(predictionId, matchId).run();

  return { matchId, predictionId, playerAId, playerBId };
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

function getMatchDate(row) {
  return String(row.start_time || "").slice(0, 10);
}

function datesAreClose(eventDate, matchDate, maxDays = 2) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) return true;
  const eventTime = Date.parse(`${eventDate}T00:00:00Z`);
  const matchTime = Date.parse(`${matchDate}T00:00:00Z`);
  if (!Number.isFinite(eventTime) || !Number.isFinite(matchTime)) return true;
  return Math.abs(eventTime - matchTime) <= maxDays * 86400000;
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

function eventCanSettlePrediction(event) {
  const type = String(event.event_type_type || event.league_name || event.event_name || "").toLowerCase();
  if (type.includes("doubles") || /itf|boys|girls|junior/.test(type)) return false;
  return Boolean(normalizeName(getApiTennisWinnerName(event)));
}

async function fetchOutcomeEvents(env, dates = []) {
  const eventFeeds = await Promise.all(
    dates.map((date) => fetchApiTennis(env, "get_fixtures", { date_start: date, date_stop: date }).catch(() => []))
  );
  const byId = new Map();
  for (const event of eventFeeds.flat()) {
    byId.set(eventSourceId(event), event);
  }
  return [...byId.values()];
}

function eventIsRecentFinished(event) {
  const date = getEventDate(event);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (date < todayIsoDate(-RECENT_MATCH_WINDOW_DAYS) || date > todayIsoDate()) return false;
  if (!eventIsTourSingles(event)) return false;
  return Boolean(getApiTennisWinnerName(event)) || Boolean(event.event_final_result);
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
  const opponent = opponentForEvent(event, player.key, player.name);
  if (!opponent.name || normalizeName(opponent.name) === normalizeName(player.name)) return null;
  const sourceEventId = eventSourceId(event);
  const won = playerWonEvent(event, player.key, player.name);
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
    safeText(player.key),
    player.tour,
    getEventDate(event),
    sourceEventId,
    safeText(event.tournament_name || event.league_name || event.event_name),
    safeText(event.event_type_type || event.surface),
    opponent.name,
    safeText(opponent.key),
    safeText(getApiTennisScore(event)),
    won ? "win" : "loss",
    safeText(event.event_status)
  );
}

function profileKey(profile) {
  return String(profile.player_key || profile.player_id || "");
}

function profileName(profile) {
  return profile.player_name || profile.player || profile.name || "";
}

function makeSeasonStatId(playerId, season, type) {
  return `${playerId}:${season || "unknown"}:${String(type || "singles").toLowerCase()}`;
}

function normalizeStatType(value = "") {
  const text = String(value || "singles").toLowerCase();
  return text.includes("double") ? "doubles" : "singles";
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
    safeText(player.key),
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

async function fetchPlayerProfiles(env, players) {
  const keyedPlayers = players.filter((player) => player?.playerKey).slice(0, PLAYER_PROFILE_SYNC_LIMIT);
  if (!keyedPlayers.length) return [];

  const allProfiles = await fetchApiTennis(env, "get_players").catch(() => []);
  if (allProfiles.length > 25) {
    const wanted = new Set(keyedPlayers.map((player) => String(player.playerKey)));
    return allProfiles.filter((profile) => wanted.has(profileKey(profile)));
  }

  const profiles = [];
  for (const player of keyedPlayers) {
    const rows = await fetchApiTennis(env, "get_players", { player_key: player.playerKey }).catch(() => []);
    if (rows?.[0]) profiles.push(rows[0]);
  }
  return profiles;
}

async function syncPlayerProfiles(db, env, livePlayers) {
  if (!env.API_TENNIS_KEY || !livePlayers?.length) return { profiles: 0, stats: 0 };
  const liveByKey = new Map(livePlayers.filter((player) => player?.playerKey).map((player) => [String(player.playerKey), player]));
  const profiles = await fetchPlayerProfiles(env, livePlayers);
  const statements = [];
  let profilesUpserted = 0;
  let statsUpserted = 0;

  for (const profile of profiles) {
    const key = profileKey(profile);
    const livePlayer = liveByKey.get(key);
    if (!key || !livePlayer) continue;
    const tour = livePlayer.tour || livePlayer.sex || "ATP";
    const name = livePlayer.name || profileName(profile);
    const playerId = makePlayerId(tour, name, key);

    statements.push(db.prepare(`
      UPDATE players
      SET player_bday = COALESCE(?, player_bday),
          player_logo = COALESCE(?, player_logo),
          country = COALESCE(?, country),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(safeText(profile.player_bday), safeText(profile.player_logo), safeText(profile.player_country), playerId));
    profilesUpserted += 1;

    for (const stat of profile.stats || []) {
      statements.push(seasonStatStatement(db, { id: playerId, key, tour }, stat));
      statsUpserted += 1;
    }
  }

  await runBatches(db, statements);
  return { profiles: profilesUpserted, stats: statsUpserted };
}

async function syncRecentPlayerMatches(db, env, syncedMatches) {
  if (!env.API_TENNIS_KEY || !syncedMatches.length) return 0;
  const players = [];
  const playerIds = new Set();
  for (const row of syncedMatches) {
    const match = row.match;
    if (match.doubles || !match.playerAKey || !match.playerBKey) continue;
    for (const player of [
      { id: row.playerAId, key: match.playerAKey, name: match.playerA, tour: match.tour },
      { id: row.playerBId, key: match.playerBKey, name: match.playerB, tour: match.tour },
    ]) {
      if (!player.id || !player.key || playerIds.has(player.id)) continue;
      playerIds.add(player.id);
      players.push(player);
      if (players.length >= RECENT_PLAYER_SYNC_LIMIT) break;
    }
    if (players.length >= RECENT_PLAYER_SYNC_LIMIT) break;
  }

  let inserted = 0;
  for (const player of players) {
    const fixtures = await fetchApiTennis(env, "get_fixtures", {
      player_key: player.key,
      date_start: todayIsoDate(-RECENT_MATCH_WINDOW_DAYS),
      date_stop: todayIsoDate(),
    });
    await db.prepare("DELETE FROM player_recent_matches WHERE player_id = ? AND match_date >= date('now', '-100 days')").bind(player.id).run();
    const statements = fixtures.map((event) => recentMatchStatement(db, player, event)).filter(Boolean);
    await runBatches(db, statements);
    inserted += statements.length;
  }

  return inserted;
}

async function settleOutcomes(db, env) {
  if (!env.API_TENNIS_KEY) return { settled: 0, eventCount: 0, finishedEventCount: 0, pendingCandidateCount: 0, matchedEventCount: 0 };
  const cleanup = await db.prepare(`
    UPDATE prediction_outcomes
    SET result_status = 'pending', correct = NULL, settled_at = NULL, updated_at = datetime('now')
    WHERE result_status = 'settled'
      AND (actual_winner_name IS NULL OR TRIM(actual_winner_name) = '')
  `).run();
  const pending = await db.prepare(`
    SELECT m.id, m.start_time, m.player_a_id, m.player_b_id, m.player_a_name, m.player_b_name, p.id AS prediction_id, p.predicted_winner_name
    FROM matches m
    JOIN predictions p ON p.match_id = m.id
    JOIN prediction_outcomes po ON po.prediction_id = p.id
    WHERE po.result_status = 'pending'
      AND (
        m.start_time IS NULL OR
        datetime(replace(substr(m.start_time, 1, 19), 'T', ' ')) <= datetime('now', '-3 hours')
      )
    ORDER BY COALESCE(m.start_time, p.created_at) ASC
    LIMIT 250
  `).all();
  const pendingRows = pending.results || [];
  const dates = [...new Set(pendingRows.map(getMatchDate).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].slice(0, 7);
  const events = await fetchOutcomeEvents(env, dates);
  const finishedEvents = events.filter(eventCanSettlePrediction);
  if (!finishedEvents.length) return { settled: 0, eventCount: events.length, finishedEventCount: 0, pendingCandidateCount: pendingRows.length, matchedEventCount: 0 };
  const finishedEventsByDate = new Map();
  for (const event of finishedEvents) {
    const date = getEventDate(event);
    if (!finishedEventsByDate.has(date)) finishedEventsByDate.set(date, []);
    finishedEventsByDate.get(date).push(event);
  }

  let settled = 0;
  let matchedEventCount = 0;
  const unmatchedStatements = [];
  for (const row of pendingRows) {
    const candidateEvents = finishedEventsByDate.get(getMatchDate(row)) || [];
    const matchEvent = candidateEvents.find((event) => {
      const first = normalizeName(event.event_first_player || event.first_player || "");
      const second = normalizeName(event.event_second_player || event.second_player || "");
      const a = normalizeName(row.player_a_name);
      const b = normalizeName(row.player_b_name);
      if (!datesAreClose(getEventDate(event), getMatchDate(row))) return false;
      return (namesMatch(first, a) && namesMatch(second, b)) || (namesMatch(first, b) && namesMatch(second, a));
    });
    if (!matchEvent) {
      if (getMatchDate(row) < todayIsoDate(-1)) {
        unmatchedStatements.push(db.prepare(`
          UPDATE prediction_outcomes
          SET result_status = 'unmatched', updated_at = datetime('now')
          WHERE prediction_id = ?
        `).bind(row.prediction_id));
      }
      continue;
    }
    matchedEventCount += 1;

    const actualWinnerName = getApiTennisWinnerName(matchEvent);
    const actualNormalized = normalizeName(actualWinnerName);
    const actualWinnerId = namesMatch(actualWinnerName, row.player_a_name) ? row.player_a_id : namesMatch(actualWinnerName, row.player_b_name) ? row.player_b_id : null;
    const correct = actualNormalized && namesMatch(actualWinnerName, row.predicted_winner_name) ? 1 : 0;
    const score = getApiTennisScore(matchEvent);

    await db.batch([
      db.prepare(`
        UPDATE matches
        SET status = 'Finished', live = 0, score = ?, winner_player_id = ?, winner_name = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(safeText(score), actualWinnerId, safeText(actualWinnerName), row.id),
      db.prepare(`
        UPDATE prediction_outcomes
        SET actual_winner_id = ?, actual_winner_name = ?, result_status = 'settled', correct = ?, score = ?, settled_at = datetime('now'), updated_at = datetime('now')
        WHERE prediction_id = ?
      `).bind(actualWinnerId, safeText(actualWinnerName), correct, safeText(score), row.prediction_id),
    ]);
    settled += 1;
  }
  await runBatches(db, unmatchedStatements);
  return {
    settled,
    eventCount: events.length,
    finishedEventCount: finishedEvents.length,
    pendingCandidateCount: pendingRows.length,
    matchedEventCount,
    unmatchedMarked: unmatchedStatements.length,
    badSettledReset: cleanup.meta?.changes || 0,
  };
}

async function syncDatabase(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ error: "Missing TENNIS_DB D1 binding" }, 500);
  if (!isAuthorized(request, env)) return jsonResponse({ error: "Unauthorized" }, 401);

  const db = env.TENNIS_DB;
  await db.prepare(`
    UPDATE sync_runs
    SET status = 'error',
        finished_at = datetime('now'),
        error = COALESCE(error, 'Sync exceeded Cloudflare execution window')
    WHERE status = 'running'
      AND started_at < datetime('now', '-10 minutes')
  `).run().catch(() => null);

  const runId = crypto.randomUUID();
  await db.prepare("INSERT INTO sync_runs (id, status) VALUES (?, 'running')").bind(runId).run();

  let playersUpserted = 0;
  let matchesUpserted = 0;
  let predictionsUpserted = 0;
  let outcomesSettled = 0;
  let recentMatchesUpserted = 0;
  let playerProfilesUpserted = 0;
  let playerSeasonStatsUpserted = 0;
  let outcomeSync = { settled: 0, eventCount: 0, finishedEventCount: 0, pendingCandidateCount: 0, matchedEventCount: 0 };

  try {
    const liveUrl = new URL("/api/live-data", request.url);
    liveUrl.searchParams.set("refresh", "1");
    liveUrl.searchParams.set("databaseSync", "1");
    liveUrl.searchParams.set("ts", Date.now().toString());
    const liveResponse = await fetch(liveUrl.href, { headers: { accept: "application/json" } });
    if (!liveResponse.ok) throw new Error(`live-data returned ${liveResponse.status}`);
    const liveData = await liveResponse.json();

    const existingPlayers = await db.prepare("SELECT id, tour, normalized_name FROM players").all();
    const playerIdByName = new Map((existingPlayers.results || []).map((player) => [`${player.tour}:${player.normalized_name}`, player.id]));
    const playerStatements = [];
    for (const player of liveData.players || []) {
      if (!player?.name || !["ATP", "WTA"].includes(player.tour || player.sex)) continue;
      const tour = player.tour || player.sex || "ATP";
      const key = `${tour}:${normalizeName(player.name)}`;
      if (!playerIdByName.has(key)) playerIdByName.set(key, makePlayerId(tour, player.name, player.playerKey));
      playerStatements.push(...buildPlayerStatements(db, player, playerIdByName.get(key)));
      playersUpserted += 1;
    }
    await runBatches(db, playerStatements);

    const profileSync = await syncPlayerProfiles(db, env, liveData.players || []);
    playerProfilesUpserted = profileSync.profiles;
    playerSeasonStatsUpserted = profileSync.stats;

    const syncedMatches = [];
    for (const match of liveData.matches || []) {
      if (!match?.playerA || !match?.playerB || !["ATP", "WTA"].includes(match.tour)) continue;
      const ids = await upsertMatchAndPrediction(db, match);
      syncedMatches.push({ match, ...ids });
      matchesUpserted += 1;
      predictionsUpserted += 1;
    }

    recentMatchesUpserted = await syncRecentPlayerMatches(db, env, syncedMatches);
    outcomeSync = await settleOutcomes(db, env);
    outcomesSettled = outcomeSync.settled;

    await db.prepare(`
      UPDATE sync_runs
      SET status = 'success', finished_at = datetime('now'), players_upserted = ?, matches_upserted = ?, predictions_upserted = ?, outcomes_settled = ?, message = ?
      WHERE id = ?
    `).bind(playersUpserted, matchesUpserted, predictionsUpserted, outcomesSettled, "Database sync completed", runId).run();
    await db.prepare("UPDATE sync_runs SET recent_matches_upserted = ? WHERE id = ?").bind(recentMatchesUpserted, runId).run().catch(() => null);
    await db.prepare("UPDATE sync_runs SET player_profiles_upserted = ?, player_season_stats_upserted = ? WHERE id = ?").bind(playerProfilesUpserted, playerSeasonStatsUpserted, runId).run().catch(() => null);

    return jsonResponse({ ok: true, runId, playersUpserted, matchesUpserted, predictionsUpserted, playerProfilesUpserted, playerSeasonStatsUpserted, recentMatchesUpserted, outcomesSettled, outcomeSync, diagnostics: { apiTennisKey: await secretFingerprint(env.API_TENNIS_KEY), apiTennisIssues: env.__apiTennisIssues || [] }, recentFormSource: "API-Tennis get_fixtures by player_key", playerProfileSource: "API-Tennis get_players", liveDataSource: liveData.source, errors: liveData.errors || [] });
  } catch (error) {
    await db.prepare("UPDATE sync_runs SET status = 'error', finished_at = datetime('now'), error = ? WHERE id = ?").bind(error.message, runId).run();
    return jsonResponse({ ok: false, runId, error: error.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  return syncDatabase(request, env);
}

export async function onRequestGet({ request, env }) {
  return syncDatabase(request, env);
}
