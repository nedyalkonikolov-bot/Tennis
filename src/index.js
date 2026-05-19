#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { generateAndSelectPost } from "./postGenerator.js";
import { checkPostingRules } from "./scheduler.js";
import { JsonPostStorage } from "./storage.js";
import { publishThread } from "./threadsClient.js";

function parseArgs(argv) {
  const args = { dryRun: false, match: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") args.dryRun = true;
    else if (value === "--match") args.match = argv[index + 1];
    else if (value.startsWith("--match=")) args.match = value.slice("--match=".length);
  }
  return args;
}

async function loadDotEnv(filePath = ".env") {
  try {
    const raw = await readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (!process.env[key]) process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function loadMatchData(args, env) {
  if (args.match) return JSON.parse(args.match);
  const path = env.MATCH_DATA_PATH || "./match-data.json";
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {
      tournament: "ATP Rome",
      surface: "clay",
      player1: "Carlos Alcaraz",
      player2: "Jannik Sinner",
      score: "upcoming",
      stats: {
        break_points: "Both players create pressure in return games",
        first_serve_percentage: "Both usually protect serve well",
        recent_form: "Two elite players with strong recent form",
      },
      prediction: {
        lean: "Over 22.5 games",
        confidence: "medium",
        reason: "Both players hold serve well on clay",
      },
    };
  }
}

function intEnv(env, key, fallback) {
  const value = Number.parseInt(env[key], 10);
  return Number.isFinite(value) ? value : fallback;
}

async function main() {
  await loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const env = process.env;
  const livePosting = env.LIVE_POSTING === "true" && !args.dryRun;
  const matchData = await loadMatchData(args, env);
  const storage = new JsonPostStorage(env.POST_STORAGE_PATH);
  const state = await storage.read();

  const generated = await generateAndSelectPost({ env, matchData });
  const rules = checkPostingRules({
    posts: state.posts,
    text: generated.selected.text,
    maxPostsPerDay: intEnv(env, "MAX_POSTS_PER_DAY", 6),
    maxLinkPostsPerDay: intEnv(env, "MAX_LINK_POSTS_PER_DAY", 1),
    minIntervalMinutes: intEnv(env, "MIN_POST_INTERVAL_MINUTES", 90),
  });

  let publishResult = { dryRun: true, ok: false, reason: "LIVE_POSTING is not true." };
  if (livePosting && rules.ok) {
    publishResult = await publishThread({
      userId: env.THREADS_USER_ID,
      accessToken: env.THREADS_ACCESS_TOKEN,
      text: generated.selected.text,
    });
  } else if (livePosting && !rules.ok) {
    publishResult = { ok: false, skipped: true, reasons: rules.reasons };
  }

  const record = {
    timestamp: new Date().toISOString(),
    livePosting,
    matchMetadata: matchData,
    generatedVariants: generated.variants,
    selectedPost: generated.selected.text,
    selectedType: generated.selected.type,
    score: generated.selected.score,
    scoreReasons: generated.selected.reasons,
    rules,
    publishResult,
    source: generated.source,
    generationError: generated.generationError,
  };

  await storage.appendPost(record);
  console.log(JSON.stringify(record, null, 2));

  if (livePosting && !publishResult.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
