const TENNIS_API_BASE = "https://api.api-tennis.com/tennis/";
const PLAYER_CACHE_KEY = "players:standings:v1";
const PLAYER_LIMIT = 500;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function asNumber(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePlayer(player, tour) {
  const rank = asNumber(player.place || player.player_place || player.rank || player.standing_place, 999);
  const points = asNumber(player.points, 0);
  const name = player.player || player.player_name || player.name || "Unknown player";
  const playerKey = String(player.player_key || player.player_id || "");
  const seed = rank === 999 ? name.length : rank;
  return {
    id: playerKey || `${tour}-${name}`,
    playerKey,
    name,
    sex: tour,
    tour,
    rank,
    points,
    country: player.country || player.player_country || "",
    movement: player.movement || "same",
    form: Math.max(52, 96 - Math.min(seed, 44)),
    hold: 65 + (seed % 28),
    breakRate: 18 + (seed % 24),
    clay: 62 + ((seed + 9) % 32),
    hard: 62 + ((seed + 17) % 32),
    grass: 58 + ((seed + 23) % 30),
    trend: player.movement === "up" ? "+" : player.movement === "down" ? "-" : "0",
  };
}

async function fetchApiTennis(env, method, params = {}) {
  if (!env.API_TENNIS_KEY) throw new Error("missing API_TENNIS_KEY");
  const url = new URL(TENNIS_API_BASE);
  url.searchParams.set("method", method);
  url.searchParams.set("APIkey", env.API_TENNIS_KEY);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${method} returned ${response.status}`);
  const payload = await response.json();
  if (payload.success === 0) throw new Error(payload.error || `${method} returned no success flag`);
  return payload.result ?? [];
}

function getPlayerCache(env) {
  return env.TENNIS_PLAYERS_CACHE || env.PLAYER_STATS_KV || env.PLAYERS_KV || null;
}

function isAuthorized(request, env) {
  if (!env.PLAYER_REFRESH_SECRET) return false;
  const url = new URL(request.url);
  return request.headers.get("x-refresh-secret") === env.PLAYER_REFRESH_SECRET || url.searchParams.get("secret") === env.PLAYER_REFRESH_SECRET;
}

export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) return jsonResponse({ error: "unauthorized" }, 401);
  const cache = getPlayerCache(env);
  if (!cache) return jsonResponse({ error: "missing TENNIS_PLAYERS_CACHE KV binding" }, 500);

  const [atp, wta] = await Promise.all([
    fetchApiTennis(env, "get_standings", { event_type: "ATP" }),
    fetchApiTennis(env, "get_standings", { event_type: "WTA" }),
  ]);
  const players = [
    ...(atp || []).slice(0, PLAYER_LIMIT).map((player) => normalizePlayer(player, "ATP")),
    ...(wta || []).slice(0, PLAYER_LIMIT).map((player) => normalizePlayer(player, "WTA")),
  ];
  const updatedAt = new Date().toISOString();
  await cache.put(PLAYER_CACHE_KEY, JSON.stringify({ updatedAt, players }), { expirationTtl: 3 * 24 * 60 * 60 });

  return jsonResponse({ ok: true, updatedAt, playerCount: players.length, atpCount: Math.min((atp || []).length, PLAYER_LIMIT), wtaCount: Math.min((wta || []).length, PLAYER_LIMIT) });
}

export async function onRequestGet(context) {
  return onRequestPost(context);
}
