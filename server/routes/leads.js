import {
  notifyLeadAssigned,
  notifyLeadReassigned,
  notifyLeadStageChanged,
  notifyLeadOnBoarded,
  fetchUserName,
} from "../lib/notify.js";

export const LEAD_STAGES = ["First Call", "In Consideration", "On Boarded"];
export const LEAD_STATUSES = ["Completed", "Off Boarded", "On Hold"];
export const PAYMENT_METHODS = ["Bank Transfer", "PayPal", "Wise", "Cash", "Upwork", "Other"];
export const PAYMENT_STATUSES = ["Received", "Pending", "Partial", "Overdue"];
export const PAYMENT_CURRENCIES = ["USD", "PKR", "GBP"];

const DEFAULT_CHANNEL_NAMES = new Set([
  "Upwork",
  "LinkedIn",
  "Ads",
  "Direct",
  "Referral",
  "Cold Calling",
  "Email Marketing",
]);

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isExecutive(user) {
  return user?.role === "Executive";
}

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

function normalizeLeadStatus(status, stage) {
  if (stage !== "On Boarded") return null;
  if (status == null || status === "") return null;
  const s = String(status).trim();
  return LEAD_STATUSES.includes(s) ? s : null;
}

function normalizePaymentCurrency(currency) {
  const c = String(currency || "USD").trim().toUpperCase();
  return PAYMENT_CURRENCIES.includes(c) ? c : "USD";
}

function normalizePaymentStatus(status) {
  const s = String(status || "Pending").trim();
  return PAYMENT_STATUSES.includes(s) ? s : "Pending";
}

function normalizePaymentMethod(method) {
  const m = String(method || "").trim();
  if (!m) return "";
  return PAYMENT_METHODS.includes(m) ? m : m;
}

