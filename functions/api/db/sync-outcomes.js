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
    .replace(/[^a-z\s/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  return status.includes("finish") || status.includes("ended") || Boolean(event.event_final_result);
}

function unorderedNameMatch(a1, b1, a2, b2) {
  const leftA = normalizeName(a1);
  const leftB = normalizeName(b1);
  const rightA = normalizeName(a2);
  const rightB = normalizeName(b2);
  if (!leftA || !leftB || !rightA || !rightB) return false;
  return (leftA === rightA && leftB === rightB) || (leftA === rightB && leftB === rightA);
}

function eventMatchesPrediction(event, prediction) {
  const first = getEventPlayer(event, "first").name;
  const second = getEventPlayer(event, "second").name;
  return unorderedNameMatch(first, second, prediction.player_a_name, prediction.player_b_name);
}

async function findStoredRecentOutcome(db, prediction, daysBack) {
  const rows = await db.prepare(`
    SELECT player_id, opponent_name, score, result, match_date
    FROM player_recent_matches
    WHERE match_date >= date('now', ?)
      AND (
        (player_id = ? AND LOWER(opponent_name) LIKE ?)
        OR (player_id = ? AND LOWER(opponent_name) LIKE ?)
      )
    ORDER BY match_date DESC
    LIMIT 10
  `).bind(
    `-${daysBack} days`,
    prediction.player_a_id,
    `%${normalizeName(prediction.player_b_name).replace(/ /g, "%")}%`,
    prediction.player_b_id,
    `%${normalizeName(prediction.player_a_name).replace(/ /g, "%")}%`
  ).all();

  for (const row of rows.results || []) {
    const isPlayerARecord = row.player_id === prediction.player_a_id;
    const expectedOpponent = isPlayerARecord ? prediction.player_b_name : prediction.player_a_name;
    if (normalizeName(row.opponent_name) !== normalizeName(expectedOpponent)) continue;
    const winnerName = row.result === "win"
      ? (isPlayerARecord ? prediction.player_a_name : prediction.player_b_name)
      : (isPlayerARecord ? prediction.player_b_name : prediction.player_a_name);
    const winnerId = normalizeName(winnerName) === normalizeName(prediction.player_a_name) ? prediction.player_a_id : prediction.player_b_id;
    return { winnerName, winnerId, score: row.score, source: "player_recent_matches" };
  }

  return null;
}

async function findPlayerFixtureOutcome(env, prediction, daysBack) {
  const playerKey = prediction.player_a_key || prediction.player_b_key;
  if (!playerKey) return null;

  const fixtures = await fetchApiTennis(env, "get_fixtures", {
    player_key: playerKey,
    date_start: todayIsoDate(-daysBack),
    date_stop: todayIsoDate(),
  });

  const event = fixtures.filter(isFinishedEvent).find((candidate) => eventMatchesPrediction(candidate, prediction));
  if (!event) return null;

  const actualWinnerName = getApiTennisWinnerName(event);
  const actualNormalized = normalizeName(actualWinnerName);
  return {
    winnerName: actualWinnerName,
    winnerId: actualNormalized === normalizeName(prediction.player_a_name) ? prediction.player_a_id : actualNormalized === normalizeName(prediction.player_b_name) ? prediction.player_b_id : null,
    score: getApiTennisScore(event),
    source: "api-tennis-player-fixtures",
  };
}

async function settlePrediction(db, prediction, outcome) {
  const actualNormalized = normalizeName(outcome.winnerName);
  const predictedNormalized = normalizeName(prediction.predicted_winner_name);
  const isCorrect = actualNormalized && actualNormalized === predictedNormalized ? 1 : 0;

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
  const daysBack = Math.min(Math.max(Number.parseInt(url.searchParams.get("days") || "14", 10), 1), 30);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") || "75", 10), 1), 150);
  const db = env.TENNIS_DB;

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
    ORDER BY p.created_at ASC
    LIMIT ?
  `).bind(limit).all();

  const predictions = pending.results || [];
  if (!predictions.length) {
    return jsonResponse({ ok: true, checked: 0, settled: 0, correct: 0, missed: [] });
  }

  const events = await fetchApiTennis(env, "get_fixtures", {
    date_start: todayIsoDate(-daysBack),
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

    if (outcome) {
      settledFromRecentMatches += 1;
    } else {
      const event = finishedEvents.find((candidate) => eventMatchesPrediction(candidate, prediction));
      if (event) {
        const actualWinnerName = getApiTennisWinnerName(event);
        const actualNormalized = normalizeName(actualWinnerName);
        outcome = {
          winnerName: actualWinnerName,
          winnerId: actualNormalized === normalizeName(prediction.player_a_name) ? prediction.player_a_id : actualNormalized === normalizeName(prediction.player_b_name) ? prediction.player_b_id : null,
          score: getApiTennisScore(event),
          source: "api-tennis-fixtures",
        };
        settledFromFixtures += 1;
      } else {
        outcome = await findPlayerFixtureOutcome(env, prediction, daysBack);
        if (outcome) settledFromPlayerFixtures += 1;
      }
    }

    if (!outcome) {
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
