import crypto from "crypto";

/** Session lifetime — 30 days. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "adforce_session";

export function extractSessionToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (auth && /^Bearer\s+/i.test(String(auth))) {
    const t = String(auth).replace(/^Bearer\s+/i, "").trim();
    if (t) return t;
  }
  const headerToken = req.headers["x-session-token"];
  if (headerToken) {
    const t = String(headerToken).trim();
    if (t) return t;
  }
  // Cookie fallback — survives nginx configs that drop Authorization
  const cookieHeader = req.headers.cookie || "";
  const m = String(cookieHeader).match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]).trim();
    } catch {
      return String(m[1]).trim();
    }
  }
  return null;
}

function newSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/** Set HttpOnly session cookie on the response (same-origin; nginx-safe). */
export function setSessionCookie(res, token) {
  if (!token || !res) return;
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res) {
  if (!res) return;
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

/** Create a server-side session; returns { token, expiresAt }. */
export async function createSession(pool, userId) {
  const token = newSessionToken();
  // Use DB clock so expires_at is never skewed by Node/Postgres timezone mismatch
  const { rows } = await pool.query(
    `INSERT INTO user_sessions (token, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')
     RETURNING expires_at`,
    [token, userId]
  );
  return { token, expiresAt: rows[0]?.expires_at || null };
}

export async function revokeSession(pool, token) {
  if (!token) return;
  await pool.query("DELETE FROM user_sessions WHERE token = $1", [token]);
}

export async function revokeAllUserSessions(pool, userId) {
  if (!userId) return;
  await pool.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
}

/** Resolve authenticated user from Bearer / X-Session-Token / cookie. */
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

export const HR_ADMIN_ROLES = ["HR Admin", "Executive", "HR Employee"];

/** Hierarchy rank: Executive > HR Admin > HR Employee > Manager/Employee */
export function roleAuthorityRank(role) {
  if (role === "Executive") return 40;
  if (role === "HR Admin") return 30;
  if (role === "HR Employee") return 20;
  if (role === "Manager" || role === "Employee") return 10;
  return 0;
}

/** True when actor may manage (edit/delete) a user with targetRole. */
export function canManageTargetRole(actorRole, targetRole) {
  if (!actorRole || !targetRole) return false;
  return roleAuthorityRank(actorRole) > roleAuthorityRank(targetRole);
}

/** Roles the actor is allowed to assign when creating/updating users. */
export function canAssignRole(actorRole, newRole) {
  if (!actorRole || !newRole) return false;
  // Super Authority: only Executive may create/promote to HR Admin.
  if (newRole === "HR Admin") return actorRole === "Executive";
  // Admin + HR Employee share manage_executives (not Super Authority).
  if (newRole === "Executive") {
    return actorRole === "HR Admin" || actorRole === "HR Employee" || actorRole === "Executive";
  }
  // Only Admin / Executive may create HR Employee accounts.
  if (newRole === "HR Employee") return actorRole === "HR Admin" || actorRole === "Executive";
  if (newRole === "Employee" || newRole === "Manager") {
    return HR_ADMIN_ROLES.includes(actorRole);
  }
  return false;
}

function authFailPayload(req, reason) {
  const token = extractSessionToken(req);
  console.warn(
    `[auth] 401 ${req.method} ${req.originalUrl || req.url} reason=${reason} ` +
    `hasBearer=${!!req.headers.authorization} hasXToken=${!!req.headers["x-session-token"]} ` +
    `hasCookie=${String(req.headers.cookie || "").includes(SESSION_COOKIE)} tokenLen=${token ? token.length : 0}`
  );
  return { error: "Authentication required", reason };
}

/** Require a valid session token. Sets req.authUser. */
export function createRequireAuth(pool) {
  return async function requireAuth(req, res, next) {
    try {
      const token = extractSessionToken(req);
      if (!token) {
        return res.status(401).json(authFailPayload(req, "missing_token"));
      }
      const user = await resolveAuthenticatedUser(pool, req);
      if (!user) {
        return res.status(401).json(authFailPayload(req, "invalid_or_expired_session"));
      }
      req.authUser = user;
      next();
    } catch (e) {
      console.error("[auth] requireAuth error:", e.message);
      res.status(500).json({ error: e.message });
    }
  };
}

/** Require HR Admin, HR Employee, or Executive role. Sets req.authUser. */
export function createRequireHrAdmin(pool) {
  return async function requireHrAdmin(req, res, next) {
    try {
      const token = extractSessionToken(req);
      if (!token) {
        return res.status(401).json(authFailPayload(req, "missing_token"));
      }
      const user = await resolveAuthenticatedUser(pool, req);
      if (!user) {
        return res.status(401).json(authFailPayload(req, "invalid_or_expired_session"));
      }
      if (!HR_ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ error: "Forbidden — HR Admin, HR Employee, or Executive only" });
      }
      req.authUser = user;
      next();
    } catch (e) {
      console.error("[auth] requireHrAdmin error:", e.message);
      res.status(500).json({ error: e.message });
    }
  };
}
