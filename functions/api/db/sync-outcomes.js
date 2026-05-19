const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";

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
    .replace(/&/g, " and ")
    .replace(/[^a-z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(value) {
  return normalizeName(value).split(" ").filter((token) => token.length > 1);
}

function looseNameMatch(left, right) {
  const leftNorm = normalizeName(left);
  const rightNorm = normalizeName(right);
  if (!leftNorm || !rightNorm) return false;
  if (leftNorm === rightNorm) return true;
  if (leftNorm.includes(rightNorm) || rightNorm.includes(leftNorm)) return true;

  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);
  if (!leftTokens.length || !rightTokens.length) return false;

  const leftSurname = leftTokens[0];
  const rightSurname = rightTokens[rightTokens.length - 1];
  if (leftSurname === rightSurname) return true;

  return leftTokens.some((token) => token.length >= 4 && rightTokens.includes(token));
}

function safeText(value) {
  return value === undefined || value === null || value === "" ? null : String(value);
}

function todayIsoDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isoDateFromValue(value, fallbackOffsetDays = 0) {
  const parsed = value ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return todayIsoDate(fallbackOffsetDays);
}

function shiftIsoDate(value, offsetDays = 0) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return todayIsoDate(offsetDays);
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
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload.result) ? payload.result : [];
}

function getEventPlayer(event, side) {
  const prefix = side === "first" ? "first" : "second";
  return {
    name: event[`event_${prefix}_player`] || event[`${prefix}_player`] || "",
    key: String(event[`${prefix}_player_key`] || event[`event_${prefix}_player_key`] || ""),
  };
}

function getApiTennisWinnerName(event) {
  const winner = String(event.event_winner || "").toLowerCase();
  if (winner.includes("first")) return getEventPlayer(event, "first").name;
  if (winner.includes("second")) return getEventPlayer(event, "second").name;
  return event.event_winner || "";
}

function getApiTennisScore(event) {
  return event.event_final_result || event.event_game_result || event.event_status || "";
}

function isFinishedEvent(event) {
  const status = String(event.event_status || "").toLowerCase();
  const finalResult = String(event.event_final_result || "").trim();
  const hasRealFinalResult = /\d/.test(finalResult) && !/^[-\s]+$/.test(finalResult);
  const hasWinner = Boolean(normalizeName(getApiTennisWinnerName(event)));
  return hasWinner && (status.includes("finish") || status.includes("ended") || hasRealFinalResult);
}

function unorderedNameMatch(a1, b1, a2, b2) {
  return (looseNameMatch(a1, a2) && looseNameMatch(b1, b2)) || (looseNameMatch(a1, b2) && looseNameMatch(b1, a2));
}

function eventMatchesPrediction(event, prediction) {
  const first = getEventPlayer(event, "first").name;
  const second = getEventPlayer(event, "second").name;
  return unorderedNameMatch(first, second, prediction.player_a_name, prediction.player_b_name);
}

function predictionWinnerId(prediction, winnerName) {
  if (looseNameMatch(winnerName, prediction.player_a_name)) return prediction.player_a_id;
  if (looseNameMatch(winnerName, prediction.player_b_name)) return prediction.player_b_id;
  return null;
}

function outcomeMatchesPrediction(outcome, prediction) {
  return looseNameMatch(outcome?.winnerName, prediction.player_a_name) || looseNameMatch(outcome?.winnerName, prediction.player_b_name);
}

function isUsableOutcome(outcome) {
  return Boolean(outcome && normalizeName(outcome.winnerName));
}

