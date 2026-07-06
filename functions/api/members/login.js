function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt, iterations) {
  const saltBytes = fromBase64Url(salt);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations }, key, 256);
  return base64Url(new Uint8Array(bits));
}

async function verifyPassword(password, storedHash = "") {
  const [scheme, iterationText, salt, expected] = String(storedHash).split("$");
  const iterations = Number.parseInt(iterationText, 10);
  if (scheme !== "pbkdf2_sha256" || !iterations || !salt || !expected) return false;
  const actual = await hashPassword(password, salt, iterations);
  return actual === expected;
}

function createMemberToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `ttz_${base64Url(bytes)}`;
}

async function login(request, env) {
  if (!env.TENNIS_DB) return jsonResponse({ ok: false, error: "Missing TENNIS_DB D1 binding" }, 500);
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!email || !password) return jsonResponse({ ok: false, error: "Email and password are required." }, 400);

  const member = await env.TENNIS_DB.prepare("SELECT id, email, name, status, password_hash FROM members WHERE email = ?").bind(email).first();
  if (!member || member.status !== "active" || !member.password_hash) return jsonResponse({ ok: false, error: "Invalid email or password." }, 401);
  const ok = await verifyPassword(password, member.password_hash);
  if (!ok) return jsonResponse({ ok: false, error: "Invalid email or password." }, 401);

  const token = createMemberToken();
  const tokenHash = await hashToken(token);
  await env.TENNIS_DB.prepare(`
    UPDATE members
    SET token_hash = ?, last_seen_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).bind(tokenHash, member.id).run();

  return jsonResponse({
    ok: true,
    token,
    member: { id: member.id, email: member.email, name: member.name || "", status: member.status },
    message: "Login successful.",
  });
}

export async function onRequestPost({ request, env }) {
  try {
    return await login(request, env);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}
