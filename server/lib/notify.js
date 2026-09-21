/** Persist in-app notifications (survives client polls). */
export async function insertNotification(client, { userId, title, body = "", type = "leave", link = "" }) {
  if (!userId || !title) return null;
  const id = `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  await client.query(
    `INSERT INTO notifications (id, user_id, title, body, type, read, created_at, link)
     VALUES ($1,$2,$3,$4,$5,false,$6,$7)`,
    [id, userId, title, body || "", type, createdAt, String(link || "").replace(/^\//, "")]
  );
  return id;
}

export async function insertNotifications(client, notes) {
  for (const n of notes || []) {
    await insertNotification(client, n);
  }
}

/** Active HR Employee user ids. */
export async function fetchHrEmployeeIds(client) {
  const { rows } = await client.query(
    `SELECT id FROM users WHERE role = 'HR Employee' AND status = 'active'`
  );
  return rows.map(r => r.id);
}

/** Team lead id for an employee (if any). */
export async function fetchTeamLeadId(client, employeeId) {
  const { rows } = await client.query(
    `SELECT team_lead_id FROM users WHERE id = $1 LIMIT 1`,
    [employeeId]
  );
  return rows[0]?.team_lead_id || null;
}

export async function fetchUserName(client, userId) {
  if (!userId) return "";
  const { rows } = await client.query(`SELECT name FROM users WHERE id = $1 LIMIT 1`, [userId]);
  return rows[0]?.name || "";
}

/**
 * Notify Team Lead (if assigned) + all HR Employees about a leave application.
 */
export async function notifyLeaveSubmitted(client, leave) {
  const empName = leave.empName || leave.emp_name || "An employee";
  const type = leave.type || "Leave";
  const from = leave.from || leave.from_date || "";
  const to = leave.to || leave.to_date || from;
  const userId = leave.userId || leave.user_id;
  const dates = from === to ? from : `${from} → ${to}`;
  const title = "New leave request";
  const body = `${empName} submitted ${type} leave for ${dates}.`;

  const recipients = new Set(await fetchHrEmployeeIds(client));
  const tlId = await fetchTeamLeadId(client, userId);
  if (tlId) recipients.add(tlId);
  recipients.delete(userId);

  await insertNotifications(
    client,
    [...recipients].map(id => ({ userId: id, title, body, type: "leave", link: "leave" }))
  );
}

export async function notifyShortLeaveSubmitted(client, shortLeave) {
  const empName = shortLeave.empName || shortLeave.emp_name || "An employee";
  const date = shortLeave.date || "";
  const from = shortLeave.fromTime || shortLeave.from_time || "";
  const to = shortLeave.toTime || shortLeave.to_time || "";
  const userId = shortLeave.userId || shortLeave.user_id;
  const title = "New short leave request";
  const body = `${empName} submitted short leave for ${date} (${from}–${to}).`;

  const recipients = new Set(await fetchHrEmployeeIds(client));
  const tlId = await fetchTeamLeadId(client, userId);
  if (tlId) recipients.add(tlId);
  recipients.delete(userId);

  await insertNotifications(
    client,
    [...recipients].map(id => ({ userId: id, title, body, type: "leave", link: "shortleave" }))
  );
}

/**
 * Notify employee + Team Lead + HR when Executive decides leave.
 */
export async function notifyLeaveDecision(client, leave, newStatus) {
  const label = newStatus === "approved" ? "Approved" : "Rejected";
  const empName = leave.empName || leave.emp_name || "Employee";
  const type = leave.type || "Leave";
  const from = leave.from || leave.from_date || "";
  const to = leave.to || leave.to_date || from;
  const userId = leave.userId || leave.user_id;
  const dates = from === to ? from : `${from} → ${to}`;

  await insertNotification(client, {
    userId,
    title: `Leave ${label}`,
    body: `Your ${type} request for ${dates} has been ${newStatus}.`,
    type: "leave",
    link: "leave",
  });

  const watchers = new Set(await fetchHrEmployeeIds(client));
  const tlId = await fetchTeamLeadId(client, userId);
  if (tlId) watchers.add(tlId);
  watchers.delete(userId);

  const watcherBody = `${empName}'s ${type} leave (${dates}) was ${label} by Executive.`;
  await insertNotifications(
    client,
    [...watchers].map(id => ({
      userId: id,
      title: `Leave ${label}`,
      body: watcherBody,
      type: "leave",
      link: "leave",
    }))
  );
}