async function repairEmptySettlements(db) {
  const repaired = await db.prepare(`
    UPDATE prediction_outcomes
    SET actual_winner_id = NULL,
        actual_winner_name = NULL,
        result_status = 'pending',
        correct = NULL,
        score = NULL,
        settled_at = NULL,
        updated_at = datetime('now')
    WHERE result_status = 'settled'
      AND (actual_winner_name IS NULL OR TRIM(actual_winner_name) = '')
  `).run();

  await db.prepare(`
    UPDATE matches
    SET status = 'Scheduled', live = 0, score = NULL, winner_player_id = NULL, winner_name = NULL, updated_at = datetime('now')
    WHERE winner_name IS NULL
      AND (score IS NULL OR TRIM(score) = '-' OR TRIM(score) = '')
      AND id IN (
        SELECT match_id FROM prediction_outcomes
        WHERE result_status = 'pending'
          AND actual_winner_name IS NULL
      )
  `).run();

  return repaired.meta?.changes || 0;
}

async function findStoredRecentOutcome(db, prediction, daysBack) {
  const matchDate = isoDateFromValue(prediction.start_time, -daysBack);
  const dateStart = shiftIsoDate(matchDate, -3);
  const dateStop = shiftIsoDate(matchDate, 3);
  const rows = await db.prepare(`
    SELECT player_id, opponent_name, score, result, match_date
    FROM player_recent_matches
    WHERE match_date BETWEEN ? AND ?
      AND player_id IN (?, ?)
    ORDER BY match_date DESC
    LIMIT 50
  `).bind(dateStart, dateStop, prediction.player_a_id, prediction.player_b_id).all();

  for (const row of rows.results || []) {
    const isPlayerARecord = row.player_id === prediction.player_a_id;
    const expectedOpponent = isPlayerARecord ? prediction.player_b_name : prediction.player_a_name;
    if (!looseNameMatch(row.opponent_name, expectedOpponent)) continue;
    const winnerName = row.result === "win"
      ? (isPlayerARecord ? prediction.player_a_name : prediction.player_b_name)
      : (isPlayerARecord ? prediction.player_b_name : prediction.player_a_name);
    return { winnerName, winnerId: predictionWinnerId(prediction, winnerName), score: row.score, source: "player_recent_matches" };
  }

  return null;
}

async function findPlayerFixtureOutcome(env, prediction, daysBack) {
  const playerKey = prediction.player_a_key || prediction.player_b_key;
  if (!playerKey) return null;
  const matchDate = isoDateFromValue(prediction.start_time, -daysBack);

  const fixtures = await fetchApiTennis(env, "get_fixtures", {
    player_key: playerKey,
    date_start: shiftIsoDate(matchDate, -3),
    date_stop: shiftIsoDate(matchDate, 3),
  });

  const event = fixtures.filter(isFinishedEvent).find((candidate) => eventMatchesPrediction(candidate, prediction));
  if (!event) return null;

  const actualWinnerName = getApiTennisWinnerName(event);
  return {
    winnerName: actualWinnerName,
    winnerId: predictionWinnerId(prediction, actualWinnerName),
    score: getApiTennisScore(event),
    source: "api-tennis-player-fixtures",
  };
}

