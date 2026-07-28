import crypto from "crypto";

/** Session lifetime — 30 days. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function extractSessionToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (auth && /^Bearer\s+/i.test(String(auth))) {
    return String(auth).replace(/^Bearer\s+/i, "").trim();
  }
  const headerToken = req.headers["x-session-token"];
  if (headerToken) return String(headerToken).trim();
  return null;
}

function newSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/** Create a server-side session; returns { token, expiresAt }. */
export async function createSession(pool, userId) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    `INSERT INTO user_sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt.toISOString()]
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function revokeSession(pool, token) {
  if (!token) return;
  await pool.query("DELETE FROM user_sessions WHERE token = $1", [token]);
}

export async function revokeAllUserSessions(pool, userId) {
  if (!userId) return;
  await pool.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
}

/** Resolve authenticated user from Bearer session token (never trust X-User-Id). */
export async function resolveAuthenticatedUser(pool, req) {
  const token = extractSessionToken(req);
  if (!token) return null;

  const { rows } = await pool.query(
    `SELECT u.id, u.role, u.name, u.email
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [token]
  );
  if (!rows[0]) return null;

  pool.query("UPDATE user_sessions SET last_seen_at = NOW() WHERE token = $1", [token]).catch(() => {});
  return rows[0];
}

/** Optional — prune expired sessions (call on startup). */
export async function cleanupExpiredSessions(pool) {
  await pool.query("DELETE FROM user_sessions WHERE expires_at <= NOW()");
}

export const HR_ADMIN_ROLES = ["HR Admin", "Executive"];

/** Require a valid Bearer session token. Sets req.authUser. */
export function createRequireAuth(pool) {
  return async function requireAuth(req, res, next) {
    try {
      const user = await resolveAuthenticatedUser(pool, req);
      if (!user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      req.authUser = user;
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

/** Require HR Admin or Executive role. Sets req.authUser. */
export function createRequireHrAdmin(pool) {
  return async function requireHrAdmin(req, res, next) {
    try {
      const user = await resolveAuthenticatedUser(pool, req);
      if (!user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!HR_ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ error: "Forbidden — HR Admin or Executive only" });
      }
      req.authUser = user;
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}
