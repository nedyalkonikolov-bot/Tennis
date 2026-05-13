const fs = require("fs");

const path = "functions/api/db/sync.js";
let text = fs.readFileSync(path, "utf8");

if (!text.includes("const PLAYER_PROFILE_SYNC_LIMIT")) {
  text = text.replace("const RECENT_PLAYER_SYNC_LIMIT = 40;\n", "const RECENT_PLAYER_SYNC_LIMIT = 40;\nconst PLAYER_PROFILE_SYNC_LIMIT = 180;\n");
}

const helper = String.raw`
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
`;

if (!text.includes("async function syncPlayerProfiles")) {
  text = text.replace("\nasync function syncRecentPlayerMatches", helper + "\nasync function syncRecentPlayerMatches");
}

if (!text.includes("let playerProfilesUpserted = 0;")) {
  text = text.replace(
    "  let recentMatchesUpserted = 0;\n",
    "  let recentMatchesUpserted = 0;\n  let playerProfilesUpserted = 0;\n  let playerSeasonStatsUpserted = 0;\n"
  );
}

if (!text.includes("const profileSync = await syncPlayerProfiles")) {
  text = text.replace(
    "    await runBatches(db, playerStatements);\n\n    const syncedMatches = [];",
    "    await runBatches(db, playerStatements);\n\n    const profileSync = await syncPlayerProfiles(db, env, liveData.players || []);\n    playerProfilesUpserted = profileSync.profiles;\n    playerSeasonStatsUpserted = profileSync.stats;\n\n    const syncedMatches = [];"
  );
}

if (!text.includes("playerProfileSource: \"API-Tennis get_players\"")) {
  text = text.replace(
    "    await db.prepare(\"UPDATE sync_runs SET recent_matches_upserted = ? WHERE id = ?\").bind(recentMatchesUpserted, runId).run().catch(() => null);\n\n    return jsonResponse({ ok: true, runId, playersUpserted, matchesUpserted, predictionsUpserted, recentMatchesUpserted, outcomesSettled, recentFormSource: \"API-Tennis get_fixtures by player_key\", liveDataSource: liveData.source, errors: liveData.errors || [] });",
    "    await db.prepare(\"UPDATE sync_runs SET recent_matches_upserted = ? WHERE id = ?\").bind(recentMatchesUpserted, runId).run().catch(() => null);\n    await db.prepare(\"UPDATE sync_runs SET player_profiles_upserted = ?, player_season_stats_upserted = ? WHERE id = ?\").bind(playerProfilesUpserted, playerSeasonStatsUpserted, runId).run().catch(() => null);\n\n    return jsonResponse({ ok: true, runId, playersUpserted, matchesUpserted, predictionsUpserted, playerProfilesUpserted, playerSeasonStatsUpserted, recentMatchesUpserted, outcomesSettled, recentFormSource: \"API-Tennis get_fixtures by player_key\", playerProfileSource: \"API-Tennis get_players\", liveDataSource: liveData.source, errors: liveData.errors || [] });"
  );
}

fs.writeFileSync(path, text);
