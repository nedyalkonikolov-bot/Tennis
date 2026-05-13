const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const MODEL_VERSION = "v1";

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

function buildPlayerStatements(db, player) {
  const tour = player.tour || player.sex || "ATP";
  const id = makePlayerId(tour, player.name, player.playerKey);
  const normalizedName = normalizeName(player.name);
  const snapshotDate = todayIsoDate();

  return [
    db.prepare(`
      INSERT INTO players (
        id, player_key, name, normalized_name, tour, country, current_rank, points, movement,
        form_rating, hold_rate, break_rate, clay_rating, hard_rating, grass_rating, source, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        player_key = excluded.player_key,
        name = excluded.name,
        normalized_name = excluded.normalized_name,
        tour = excluded.tour,
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

async function ensureMatchPlayer(db, name, tour) {
  if (!name) return null;
  const normalized = normalizeName(name);
  const found = await db.prepare("SELECT id FROM players WHERE tour = ? AND normalized_name = ? LIMIT 1").bind(tour, normalized).first();
  if (found?.id) return found.id;
  const id = makePlayerId(tour, name);
  await db.prepare(`
    INSERT INTO players (id, name, normalized_name, tour, source, updated_at)
    VALUES (?, ?, ?, ?, 'match-sync', datetime('now'))
    ON CONFLICT(id) DO NOTHING
  `).bind(id, name, normalized, tour).run();
  return id;
}

async function upsertMatchAndPrediction(db, match) {
  const tour = match.tour === "WTA" ? "WTA" : "ATP";
  const source = match.oddsSource === "Cloudbet" ? "cloudbet" : "live-data";
  const matchId = makeMatchId(source, match.id);
  const playerAId = await ensureMatchPlayer(db, match.playerA, tour);
  const playerBId = await ensureMatchPlayer(db, match.playerB, tour);

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
    safeText(match.startTime),
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

  return { matchId, predictionId };
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

async function settleOutcomes(db, env) {
  if (!env.API_TENNIS_KEY) return 0;
  const events = await fetchApiTennis(env, "get_events", { date_start: todayIsoDate(-14), date_stop: todayIsoDate() });
  const finishedEvents = events.filter((event) => String(event.event_status || "").toLowerCase().includes("finished") || event.event_final_result);
  if (!finishedEvents.length) return 0;

  const pending = await db.prepare(`
    SELECT m.id, m.player_a_id, m.player_b_id, m.player_a_name, m.player_b_name, p.id AS prediction_id, p.predicted_winner_name
    FROM matches m
    JOIN predictions p ON p.match_id = m.id
    JOIN prediction_outcomes po ON po.prediction_id = p.id
    WHERE po.result_status = 'pending'
    ORDER BY p.created_at DESC
    LIMIT 250
  `).all();

  let settled = 0;
  for (const row of pending.results || []) {
    const matchEvent = finishedEvents.find((event) => {
      const first = normalizeName(event.event_first_player || event.first_player || "");
      const second = normalizeName(event.event_second_player || event.second_player || "");
      const a = normalizeName(row.player_a_name);
      const b = normalizeName(row.player_b_name);
      return (first === a && second === b) || (first === b && second === a);
    });
    if (!matchEvent) continue;

    const actualWinnerName = getApiTennisWinnerName(matchEvent);
    const actualNormalized = normalizeName(actualWinnerName);
    const actualWinnerId = actualNormalized === normalizeName(row.player_a_name) ? row.player_a_id : actualNormalized === normalizeName(row.player_b_name) ? row.player_b_id : null;
    const correct = actualNormalized && actualNormalized === normalizeName(row.predicted_winner_name) ? 1 : 0;
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
  return settled;
}

async function syncDatabase(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ error: "Missing TENNIS_DB D1 binding" }, 500);
  if (!isAuthorized(request, env)) return jsonResponse({ error: "Unauthorized" }, 401);

  const db = env.TENNIS_DB;
  const runId = crypto.randomUUID();
  await db.prepare("INSERT INTO sync_runs (id, status) VALUES (?, 'running')").bind(runId).run();

  let playersUpserted = 0;
  let matchesUpserted = 0;
  let predictionsUpserted = 0;
  let outcomesSettled = 0;

  try {
    const liveUrl = new URL("/api/live-data", request.url);
    liveUrl.searchParams.set("databaseSync", "1");
    liveUrl.searchParams.set("ts", Date.now().toString());
    const liveResponse = await fetch(liveUrl.href, { headers: { accept: "application/json" } });
    if (!liveResponse.ok) throw new Error(`live-data returned ${liveResponse.status}`);
    const liveData = await liveResponse.json();

    const playerStatements = [];
    for (const player of liveData.players || []) {
      if (!player?.name || !["ATP", "WTA"].includes(player.tour || player.sex)) continue;
      playerStatements.push(...buildPlayerStatements(db, player));
      playersUpserted += 1;
    }
    await runBatches(db, playerStatements);

    for (const match of liveData.matches || []) {
      if (!match?.playerA || !match?.playerB || !["ATP", "WTA"].includes(match.tour)) continue;
      await upsertMatchAndPrediction(db, match);
      matchesUpserted += 1;
      predictionsUpserted += 1;
    }

    outcomesSettled = await settleOutcomes(db, env);

    await db.prepare(`
      UPDATE sync_runs
      SET status = 'success', finished_at = datetime('now'), players_upserted = ?, matches_upserted = ?, predictions_upserted = ?, outcomes_settled = ?, message = ?
      WHERE id = ?
    `).bind(playersUpserted, matchesUpserted, predictionsUpserted, outcomesSettled, "Database sync completed", runId).run();

    return jsonResponse({ ok: true, runId, playersUpserted, matchesUpserted, predictionsUpserted, outcomesSettled, liveDataSource: liveData.source, errors: liveData.errors || [] });
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
