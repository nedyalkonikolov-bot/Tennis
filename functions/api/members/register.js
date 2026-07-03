function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createMemberToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const value = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `ttz_${value}`;
}

async function ensureMembersTable(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        token_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        source TEXT NOT NULL DEFAULT 'self-register',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen_at TEXT
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_members_status ON members(status, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_members_token_hash ON members(token_hash)"),
  ]);
}

async function register(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim().slice(0, 120);
  const accepted = Boolean(body.accepted);

  if (!isValidEmail(email)) return jsonResponse({ ok: false, error: "Enter a valid email address." }, 400);
  if (!accepted) return jsonResponse({ ok: false, error: "You must confirm you are 18+ and accept responsible-use terms." }, 400);

  const db = env.TENNIS_DB;
  await ensureMembersTable(db);

  const existing = await db.prepare("SELECT id, email, status, created_at FROM members WHERE email = ?").bind(email).first();
  if (existing) {
    return jsonResponse({
      ok: true,
      alreadyRegistered: true,
      member: existing,
      message: "This email is already registered. Use the member token saved in this browser, or ask the admin to reset access.",
    });
  }

  const token = createMemberToken();
  const tokenHash = await hashToken(token);
  const member = {
    id: crypto.randomUUID(),
    email,
    name,
    status: "active",
  };

  await db.prepare(`
    INSERT INTO members (id, email, name, token_hash, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', 'self-register', datetime('now'), datetime('now'))
  `).bind(member.id, email, name || null, tokenHash).run();

  return jsonResponse({
    ok: true,
    member,
    token,
    message: "Registration complete. Your member token is shown once and has also been saved in this browser.",
  });
}

export async function onRequestPost({ request, env }) {
  try {
    return await register(request, env);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}
