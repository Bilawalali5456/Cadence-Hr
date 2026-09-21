import {
  notifyLeadAssigned,
  notifyLeadReassigned,
  notifyLeadStageChanged,
  notifyLeadWon,
  fetchUserName,
} from "../lib/notify.js";

export const LEAD_STAGES = [
  "New",
  "Contacted",
  "Proposal Sent",
  "Negotiation",
  "Won",
  "Lost",
];

const DEFAULT_CHANNEL_NAMES = new Set(["Upwork", "LinkedIn", "Jobs.pk", "CSR"]);
const DEFAULT_DEPARTMENT_NAMES = new Set([
  "Development",
  "Graphics",
  "Salesforce",
  "Social Media Marketing",
]);

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isExecutive(user) {
  return user?.role === "Executive";
}

/** Employee / Manager — may work assigned leads only. */
function isLeadWorker(user) {
  return user?.role === "Employee" || user?.role === "Manager";
}

function canAccessLeads(user) {
  return isExecutive(user) || isLeadWorker(user);
}

function normalizeStage(stage) {
  const s = String(stage || "").trim();
  return LEAD_STAGES.includes(s) ? s : null;
}

function normalizeCurrency(currency) {
  const c = String(currency || "PKR").trim().toUpperCase();
  return c === "USD" ? "USD" : "PKR";
}

function leadToJs(r) {
  return {
    id: r.id,
    clientName: r.client_name,
    channel: r.channel,
    department: r.department,
    assignedTo: r.assigned_to || null,
    assignedToName: r.assigned_to_name || undefined,
    stage: r.stage || "New",
    description: r.description || "",
    amount: r.amount != null ? Number(r.amount) : 0,
    currency: r.currency || "PKR",
    contactInfo: r.contact_info || "",
    notes: r.notes || "",
    addedBy: r.added_by || null,
    addedByName: r.added_by_name || undefined,
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  };
}

function noteToJs(r) {
  return {
    id: r.id,
    leadId: r.lead_id,
    userId: r.user_id || null,
    userName: r.user_name || undefined,
    note: r.note || "",
    stageFrom: r.stage_from || null,
    stageTo: r.stage_to || null,
    createdAt: r.created_at || null,
  };
}

function channelToJs(r) {
  return {
    id: r.id,
    name: r.name,
    createdBy: r.created_by || null,
    createdAt: r.created_at || null,
    isDefault: DEFAULT_CHANNEL_NAMES.has(r.name),
  };
}

function departmentToJs(r) {
  return {
    id: r.id,
    name: r.name,
    createdBy: r.created_by || null,
    createdAt: r.created_at || null,
    isDefault: DEFAULT_DEPARTMENT_NAMES.has(r.name),
  };
}

const LEAD_SELECT = `
  SELECT l.*,
         a.name AS assigned_to_name,
         b.name AS added_by_name
  FROM leads l
  LEFT JOIN users a ON a.id = l.assigned_to
  LEFT JOIN users b ON b.id = l.added_by
`;

async function fetchLeadById(client, id) {
  const { rows } = await client.query(`${LEAD_SELECT} WHERE l.id = $1 LIMIT 1`, [id]);
  return rows[0] || null;
}