function toDateOnly(value, fallback = null) {
  if (!value) return fallback;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

function todayPktDate() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

function monthRange(month) {
  const m = String(month || "").trim();
  const mm = /^(\d{4})-(\d{2})$/.exec(m);
  if (!mm) return null;
  const year = Number(mm[1]);
  const monthIndex = Number(mm[2]) - 1;
  const start = `${mm[1]}-${mm[2]}-01`;
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 0));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, "0")}-${String(endDate.getUTCDate()).padStart(2, "0")}`;
  return { start, end };
}

function leadToJs(r) {
  return {
    id: r.id,
    clientName: r.client_name,
    businessName: r.business_name || "",
    channel: r.channel,
    source: r.channel,
    assignedTo: r.assigned_to || null,
    assignedToName: r.assigned_to_name || undefined,
    stage: r.stage || "First Call",
    opportunity: r.stage || "First Call",
    status: r.status || null,
    workSummary: r.description || "",
    description: r.description || "",
    rate: r.rate || "",
    monthlyRevenue: r.monthly_revenue || "",
    businessWebsite: r.business_website || "",
    socialHandleUrl: r.social_handle_url || "",
    notes: r.notes || "",
    leadDate: r.lead_date || null,
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

function paymentToJs(r) {
  return {
    id: r.id,
    leadId: r.lead_id,
    clientName: r.client_name || undefined,
    assignedTo: r.assigned_to || null,
    assignedToName: r.assigned_to_name || undefined,
    amount: r.amount != null ? Number(r.amount) : 0,
    currency: r.currency || "USD",
    paymentDate: r.payment_date || null,
    paymentMethod: r.payment_method || "",
    paymentStatus: r.payment_status || "Pending",
    notes: r.notes || "",
    createdBy: r.created_by || null,
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
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

async function assertCanViewLead(actor, lead) {
  if (isExecutive(actor)) return true;
  if (isLeadWorker(actor) && lead.assigned_to === actor.id) return true;
  return false;
}

export function registerLeadsRoutes(app, pool, requireAuth, requireExecutive) {
  // ─── Sources (channels) ───
  app.get("/api/lead-channels", requireAuth, async (req, res) => {
    try {
      if (!canAccessLeads(req.authUser)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { rows } = await pool.query(`SELECT * FROM lead_channels ORDER BY LOWER(name)`);
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
      if (e.code === "23505") return res.status(409).json({ error: "Source already exists" });
      console.error("POST /api/lead-channels error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/lead-channels/:id", requireAuth, requireExecutive, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const { rows } = await pool.query(`SELECT * FROM lead_channels WHERE id = $1 LIMIT 1`, [id]);
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Source not found" });
      if (DEFAULT_CHANNEL_NAMES.has(row.name)) {
        return res.status(403).json({ error: "Cannot delete default sources" });
      }
      await pool.query(`DELETE FROM lead_channels WHERE id = $1`, [id]);
      res.json({ ok: true });
    } catch (e) {
      console.error("DELETE /api/lead-channels/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Payment summary (before :id routes) ───
  app.get("/api/lead-payments/summary", requireAuth, requireExecutive, async (req, res) => {
    try {
      const range = monthRange(req.query.month);
      const params = [];
      let filter = "";
      if (range) {
        params.push(range.start, range.end);
        filter = `WHERE p.payment_date >= $1 AND p.payment_date <= $2`;
      }
      const { rows } = await pool.query(
        `SELECT
           p.currency,
           p.payment_status,
           COALESCE(SUM(p.amount), 0)::float AS total
         FROM lead_payments p
         ${filter}
         GROUP BY p.currency, p.payment_status`,
        params
      );
      const byCurrency = {};
      let received = 0;
      let pending = 0;
      let overdue = 0;
      let partial = 0;
      for (const r of rows) {
        const cur = r.currency || "USD";
        if (!byCurrency[cur]) byCurrency[cur] = { received: 0, pending: 0, partial: 0, overdue: 0 };
        const amt = Number(r.total) || 0;
        const st = r.payment_status;
        if (st === "Received") {
          byCurrency[cur].received += amt;
          received += amt;
        } else if (st === "Pending") {
          byCurrency[cur].pending += amt;
          pending += amt;
        } else if (st === "Partial") {
          byCurrency[cur].partial += amt;
          partial += amt;
        } else if (st === "Overdue") {
          byCurrency[cur].overdue += amt;
          overdue += amt;
        }
      }
      res.json({
        month: req.query.month || null,
        received,
        pending,
        partial,
        overdue,
        pendingOrPartial: pending + partial,
        byCurrency,
        rows,
      });
    } catch (e) {
      console.error("GET /api/lead-payments/summary error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/lead-payments", requireAuth, requireExecutive, async (req, res) => {
    try {
      const range = monthRange(req.query.month);
      const status = String(req.query.status || "").trim();
      const employeeId = String(req.query.employeeId || req.query.assignedTo || "").trim();
      const params = [];
      const where = [];
      if (range) {
        params.push(range.start, range.end);
        where.push(`p.payment_date >= $${params.length - 1} AND p.payment_date <= $${params.length}`);
      }
      if (status && PAYMENT_STATUSES.includes(status)) {
        params.push(status);
        where.push(`p.payment_status = $${params.length}`);
      }
      if (employeeId) {
        params.push(employeeId);
        where.push(`l.assigned_to = $${params.length}`);
      }
      const sql = `
        SELECT p.*, l.client_name, l.assigned_to, u.name AS assigned_to_name
        FROM lead_payments p
        JOIN leads l ON l.id = p.lead_id
        LEFT JOIN users u ON u.id = l.assigned_to
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY p.payment_date DESC, p.created_at DESC
      `;
      const { rows } = await pool.query(sql, params);
      res.json(rows.map(paymentToJs));
    } catch (e) {
      console.error("GET /api/lead-payments error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Leads CRUD ───
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
      sql += ` ORDER BY COALESCE(l.lead_date, l.created_at::date) DESC, l.updated_at DESC`;
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
      const channel = String(body.channel || body.source || "").trim();
      const stage = normalizeStage(body.stage || body.opportunity) || "First Call";
      const status = normalizeLeadStatus(body.status, stage);
      const workSummary = String(body.workSummary || body.description || "").trim();
      const rate = String(body.rate || "").trim();
      const businessName = String(body.businessName || body.business_name || "").trim();
      const monthlyRevenue = String(body.monthlyRevenue || body.monthly_revenue || "").trim();
      const businessWebsite = String(body.businessWebsite || body.business_website || "").trim();
      const socialHandleUrl = String(body.socialHandleUrl || body.social_handle_url || "").trim();
      const notes = String(body.notes || "").trim();
      const leadDate = toDateOnly(body.leadDate || body.lead_date || body.date, todayPktDate());
      const assignedTo = body.assignedTo || body.assigned_to || null;

      if (!clientName) return res.status(400).json({ error: "clientName is required" });
      if (!channel) return res.status(400).json({ error: "source is required" });

      await client.query("BEGIN");
      const assignee = await assertAssigneeValid(client, assignedTo);
      const id = genId("lead");
      await client.query(
        `INSERT INTO leads (
           id, client_name, channel, assigned_to, stage, status,
           description, rate, business_name, monthly_revenue,
           business_website, social_handle_url, notes, lead_date, added_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          id, clientName, channel, assignee?.id || null, stage, status,
          workSummary, rate, businessName, monthlyRevenue,
          businessWebsite, socialHandleUrl, notes, leadDate, req.authUser.id,
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
        await notifyLeadAssigned(client, { assigneeId: assignee.id, clientName });
      }
      if (stage === "On Boarded") {
        await notifyLeadOnBoarded(client, { clientName, excludeUserId: req.authUser.id });
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
      if (!isExec && existing.assigned_to !== actor.id) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Forbidden — not your lead" });
      }

      let next = {
        client_name: existing.client_name,
        channel: existing.channel,
        assigned_to: existing.assigned_to,
        stage: existing.stage,
        status: existing.status,
        description: existing.description || "",
        rate: existing.rate || "",
        business_name: existing.business_name || "",
        monthly_revenue: existing.monthly_revenue || "",
        business_website: existing.business_website || "",
        social_handle_url: existing.social_handle_url || "",
        notes: existing.notes || "",
        lead_date: existing.lead_date,
      };

      const oldAssignee = existing.assigned_to;
      const oldStage = existing.stage;
      let freeNoteText = null;

      if (isExec) {
        if (body.clientName !== undefined || body.client_name !== undefined) {
          next.client_name = String(body.clientName ?? body.client_name ?? "").trim();
          if (!next.client_name) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "clientName is required" });
          }
        }
        if (body.channel !== undefined || body.source !== undefined) {
          next.channel = String(body.channel ?? body.source ?? "").trim();
        }
        if (body.workSummary !== undefined || body.description !== undefined) {
          next.description = String(body.workSummary ?? body.description ?? "").trim();
        }
        if (body.rate !== undefined) next.rate = String(body.rate || "").trim();
        if (body.businessName !== undefined || body.business_name !== undefined) {
          next.business_name = String(body.businessName ?? body.business_name ?? "").trim();
        }
        if (body.monthlyRevenue !== undefined || body.monthly_revenue !== undefined) {
          next.monthly_revenue = String(body.monthlyRevenue ?? body.monthly_revenue ?? "").trim();
        }
        if (body.businessWebsite !== undefined || body.business_website !== undefined) {
          next.business_website = String(body.businessWebsite ?? body.business_website ?? "").trim();
        }
        if (body.socialHandleUrl !== undefined || body.social_handle_url !== undefined) {
          next.social_handle_url = String(body.socialHandleUrl ?? body.social_handle_url ?? "").trim();
        }
        if (body.notes !== undefined) next.notes = String(body.notes || "").trim();
        if (body.leadDate !== undefined || body.lead_date !== undefined || body.date !== undefined) {
          next.lead_date = toDateOnly(body.leadDate ?? body.lead_date ?? body.date, next.lead_date);
        }
        if (body.assignedTo !== undefined || body.assigned_to !== undefined) {
          const raw = body.assignedTo ?? body.assigned_to;
          if (raw) {
            const assignee = await assertAssigneeValid(client, raw);
            next.assigned_to = assignee.id;
          } else {
            next.assigned_to = null;
          }
        }
        if (!next.channel) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "source is required" });
        }

        // Status — Executive only, and only when On Boarded
        if (body.status !== undefined) {
          // will normalize after stage resolved
        }
      }

      if (body.stage !== undefined || body.opportunity !== undefined) {
        const stage = normalizeStage(body.stage ?? body.opportunity);
        if (!stage) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Invalid opportunity stage" });
        }
        next.stage = stage;
      }

      if (isExec && body.status !== undefined) {
        next.status = normalizeLeadStatus(body.status, next.stage);
      } else if (!isExec) {
        // Employees cannot change status
        next.status = next.stage === "On Boarded" ? existing.status : null;
      }

      if (next.stage !== "On Boarded") {
        next.status = null;
      } else if (isExec && body.status !== undefined) {
        next.status = normalizeLeadStatus(body.status, next.stage);
      }

      if (body.note !== undefined && String(body.note).trim()) {
        freeNoteText = String(body.note).trim();
      }

      await client.query(
        `UPDATE leads SET
           client_name = $1, channel = $2, assigned_to = $3, stage = $4, status = $5,
           description = $6, rate = $7, business_name = $8, monthly_revenue = $9,
           business_website = $10, social_handle_url = $11, notes = $12, lead_date = $13
         WHERE id = $14`,
        [
          next.client_name, next.channel, next.assigned_to, next.stage, next.status,
          next.description, next.rate, next.business_name, next.monthly_revenue,
          next.business_website, next.social_handle_url, next.notes, next.lead_date, id,
        ]
      );

      if (next.stage !== oldStage) {
        const actorName = await fetchUserName(client, actor.id) || actor.name || "Someone";
        await insertLeadNote(client, {
          leadId: id,
          userId: actor.id,
          note: `Stage changed from ${oldStage} to ${next.stage} by ${actorName}`,
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
        if (next.stage === "On Boarded" && oldStage !== "On Boarded") {
          await notifyLeadOnBoarded(client, {
            clientName: next.client_name,
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
      if (!canAccessLeads(actor)) return res.status(403).json({ error: "Forbidden" });
      const id = String(req.params.id || "");
      const lead = await fetchLeadById(pool, id);
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      if (!(await assertCanViewLead(actor, lead))) {
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
      if (!canAccessLeads(actor)) return res.status(403).json({ error: "Forbidden" });
      const id = String(req.params.id || "");
      const note = String(req.body?.note || "").trim();
      if (!note) return res.status(400).json({ error: "note is required" });

      await client.query("BEGIN");
      const lead = await fetchLeadById(client, id);
      if (!lead) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Lead not found" });
      }
      if (!(await assertCanViewLead(actor, lead))) {
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

  // ─── Payments per lead ───
  app.get("/api/leads/:id/payments", requireAuth, async (req, res) => {
    try {
      const actor = req.authUser;
      if (!canAccessLeads(actor)) return res.status(403).json({ error: "Forbidden" });
      const id = String(req.params.id || "");
      const lead = await fetchLeadById(pool, id);
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      if (!(await assertCanViewLead(actor, lead))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { rows } = await pool.query(
        `SELECT p.*, l.client_name, l.assigned_to, u.name AS assigned_to_name
         FROM lead_payments p
         JOIN leads l ON l.id = p.lead_id
         LEFT JOIN users u ON u.id = l.assigned_to
         WHERE p.lead_id = $1
         ORDER BY p.payment_date DESC, p.created_at DESC`,
        [id]
      );
      res.json(rows.map(paymentToJs));
    } catch (e) {
      console.error("GET /api/leads/:id/payments error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/leads/:id/payments", requireAuth, requireExecutive, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const lead = await fetchLeadById(pool, id);
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const body = req.body || {};
      const amount = Number(body.amount);
      if (!Number.isFinite(amount)) {
        return res.status(400).json({ error: "amount is required" });
      }
      const paymentDate = toDateOnly(body.paymentDate || body.payment_date || body.date, todayPktDate());
      if (!paymentDate) return res.status(400).json({ error: "paymentDate is required" });

      const payId = genId("lpay");
      const { rows } = await pool.query(
        `INSERT INTO lead_payments (
           id, lead_id, amount, currency, payment_date, payment_method, payment_status, notes, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          payId,
          id,
          amount,
          normalizePaymentCurrency(body.currency),
          paymentDate,
          normalizePaymentMethod(body.paymentMethod || body.payment_method),
          normalizePaymentStatus(body.paymentStatus || body.payment_status),
          String(body.notes || "").trim(),
          req.authUser.id,
        ]
      );
      res.status(201).json(paymentToJs({
        ...rows[0],
        client_name: lead.client_name,
        assigned_to: lead.assigned_to,
        assigned_to_name: lead.assigned_to_name,
      }));
    } catch (e) {
      console.error("POST /api/leads/:id/payments error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/lead-payments/:id", requireAuth, requireExecutive, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const { rows: existingRows } = await pool.query(
        `SELECT p.*, l.client_name, l.assigned_to, u.name AS assigned_to_name
         FROM lead_payments p
         JOIN leads l ON l.id = p.lead_id
         LEFT JOIN users u ON u.id = l.assigned_to
         WHERE p.id = $1 LIMIT 1`,
        [id]
      );
      const existing = existingRows[0];
      if (!existing) return res.status(404).json({ error: "Payment not found" });

      const body = req.body || {};
      const amount = body.amount !== undefined ? Number(body.amount) : Number(existing.amount);
      if (!Number.isFinite(amount)) return res.status(400).json({ error: "Invalid amount" });

      const paymentDate = body.paymentDate !== undefined || body.payment_date !== undefined || body.date !== undefined
        ? toDateOnly(body.paymentDate ?? body.payment_date ?? body.date, existing.payment_date)
        : existing.payment_date;

      const { rows } = await pool.query(
        `UPDATE lead_payments SET
           amount = $1,
           currency = $2,
           payment_date = $3,
           payment_method = $4,
           payment_status = $5,
           notes = $6
         WHERE id = $7
         RETURNING *`,
        [
          amount,
          body.currency !== undefined ? normalizePaymentCurrency(body.currency) : existing.currency,
          paymentDate,
          body.paymentMethod !== undefined || body.payment_method !== undefined
            ? normalizePaymentMethod(body.paymentMethod ?? body.payment_method)
            : existing.payment_method,
          body.paymentStatus !== undefined || body.payment_status !== undefined
            ? normalizePaymentStatus(body.paymentStatus ?? body.payment_status)
            : existing.payment_status,
          body.notes !== undefined ? String(body.notes || "").trim() : existing.notes,
          id,
        ]
      );
      res.json(paymentToJs({
        ...rows[0],
        client_name: existing.client_name,
        assigned_to: existing.assigned_to,
        assigned_to_name: existing.assigned_to_name,
      }));
    } catch (e) {
      console.error("PUT /api/lead-payments/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/lead-payments/:id", requireAuth, requireExecutive, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const { rowCount } = await pool.query(`DELETE FROM lead_payments WHERE id = $1`, [id]);
      if (!rowCount) return res.status(404).json({ error: "Payment not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error("DELETE /api/lead-payments/:id error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
