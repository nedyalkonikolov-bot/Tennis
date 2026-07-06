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

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hashPassword(password, salt = null, iterations = 120000) {
  const saltBytes = salt ? fromBase64Url(salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations }, key, 256);
  return `pbkdf2_sha256$${iterations}$${base64Url(saltBytes)}$${base64Url(new Uint8Array(bits))}`;
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createMemberToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const value = base64Url(bytes);
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
        last_seen_at TEXT,
        password_hash TEXT,
        password_updated_at TEXT
      )
    `),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_members_status ON members(status, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_members_token_hash ON members(token_hash)"),
  ]);
  await db.prepare("ALTER TABLE members ADD COLUMN password_hash TEXT").run().catch(() => null);
  await db.prepare("ALTER TABLE members ADD COLUMN password_updated_at TEXT").run().catch(() => null);
}

async function register(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim().slice(0, 120);
  const password = String(body.password || "");
  const accepted = Boolean(body.accepted);

  if (!isValidEmail(email)) return jsonResponse({ ok: false, error: "Enter a valid email address." }, 400);
  if (password.length < 8) return jsonResponse({ ok: false, error: "Password must be at least 8 characters." }, 400);
  if (!accepted) return jsonResponse({ ok: false, error: "You must confirm you are 18+ and accept responsible-use terms." }, 400);

  const db = env.TENNIS_DB;
  await ensureMembersTable(db);

  const existing = await db.prepare("SELECT id, email, status, created_at, password_hash FROM members WHERE email = ?").bind(email).first();
  if (existing) {
    return jsonResponse({
      ok: false,
      alreadyRegistered: true,
      member: { id: existing.id, email: existing.email, status: existing.status, created_at: existing.created_at },
      error: existing.password_hash ? "This email is already registered. Please log in." : "This email exists without a password. Ask the admin to reset access.",
    }, 409);
  }

  const token = createMemberToken();
  const tokenHash = await hashToken(token);
  const passwordHash = await hashPassword(password);
  const member = {
    id: crypto.randomUUID(),
    email,
    name,
    status: "active",
  };

  await db.prepare(`
    INSERT INTO members (id, email, name, token_hash, password_hash, password_updated_at, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), 'active', 'self-register', datetime('now'), datetime('now'))
  `).bind(member.id, email, name || null, tokenHash, passwordHash).run();

  return jsonResponse({
    ok: true,
    member,
    token,
    message: "Registration complete. You are signed in on this browser.",
  });
}

export async function onRequestPost({ request, env }) {
  try {
    return await register(request, env);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}