export async function notifyShortLeaveDecision(client, shortLeave, newStatus) {
  const label = newStatus === "approved" ? "Approved" : "Rejected";
  const empName = shortLeave.empName || shortLeave.emp_name || "Employee";
  const date = shortLeave.date || "";
  const userId = shortLeave.userId || shortLeave.user_id;

  await insertNotification(client, {
    userId,
    title: `Short leave ${label}`,
    body: `Your short leave for ${date} has been ${newStatus}.`,
    type: "leave",
    link: "shortleave",
  });

  const watchers = new Set(await fetchHrEmployeeIds(client));
  const tlId = await fetchTeamLeadId(client, userId);
  if (tlId) watchers.add(tlId);
  watchers.delete(userId);

  await insertNotifications(
    client,
    [...watchers].map(id => ({
      userId: id,
      title: `Short leave ${label}`,
      body: `${empName}'s short leave (${date}) was ${label} by Executive.`,
      type: "leave",
      link: "shortleave",
    }))
  );
}

export async function notifyWeeklyReportSubmitted(client, { employeeId, employeeName, weekStart, weekEnd }) {
  const tlId = await fetchTeamLeadId(client, employeeId);
  if (!tlId) return;
  await insertNotification(client, {
    userId: tlId,
    title: "Weekly report submitted",
    body: `${employeeName || "A team member"} submitted their weekly report (${weekStart} – ${weekEnd}).`,
    type: "report",
    link: "teamreports",
  });
}

/** Active Executive user ids. */
export async function fetchExecutiveIds(client) {
  const { rows } = await client.query(
    `SELECT id FROM users WHERE role = 'Executive' AND status = 'active'`
  );
  return rows.map(r => r.id);
}

export async function notifyLeadAssigned(client, { assigneeId, clientName }) {
  if (!assigneeId || !clientName) return;
  await insertNotification(client, {
    userId: assigneeId,
    title: "New lead assigned",
    body: `New lead assigned: ${clientName}`,
    type: "lead",
    link: "myleads",
  });
}

export async function notifyLeadReassigned(client, { oldAssigneeId, newAssigneeId, clientName }) {
  const name = clientName || "a lead";
  if (oldAssigneeId && oldAssigneeId !== newAssigneeId) {
    await insertNotification(client, {
      userId: oldAssigneeId,
      title: "Lead reassigned",
      body: `Lead ${name} removed from you`,
      type: "lead",
      link: "myleads",
    });
  }
  if (newAssigneeId && newAssigneeId !== oldAssigneeId) {
    await insertNotification(client, {
      userId: newAssigneeId,
      title: "Lead assigned",
      body: `Lead ${name} assigned to you`,
      type: "lead",
      link: "myleads",
    });
  }
}

export async function notifyLeadStageChanged(client, { employeeName, clientName, stage, excludeUserId }) {
  const title = "Lead stage updated";
  const body = `${employeeName || "An employee"} moved ${clientName || "a lead"} to ${stage}`;
  const executives = await fetchExecutiveIds(client);
  await insertNotifications(
    client,
    executives
      .filter(id => id !== excludeUserId)
      .map(userId => ({ userId, title, body, type: "lead", link: "leads" }))
  );
}

export async function notifyLeadWon(client, { clientName, amount, currency, excludeUserId }) {
  const amt = Number(amount) || 0;
  const cur = currency || "PKR";
  const formatted = amt
    ? `${cur} ${amt.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : cur;
  const title = "Deal Won";
  const body = `Deal Won: ${clientName || "Lead"} — ${formatted}`;
  const executives = await fetchExecutiveIds(client);
  await insertNotifications(
    client,
    executives
      .filter(id => id !== excludeUserId)
      .map(userId => ({ userId, title, body, type: "lead", link: "leads" }))
  );
}