async function insertLeadNote(client, { leadId, userId, note, stageFrom = null, stageTo = null }) {
  const id = genId("lnote");
  await client.query(
    `INSERT INTO lead_notes (id, lead_id, user_id, note, stage_from, stage_to)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, leadId, userId || null, note, stageFrom, stageTo]
  );
  return id;
}

async function assertAssigneeValid(client, assigneeId) {
  if (!assigneeId) return null;
  const { rows } = await client.query(
    `SELECT id, name, role, status FROM users WHERE id = $1 LIMIT 1`,
    [assigneeId]
  );
  const u = rows[0];
  if (!u) throw Object.assign(new Error("Assigned employee not found"), { status: 400 });
  if (u.status !== "active") throw Object.assign(new Error("Assigned employee is not active"), { status: 400 });
  if (u.role !== "Employee" && u.role !== "Manager") {
    throw Object.assign(new Error("Leads can only be assigned to Employee or Manager"), { status: 400 });
  }
  return u;
}

export function registerLeadsRoutes(app, pool, requireAuth, requireExecutive) {
  // ─── Channels ───
  app.get("/api/lead-channels", requireAuth, async (req, res) => {
    try {
      if (!canAccessLeads(req.authUser)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { rows } = await pool.query(
        `SELECT * FROM lead_channels ORDER BY LOWER(name)`
      );
      res.json(rows.map(channelToJs));
    } catch (e) {
      console.error("GET /api/lead-channels error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/lead-channels", requireAuth, requireExecutive, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "name is required" });
      const id = genId("lead-ch");
      const { rows } = await pool.query(
        `INSERT INTO lead_channels (id, name, created_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, name, req.authUser.id]
      );
      res.status(201).json(channelToJs(rows[0]));
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ error: "Channel already exists" });
      console.error("POST /api/lead-channels error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/lead-channels/:id", requireAuth, requireExecutive, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const { rows } = await pool.query(`SELECT * FROM lead_channels WHERE id = $1 LIMIT 1`, [id]);
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Channel not found" });
      if (DEFAULT_CHANNEL_NAMES.has(row.name)) {
        return res.status(403).json({ error: "Cannot delete default channels" });
      }
      await pool.query(`DELETE FROM lead_channels WHERE id = $1`, [id]);
      res.json({ ok: true });
    } catch (e) {
      console.error("DELETE /api/lead-channels/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Departments ───
  app.get("/api/lead-departments", requireAuth, async (req, res) => {
    try {
      if (!canAccessLeads(req.authUser)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { rows } = await pool.query(
        `SELECT * FROM lead_departments ORDER BY LOWER(name)`
      );
      res.json(rows.map(departmentToJs));
    } catch (e) {
      console.error("GET /api/lead-departments error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/lead-departments", requireAuth, requireExecutive, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "name is required" });
      const id = genId("lead-dept");
      const { rows } = await pool.query(
        `INSERT INTO lead_departments (id, name, created_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, name, req.authUser.id]
      );
      res.status(201).json(departmentToJs(rows[0]));
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ error: "Department already exists" });
      console.error("POST /api/lead-departments error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/lead-departments/:id", requireAuth, requireExecutive, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const { rows } = await pool.query(`SELECT * FROM lead_departments WHERE id = $1 LIMIT 1`, [id]);
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Department not found" });
      if (DEFAULT_DEPARTMENT_NAMES.has(row.name)) {
        return res.status(403).json({ error: "Cannot delete default departments" });
      }
      await pool.query(`DELETE FROM lead_departments WHERE id = $1`, [id]);
      res.json({ ok: true });
    } catch (e) {
      console.error("DELETE /api/lead-departments/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Leads list / create ───
  app.get("/api/leads", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      if (!canAccessLeads(actor)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      let sql = LEAD_SELECT;
      const params = [];
      if (!isExecutive(actor)) {
        params.push(actor.id);
        sql += ` WHERE l.assigned_to = $1`;
      }
      sql += ` ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC`;
      const { rows } = await pool.query(sql, params);
      res.json(rows.map(leadToJs));
    } catch (e) {
      console.error("GET /api/leads error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/leads", requireAuth, requireExecutive, async (req, res) => {
    const client = await pool.connect();
    try {
      const body = req.body || {};
      const clientName = String(body.clientName || body.client_name || "").trim();
      const channel = String(body.channel || "").trim();
      const department = String(body.department || "").trim();
      const stage = normalizeStage(body.stage) || "New";
      const description = String(body.description || "").trim();
      const contactInfo = String(body.contactInfo || body.contact_info || "").trim();
      const notes = String(body.notes || "").trim();
      const amount = Number(body.amount) || 0;
      const currency = normalizeCurrency(body.currency);
      const assignedTo = body.assignedTo || body.assigned_to || null;

      if (!clientName) return res.status(400).json({ error: "clientName is required" });
      if (!channel) return res.status(400).json({ error: "channel is required" });
      if (!department) return res.status(400).json({ error: "department is required" });

      await client.query("BEGIN");
      const assignee = await assertAssigneeValid(client, assignedTo);
      const id = genId("lead");
      await client.query(
        `INSERT INTO leads (
           id, client_name, channel, department, assigned_to, stage,
           description, amount, currency, contact_info, notes, added_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          id, clientName, channel, department, assignee?.id || null, stage,
          description, amount, currency, contactInfo, notes, req.authUser.id,
        ]
      );

      await insertLeadNote(client, {
        leadId: id,
        userId: req.authUser.id,
        note: `Lead created${assignee ? ` and assigned to ${assignee.name}` : ""}`,
        stageFrom: null,
        stageTo: stage,
      });

      if (assignee?.id) {
        await notifyLeadAssigned(client, {
          assigneeId: assignee.id,
          clientName,
        });
      }

      const row = await fetchLeadById(client, id);
      await client.query("COMMIT");
      res.status(201).json(leadToJs(row));
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      const status = e.status || 500;
      if (status >= 500) console.error("POST /api/leads error:", e.message);
      res.status(status).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  app.put("/api/leads/:id", requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      const actor = req.authUser;
      if (!canAccessLeads(actor)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const id = String(req.params.id || "");
      const body = req.body || {};

      await client.query("BEGIN");
      const existing = await fetchLeadById(client, id);
      if (!existing) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Lead not found" });
      }

      const isExec = isExecutive(actor);
      if (!isExec) {
        if (existing.assigned_to !== actor.id) {
          await client.query("ROLLBACK");
          return res.status(403).json({ error: "Forbidden — not your lead" });
        }
      }

      let next = {
        client_name: existing.client_name,
        channel: existing.channel,
        department: existing.department,
        assigned_to: existing.assigned_to,
        stage: existing.stage,
        description: existing.description || "",
        amount: Number(existing.amount) || 0,
        currency: existing.currency || "PKR",
        contact_info: existing.contact_info || "",
        notes: existing.notes || "",
      };

      const oldAssignee = existing.assigned_to;
      const oldStage = existing.stage;
      let stageNoteText = null;
      let freeNoteText = null;

      if (isExec) {
        if (body.clientName !== undefined || body.client_name !== undefined) {
          next.client_name = String(body.clientName ?? body.client_name ?? "").trim();
          if (!next.client_name) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "clientName is required" });
          }
        }
        if (body.channel !== undefined) next.channel = String(body.channel || "").trim();
        if (body.department !== undefined) next.department = String(body.department || "").trim();
        if (body.description !== undefined) next.description = String(body.description || "").trim();
        if (body.contactInfo !== undefined || body.contact_info !== undefined) {
          next.contact_info = String(body.contactInfo ?? body.contact_info ?? "").trim();
        }
        if (body.notes !== undefined) next.notes = String(body.notes || "").trim();
        if (body.amount !== undefined) next.amount = Number(body.amount) || 0;
        if (body.currency !== undefined) next.currency = normalizeCurrency(body.currency);
        if (body.assignedTo !== undefined || body.assigned_to !== undefined) {
          const raw = body.assignedTo ?? body.assigned_to;
          if (raw) {
            const assignee = await assertAssigneeValid(client, raw);
            next.assigned_to = assignee.id;
          } else {
            next.assigned_to = null;
          }
        }
        if (!next.channel || !next.department) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "channel and department are required" });
        }
      }

      if (body.stage !== undefined) {
        const stage = normalizeStage(body.stage);
        if (!stage) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Invalid stage" });
        }
        next.stage = stage;
      }

      // Optional activity note from employee/exec on same request
      if (body.note !== undefined && String(body.note).trim()) {
        freeNoteText = String(body.note).trim();
      }

      await client.query(
        `UPDATE leads SET
           client_name = $1, channel = $2, department = $3, assigned_to = $4, stage = $5,
           description = $6, amount = $7, currency = $8, contact_info = $9, notes = $10
         WHERE id = $11`,
        [
          next.client_name, next.channel, next.department, next.assigned_to, next.stage,
          next.description, next.amount, next.currency, next.contact_info, next.notes, id,
        ]
      );

      if (next.stage !== oldStage) {
        const actorName = await fetchUserName(client, actor.id) || actor.name || "Someone";
        stageNoteText = `Stage changed from ${oldStage} to ${next.stage} by ${actorName}`;
        await insertLeadNote(client, {
          leadId: id,
          userId: actor.id,
          note: stageNoteText,
          stageFrom: oldStage,
          stageTo: next.stage,
        });

        if (!isExec) {
          await notifyLeadStageChanged(client, {
            employeeName: actorName,
            clientName: next.client_name,
            stage: next.stage,
            excludeUserId: actor.id,
          });
        }
        if (next.stage === "Won" && oldStage !== "Won") {
          await notifyLeadWon(client, {
            clientName: next.client_name,
            amount: next.amount,
            currency: next.currency,
            excludeUserId: isExec ? actor.id : null,
          });
        }
      }

      if (freeNoteText) {
        await insertLeadNote(client, {
          leadId: id,
          userId: actor.id,
          note: freeNoteText,
        });
      }

      if (isExec && next.assigned_to !== oldAssignee) {
        await notifyLeadReassigned(client, {
          oldAssigneeId: oldAssignee,
          newAssigneeId: next.assigned_to,
          clientName: next.client_name,
        });
      }

      const row = await fetchLeadById(client, id);
      await client.query("COMMIT");
      res.json(leadToJs(row));
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      const status = e.status || 500;
      if (status >= 500) console.error("PUT /api/leads/:id error:", e.message);
      res.status(status).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  app.delete("/api/leads/:id", requireAuth, requireExecutive, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const { rowCount } = await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
      if (!rowCount) return res.status(404).json({ error: "Lead not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error("DELETE /api/leads/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Notes ───
  app.get("/api/leads/:id/notes", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      if (!canAccessLeads(actor)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const id = String(req.params.id || "");
      const lead = await fetchLeadById(pool, id);
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      if (!isExecutive(actor) && lead.assigned_to !== actor.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { rows } = await pool.query(
        `SELECT n.*, u.name AS user_name
         FROM lead_notes n
         LEFT JOIN users u ON u.id = n.user_id
         WHERE n.lead_id = $1
         ORDER BY n.created_at DESC`,
        [id]
      );
      res.json(rows.map(noteToJs));
    } catch (e) {
      console.error("GET /api/leads/:id/notes error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/leads/:id/notes", requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      const actor = req.authUser;
      if (!canAccessLeads(actor)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const id = String(req.params.id || "");
      const note = String(req.body?.note || "").trim();
      if (!note) return res.status(400).json({ error: "note is required" });

      await client.query("BEGIN");
      const lead = await fetchLeadById(client, id);
      if (!lead) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Lead not found" });
      }
      if (!isExecutive(actor) && lead.assigned_to !== actor.id) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Forbidden" });
      }

      const noteId = await insertLeadNote(client, {
        leadId: id,
        userId: actor.id,
        note,
      });
      const { rows } = await client.query(
        `SELECT n.*, u.name AS user_name
         FROM lead_notes n
         LEFT JOIN users u ON u.id = n.user_id
         WHERE n.id = $1 LIMIT 1`,
        [noteId]
      );
      await client.query("COMMIT");
      res.status(201).json(noteToJs(rows[0]));
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("POST /api/leads/:id/notes error:", e.message);
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });
}
