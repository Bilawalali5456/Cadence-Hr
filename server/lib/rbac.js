import { canAssignRole, extractSessionToken, resolveAuthenticatedUser } from "./auth.js";

/** Full HR operations (people, payroll, attendance reports, etc.) — not assets-only Admin. */
export const HR_OPS_ROLES = ["HR Employee", "Executive"];

/** Roles that may create, assign, and delete company assets. */
export const ASSET_MANAGER_ROLES = ["Admin", "Executive"];

export function isHrOpsRoleName(role) {
  return HR_OPS_ROLES.includes(role);
}

export function isManagerDesignationUser(user) {
  if (!user) return false;
  const d = String(user.designation || "").trim().toLowerCase();
  if (d === "manager") return true;
  return user.role === "Manager";
}

/** Role-based or designation-based (Employee + Manager) asset management. */
export function isAssetManagerUser(user) {
  if (!user) return false;
  if (ASSET_MANAGER_ROLES.includes(user.role)) return true;
  return (user.role === "Employee" || user.role === "Manager") && isManagerDesignationUser(user);
}

export function isAssetManagerRoleName(role) {
  return ASSET_MANAGER_ROLES.includes(role);
}

export async function resolveAssetManagerAccess(pool, user) {
  if (!user) return false;
  if (isAssetManagerUser(user)) return true;
  if (user.role !== "Employee" && user.role !== "Manager") return false;

  const { rows } = await pool.query(
    `SELECT role, designation FROM users WHERE id = $1 LIMIT 1`,
    [user.id]
  );
  const row = rows[0];
  if (!row) return false;
  return isAssetManagerUser(row);
}

export function canViewAllAttendance(role) {
  return HR_OPS_ROLES.includes(role);
}

/** Executive-only assignment for assets-only Admin accounts (auth.js still keys on "HR Admin"). */
export function actorCanAssignRole(actorRole, newRole) {
  if (newRole === "Admin") return actorRole === "Executive";
  return canAssignRole(actorRole, newRole);
}

function authFailPayload(req, reason) {
  const token = extractSessionToken(req);
  console.warn(
    `[rbac] 403 ${req.method} ${req.originalUrl || req.url} reason=${reason} tokenLen=${token ? token.length : 0}`
  );
  return { error: "Forbidden", reason };
}

/** Require HR Employee or Executive — blocks assets-only Admin. */
export function createRequireHrOps(pool) {
  return async function requireHrOps(req, res, next) {
    try {
      const token = extractSessionToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required", reason: "missing_token" });
      }
      const user = await resolveAuthenticatedUser(pool, req);
      if (!user) {
        return res.status(401).json({ error: "Authentication required", reason: "invalid_or_expired_session" });
      }
      if (!HR_OPS_ROLES.includes(user.role)) {
        return res.status(403).json(authFailPayload(req, "hr_ops_only"));
      }
      req.authUser = user;
      next();
    } catch (e) {
      console.error("[rbac] requireHrOps error:", e.message);
      res.status(500).json({ error: e.message });
    }
  };
}

/** Require Admin, Executive, or Employee with designation Manager for asset write operations. */
export function createRequireAssetManager(pool) {
  return async function requireAssetManager(req, res, next) {
    try {
      const token = extractSessionToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required", reason: "missing_token" });
      }
      const user = await resolveAuthenticatedUser(pool, req);
      if (!user) {
        return res.status(401).json({ error: "Authentication required", reason: "invalid_or_expired_session" });
      }
      const canManage = await resolveAssetManagerAccess(pool, user);
      if (!canManage) {
        return res.status(403).json(authFailPayload(req, "asset_manager_only"));
      }
      req.authUser = user;
      next();
    } catch (e) {
      console.error("[rbac] requireAssetManager error:", e.message);
      res.status(500).json({ error: e.message });
    }
  };
}
