import { ASSET_MANAGER_ROLES } from "../lib/rbac.js";

function parseReturnLog(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function assetToJs(r) {
  return {
    id: r.id,
    name: r.name,
    assetType: r.asset_type,
    serialNumber: r.serial_number || "",
    brand: r.brand || "",
    specifications: r.specifications || "",
    condition: r.condition || "Good",
    remarks: r.remarks || "",
    assignedTo: r.assigned_to || null,
    assignedDate: r.assigned_date || "",
    returnDate: r.return_date || "",
    returnLog: parseReturnLog(r.return_log),
    status: r.status || "available",
    updatedAt: r.updated_at || "",
  };
}

/** Always derive status from assignment (ignore client-sent status).
 * Only assigned_to drives status: assigned if set, otherwise available. */
function statusFromAssignment(assignedTo) {
  const hasAssignee = assignedTo != null && String(assignedTo).trim() !== "";
  if (hasAssignee) return "assigned";
  return "available";
}

async function resolveUserName(pool, userId) {
  if (!userId) return "";
  const { rows } = await pool.query(
    `SELECT name FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return rows[0]?.name || "";
}

/**
 * When clearing assigned_to with a return_date, record who returned it.
 * Prefer client-provided returnLog; otherwise build from previous assignee.
 */
async function resolveReturnLog(pool, { assignedTo, returnDate, returnLog, existing }) {
  const hasAssignee = assignedTo != null && String(assignedTo).trim() !== "";
  const hasReturnDate = !!(returnDate && String(returnDate).trim());
  const existingJs = existing ? assetToJs(existing) : null;
  const prevAssignee = existingJs?.assignedTo || null;

  // Still assigned — keep prior log if any; client may also send one.
  if (hasAssignee) {
    return parseReturnLog(returnLog) || existingJs?.returnLog || null;
  }

  // Unassigned + return date → write/update return history from previous holder.
  if (hasReturnDate) {
    if (returnLog && returnLog.returned_by) {
      return {
        returned_by: returnLog.returned_by,
        returned_by_name: returnLog.returned_by_name || (await resolveUserName(pool, returnLog.returned_by)),
        return_date: returnLog.return_date || returnDate,
      };
    }
    const returnedBy = prevAssignee || returnLog?.returned_by || null;
    if (returnedBy) {
      return {
        returned_by: returnedBy,
        returned_by_name: returnLog?.returned_by_name || existingJs?.returnLog?.returned_by_name || (await resolveUserName(pool, returnedBy)),
        return_date: returnDate,
      };
    }
    return parseReturnLog(returnLog) || existingJs?.returnLog || null;
  }

  return parseReturnLog(returnLog) || existingJs?.returnLog || null;
}

async function upsertAsset(pool, a, existing = null) {
  const id = a?.id;
  if (!id) throw new Error("asset.id is required");

  const assignedTo = a.assignedTo != null && String(a.assignedTo).trim() !== ""
    ? a.assignedTo
    : null;
  const returnDate = a.returnDate || "";
  const status = statusFromAssignment(assignedTo);
  const returnLog = await resolveReturnLog(pool, {
    assignedTo,
    returnDate,
    returnLog: a.returnLog,
    existing,
  });

  const { rows } = await pool.query(
    `INSERT INTO assets (
       id, name, asset_type, serial_number, brand, specifications, condition, remarks,
       assigned_to, assigned_date, return_date, return_log, status, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       asset_type = EXCLUDED.asset_type,
       serial_number = EXCLUDED.serial_number,
       brand = EXCLUDED.brand,
       specifications = EXCLUDED.specifications,
       condition = EXCLUDED.condition,
       remarks = EXCLUDED.remarks,
       assigned_to = EXCLUDED.assigned_to,
       assigned_date = EXCLUDED.assigned_date,
       return_date = EXCLUDED.return_date,
       return_log = EXCLUDED.return_log,
       status = EXCLUDED.status,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      id,
      a.name,
      a.assetType || "Other",
      a.serialNumber || "",
      a.brand || "",
      a.specifications || "",
      a.condition || "Good",
      a.remarks || "",
      assignedTo,
      a.assignedDate || "",
      returnDate,
      returnLog ? JSON.stringify(returnLog) : null,
      status,
      a.updatedAt || "",
    ],
  );
  return assetToJs(rows[0]);
}

export function registerAssetsRoutes(app, pool, requireAuth, requireAssetManager) {
  app.get("/api/assets", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;

      const { rows } = await pool.query("SELECT * FROM assets ORDER BY name");
      let list = rows.map(assetToJs);

      if (!ASSET_MANAGER_ROLES.includes(actor.role)) {
        list = list.filter((a) => a.assignedTo === actor.id);
      }

      res.json(list);
    } catch (e) {
      console.error("GET /api/assets error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/assets", requireAssetManager, async (req, res) => {
    const r = req.body || {};
    const id = r.id || `ast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = (r.name || "").trim();
    const serialNumber = (r.serialNumber || "").trim();

    if (!name) return res.status(400).json({ error: "name is required" });
    if (!serialNumber) return res.status(400).json({ error: "serialNumber is required" });

    try {
      const asset = await upsertAsset(pool, { ...r, id, name, serialNumber }, null);
      res.json({ asset });
    } catch (e) {
      console.error("POST /api/assets error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/assets/:id", requireAuth, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const actor = req.authUser;
    const isHr = ASSET_MANAGER_ROLES.includes(actor.role);

    try {
      const { rows: existingRows } = await pool.query("SELECT * FROM assets WHERE id = $1", [id]);
      const existing = existingRows[0];
      if (!existing) return res.status(404).json({ error: "Not found" });

      if (!isHr && existing.assigned_to !== actor.id) {
        return res.status(403).json({ error: "Forbidden — you can only update assets assigned to you" });
      }

      const r = { ...(req.body || {}), id };
      const name = (r.name || existing.name || "").trim();
      const serialNumber = (r.serialNumber || existing.serial_number || "").trim();
      if (!name) return res.status(400).json({ error: "name is required" });
      if (!serialNumber) return res.status(400).json({ error: "serialNumber is required" });

      // Non-HR may only update return-related fields on their assigned asset
      const payload = isHr
        ? { ...r, name, serialNumber }
        : {
            ...assetToJs(existing),
            assignedTo: null,
            returnDate: r.returnDate ?? existing.return_date ?? "",
            returnLog: r.returnLog,
            remarks: r.remarks ?? existing.remarks ?? "",
            updatedAt: r.updatedAt || new Date().toLocaleString(),
          };

      const asset = await upsertAsset(pool, payload, existing);
      res.json({ asset });
    } catch (e) {
      console.error("PUT /api/assets/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/assets/:id", requireAssetManager, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    try {
      const { rows } = await pool.query("DELETE FROM assets WHERE id = $1 RETURNING *", [id]);
      res.json({ ok: true, deleted: rows[0] ? assetToJs(rows[0]) : null });
    } catch (e) {
      console.error("DELETE /api/assets/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
