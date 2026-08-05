import { HR_ADMIN_ROLES } from "../lib/auth.js";

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
    status: r.status || "available",
    updatedAt: r.updated_at || "",
  };
}

async function upsertAsset(pool, a) {
  const id = a?.id;
  if (!id) throw new Error("asset.id is required");

  const { rows } = await pool.query(
    `INSERT INTO assets (
       id, name, asset_type, serial_number, brand, specifications, condition, remarks,
       assigned_to, assigned_date, return_date, status, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
      a.assignedTo || null,
      a.assignedDate || "",
      a.returnDate || "",
      a.status || "available",
      a.updatedAt || "",
    ],
  );
  return assetToJs(rows[0]);
}

export function registerAssetsRoutes(app, pool, requireAuth, requireHrAdmin) {
  app.get("/api/assets", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;

      const { rows } = await pool.query("SELECT * FROM assets ORDER BY name");
      let list = rows.map(assetToJs);

      if (!HR_ADMIN_ROLES.includes(actor.role)) {
        list = list.filter((a) => a.assignedTo === actor.id);
      }

      res.json(list);
    } catch (e) {
      console.error("GET /api/assets error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/assets", requireHrAdmin, async (req, res) => {
    const r = req.body || {};
    const id = r.id || `ast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = (r.name || "").trim();
    const serialNumber = (r.serialNumber || "").trim();

    if (!name) return res.status(400).json({ error: "name is required" });
    if (!serialNumber) return res.status(400).json({ error: "serialNumber is required" });

    try {
      const asset = await upsertAsset(pool, { ...r, id, name, serialNumber });
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
    const isHr = HR_ADMIN_ROLES.includes(actor.role);

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
            returnDate: r.returnDate ?? existing.return_date ?? "",
            status: r.status ?? existing.status ?? "assigned",
            remarks: r.remarks ?? existing.remarks ?? "",
            updatedAt: r.updatedAt || new Date().toLocaleString(),
          };

      const asset = await upsertAsset(pool, payload);
      res.json({ asset });
    } catch (e) {
      console.error("PUT /api/assets/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/assets/:id", requireHrAdmin, async (req, res) => {
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
