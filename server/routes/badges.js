import { HR_ADMIN_ROLES } from "../lib/auth.js";
import { karachiDateKey } from "../lib/admsHelpers.js";

const EPOCH = "1970-01-01T00:00:00.000Z";

const VALID_TABS = new Set([
  "leave",
  "shortLeave",
  "attendance",
  "announcements",
  "policies",
  "warnings",
  "payroll",
  "assets",
  "holidays",
  "notifications",
  "people",
  "biometric",
]);

/** Map frontend route ids → badge keys */
export const ROUTE_TO_BADGE_TAB = {
  leave: "leave",
  shortleave: "shortLeave",
  attendance: "attendance",
  announcements: "announcements",
  policies: "policies",
  warnings: "warnings",
  payroll: "payroll",
  assets: "assets",
  holidays: "holidays",
  people: "people",
  biometric: "biometric",
};

function isStaff(role) {
  return HR_ADMIN_ROLES.includes(role);
}

async function countOne(pool, sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    return Number(rows[0]?.c || 0);
  } catch (e) {
    console.error("badge count error:", e.message);
    return 0;
  }
}

function seenSql(tab) {
  return `COALESCE(
    (SELECT last_seen_at FROM tab_seen WHERE user_id = $1 AND tab_name = '${tab}'),
    '${EPOCH}'::timestamptz
  )`;
}

export function registerBadgesRoutes(app, pool, requireAuth) {
  app.get("/api/badges", requireAuth, async (req, res) => {
    try {
      const userId = req.authUser.id;
      const role = req.authUser.role;
      const staff = isStaff(role);
      const today = karachiDateKey(new Date());

      const badges = {
        leave: 0,
        shortLeave: 0,
        attendance: 0,
        announcements: 0,
        policies: 0,
        warnings: 0,
        payroll: 0,
        assets: 0,
        holidays: 0,
        notifications: 0,
      };

      if (staff) {
        badges.leave = await countOne(
          pool,
          `SELECT COUNT(*)::int AS c FROM leave_requests
           WHERE status = 'pending' AND created_at > ${seenSql("leave")}`,
          [userId]
        );
        badges.shortLeave = await countOne(
          pool,
          `SELECT COUNT(*)::int AS c FROM short_leave_requests
           WHERE status = 'pending' AND created_at > ${seenSql("shortLeave")}`,
          [userId]
        );
        badges.attendance = await countOne(
          pool,
          `SELECT COUNT(*)::int AS c FROM attendance
           WHERE date = $2 AND updated_at > ${seenSql("attendance")}`,
          [userId, today]
        );
        badges.warnings = await countOne(
          pool,
          `SELECT COUNT(*)::int AS c FROM warnings
           WHERE created_at > ${seenSql("warnings")}`,
          [userId]
        );
        badges.payroll = await countOne(
          pool,
          `SELECT COUNT(*)::int AS c FROM payroll
           WHERE created_at > ${seenSql("payroll")}`,
          [userId]
        );
        badges.assets = await countOne(
          pool,
          `SELECT COUNT(*)::int AS c FROM assets
           WHERE ts_updated > ${seenSql("assets")}`,
          [userId]
        );
      } else {
        badges.leave = await countOne(
          pool,
          `SELECT COUNT(*)::int AS c FROM leave_requests
           WHERE user_id = $1 AND status != 'pending'
             AND updated_at > ${seenSql("leave")}`,
          [userId]
        );
        badges.shortLeave = await countOne(
          pool,
          `SELECT COUNT(*)::int AS c FROM short_leave_requests
           WHERE user_id = $1 AND status != 'pending'
             AND updated_at > ${seenSql("shortLeave")}`,
          [userId]
        );
        badges.attendance = await countOne(
          pool,
          `SELECT COUNT(*)::int AS c FROM attendance
           WHERE user_id = $1 AND date = $2
             AND updated_at > ${seenSql("attendance")}`,
          [userId, today]
        );
        badges.warnings = await countOne(
          pool,
          `SELECT COUNT(*)::int AS c FROM warnings
           WHERE user_id = $1 AND created_at > ${seenSql("warnings")}`,
          [userId]
        );
        badges.payroll = await countOne(
          pool,
          `SELECT COUNT(*)::int AS c FROM payroll
           WHERE user_id = $1 AND created_at > ${seenSql("payroll")}`,
          [userId]
        );
        badges.assets = 0;
      }

      badges.announcements = await countOne(
        pool,
        `SELECT COUNT(*)::int AS c FROM announcements
         WHERE created_at > ${seenSql("announcements")}`,
        [userId]
      );
      badges.policies = await countOne(
        pool,
        `SELECT COUNT(*)::int AS c FROM policies
         WHERE ts_created > ${seenSql("policies")}`,
        [userId]
      );
      badges.holidays = await countOne(
        pool,
        `SELECT COUNT(*)::int AS c FROM holidays
         WHERE created_at > ${seenSql("holidays")}`,
        [userId]
      );
      badges.notifications = await countOne(
        pool,
        `SELECT COUNT(*)::int AS c FROM notifications
         WHERE user_id = $1 AND COALESCE(read, false) = false`,
        [userId]
      );

      res.json(badges);
    } catch (e) {
      console.error("GET /api/badges error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/badges/seen", requireAuth, async (req, res) => {
    try {
      let tab = String(req.body?.tab || "").trim();
      if (ROUTE_TO_BADGE_TAB[tab]) tab = ROUTE_TO_BADGE_TAB[tab];
      if (!VALID_TABS.has(tab)) {
        return res.status(400).json({ error: "Invalid tab" });
      }
      await pool.query(
        `INSERT INTO tab_seen (user_id, tab_name, last_seen_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, tab_name)
         DO UPDATE SET last_seen_at = NOW()`,
        [req.authUser.id, tab]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error("POST /api/badges/seen error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