async function settlePrediction(db, prediction, outcome) {
  const isCorrect = looseNameMatch(outcome.winnerName, prediction.predicted_winner_name) ? 1 : 0;

  await db.batch([
    db.prepare(`
      UPDATE matches
      SET status = 'Finished', live = 0, score = ?, winner_player_id = ?, winner_name = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(safeText(outcome.score), outcome.winnerId, safeText(outcome.winnerName), prediction.match_id),
    db.prepare(`
      UPDATE prediction_outcomes
      SET actual_winner_id = ?, actual_winner_name = ?, result_status = 'settled', correct = ?, score = ?, settled_at = datetime('now'), updated_at = datetime('now')
      WHERE prediction_id = ?
    `).bind(outcome.winnerId, safeText(outcome.winnerName), isCorrect, safeText(outcome.score), prediction.prediction_id),
  ]);

  return isCorrect;
}

async function syncOutcomes(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ error: "Missing TENNIS_DB D1 binding" }, 500);
  if (!isAuthorized(request, env)) return jsonResponse({ error: "Unauthorized" }, 401);
  if (!env.API_TENNIS_KEY) return jsonResponse({ error: "Missing API_TENNIS_KEY" }, 500);

  const url = new URL(request.url);
  const daysBack = Math.min(Math.max(Number.parseInt(url.searchParams.get("days") || "120", 10), 1), 365);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "20", 10), 1), 30);
  const db = env.TENNIS_DB;
  const repairedEmptySettlements = await repairEmptySettlements(db);

  const pending = await db.prepare(`
    SELECT
      p.id AS prediction_id,
      p.predicted_winner_name,
      m.id AS match_id,
      m.tour,
      m.tournament,
      m.start_time,
      m.player_a_id,
      m.player_b_id,
      m.player_a_name,
      m.player_b_name,
      pa.player_key AS player_a_key,
      pb.player_key AS player_b_key
    FROM prediction_outcomes po
    JOIN predictions p ON p.id = po.prediction_id
    JOIN matches m ON m.id = po.match_id
    LEFT JOIN players pa ON pa.id = m.player_a_id
    LEFT JOIN players pb ON pb.id = m.player_b_id
    WHERE po.result_status = 'pending'
      AND datetime(COALESCE(m.start_time, p.created_at)) >= datetime('now', ?)
    ORDER BY p.created_at ASC
    LIMIT ?
  `).bind(`-${daysBack} days`, limit).all();

  const predictions = pending.results || [];
  if (!predictions.length) {
    return jsonResponse({ ok: true, checked: 0, settled: 0, correct: 0, repairedEmptySettlements, missed: [] });
  }

  const globalDaysBack = Math.min(daysBack, 30);
  const events = await fetchApiTennis(env, "get_fixtures", {
    date_start: todayIsoDate(-globalDaysBack),
    date_stop: todayIsoDate(),
  });
  const finishedEvents = events.filter(isFinishedEvent);
  let settled = 0;
  let correct = 0;
  let settledFromRecentMatches = 0;
  let settledFromFixtures = 0;
  let settledFromPlayerFixtures = 0;
  const missed = [];

  for (const prediction of predictions) {
    let outcome = await findStoredRecentOutcome(db, prediction, daysBack);

    if (isUsableOutcome(outcome) && outcomeMatchesPrediction(outcome, prediction)) {
      settledFromRecentMatches += 1;
    } else {
      const event = finishedEvents.find((candidate) => eventMatchesPrediction(candidate, prediction));
      if (event) {
        const actualWinnerName = getApiTennisWinnerName(event);
        outcome = {
          winnerName: actualWinnerName,
          winnerId: predictionWinnerId(prediction, actualWinnerName),
          score: getApiTennisScore(event),
          source: "api-tennis-fixtures",
        };
        if (isUsableOutcome(outcome) && outcomeMatchesPrediction(outcome, prediction)) settledFromFixtures += 1;
      }

      if (!isUsableOutcome(outcome) || !outcomeMatchesPrediction(outcome, prediction)) {
        outcome = await findPlayerFixtureOutcome(env, prediction, daysBack);
        if (isUsableOutcome(outcome) && outcomeMatchesPrediction(outcome, prediction)) settledFromPlayerFixtures += 1;
      }
    }

    if (!isUsableOutcome(outcome) || !outcomeMatchesPrediction(outcome, prediction)) {
      missed.push({ prediction_id: prediction.prediction_id, match_id: prediction.match_id, title: `${prediction.player_a_name} vs ${prediction.player_b_name}` });
      continue;
    }

    const isCorrect = await settlePrediction(db, prediction, outcome);
    settled += 1;
    correct += isCorrect;
  }

  return jsonResponse({
    ok: true,
    source: "player_recent_matches plus API-Tennis fixture fallbacks",
    daysBack,
    checked: predictions.length,
    finishedEvents: finishedEvents.length,
    settled,
    correct,
    repairedEmptySettlements,
    settledFromRecentMatches,
    settledFromFixtures,
    settledFromPlayerFixtures,
    missed: missed.slice(0, 50),
  });
}

export async function onRequestPost({ request, env }) {
  return syncOutcomes(request, env);
}

export async function onRequestGet({ request, env }) {
  return syncOutcomes(request, env);
}
