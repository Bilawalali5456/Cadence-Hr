/**
 * ZKTeco ADMS protocol helpers — parsing, response formatting, logging.
 */

export const PUNCH_TYPES = {
  0: "check_in",
  1: "check_out",
  2: "break_out",
  3: "break_in",
  4: "ot_in",
  5: "ot_out",
};

export const VERIFY_METHODS = {
  0: "password",
  1: "fingerprint",
  2: "card",
  15: "face",
};

export function admsOk() {
  return "OK\n";
}

export function sendAdmsText(res, body, status = 200) {
  // Exact Content-Type text/plain — NO charset. Trailing newline required.
  let text = body == null ? "" : String(body);
  if (!text.endsWith("\n")) text += "\n";
  const buf = Buffer.from(text, "utf8");
  res.status(status);
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Length", buf.length);
  res.setHeader("Connection", "close");
  res.removeHeader("ETag");
  res.removeHeader("X-Powered-By");
  res.end(buf);
}

/** Log exact handshake/response bytes for debugging */
export function logAdmsResponseBytes(label, text) {
  const raw = text.endsWith("\n") ? text : `${text}\n`;
  const buf = Buffer.from(raw, "utf8");
  console.log(`[adms RESP ${label}] bytes=${buf.length}`);
  console.log(`[adms RESP ${label}] utf8=<<${raw.replace(/\n/g, "\\n")}>>`);
  console.log(`[adms RESP ${label}] hex=${buf.toString("hex")}`);
}

export function splitLines(body) {
  if (!body || typeof body !== "string") return [];
  return body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
}

export function parseZktTime(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse ATTLOG tab-separated line: user_id\ttimestamp\tstatus\tverify_type\t... */
export function parseAttLogLine(line) {
  let parts = line.split("\t");
  // Some firmware variants use multiple spaces instead of tabs
  if (parts.length < 2) {
    parts = line.trim().split(/\s{2,}|\s+/);
    // Reconstruct timestamp if split as "2026-07-21" "09:00:15"
    if (parts.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) && /^\d{2}:\d{2}:\d{2}$/.test(parts[2])) {
      parts = [parts[0], `${parts[1]} ${parts[2]}`, ...parts.slice(3)];
    }
  }
  if (parts.length < 2) return null;
  const deviceUserId = parseInt(String(parts[0] || "").trim(), 10);
  const tsRaw = String(parts[1] || "").trim();
  if (!Number.isFinite(deviceUserId) || !tsRaw) return null;
  const punchTime = parseZktTime(tsRaw);
  if (!punchTime) return null;
  const statusCode = parseInt(parts[2], 10) || 0;
  const verifyCode = parseInt(parts[3], 10) || 0;
  return {
    deviceUserId,
    punchTime,
    statusCode,
    punchType: PUNCH_TYPES[statusCode] || "check_in",
    verifyMethod: VERIFY_METHODS[verifyCode] || "unknown",
    rawData: line,
  };
}

export function buildRegistrationResponse(serial) {
  const sn = serial || "DEVICE";
  // Exact lines — Stamp=None means "send everything" on some ZKTeco firmware
  return [
    `GET OPTION FROM: ${sn}`,
    "Stamp=None",
    "OpStamp=None",
    "PhotoStamp=None",
    "ErrorDelay=30",
    "Delay=5",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=1111000000",
    "Realtime=1",
    "TimeZone=5",
    "OPERLOGStamp=None",
    "ATTLOGStamp=None",
    "ATTPHOTOStamp=None",
    "ServerVer=2.4.1",
    "TableNameStamp=None",
  ].join("\n");
}

/** Log every POST /iclock/cdata in full for debugging missing ATTLOG pushes */
export function logPostCdataVerbose(req, body) {
  const serial = String(req.query.SN || req.query.sn || "").trim();
  const table = String(req.query.table || req.query.Table || "");
  const stamp = String(req.query.Stamp || req.query.stamp || "");
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) headers[k] = v;
  const bodyStr = body != null ? String(body) : "";
  const bodyType = typeof req.body;
  console.log("[adms POST /iclock/cdata] ══════════════════════════════════════");
  console.log(`[adms POST] SN=${serial} table=${table} Stamp=${stamp}`);
  console.log(`[adms POST] query=`, JSON.stringify(req.query));
  console.log(`[adms POST] headers=`, JSON.stringify(headers));
  console.log(`[adms POST] bodyType=${bodyType} bodyLength=${bodyStr.length}`);
  console.log(`[adms POST] rawBody=<<${bodyStr}>>`);
  console.log("[adms POST /iclock/cdata] ══════════════════════════════════════");
}

export async function logRawRequest(pool, { serial, method, path, query, body }) {
  try {
    await pool.query(
      `INSERT INTO biometric_raw_logs (device_serial, request_method, request_path, query_params, request_body)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        serial || null,
        method || "",
        path || "",
        query ? JSON.stringify(query) : "",
        body != null ? String(body).slice(0, 50000) : "",
      ]
    );
  } catch (e) {
    console.error("[adms] raw log error:", e.message);
  }
}

export function logAdms(event, detail = "") {
  const ts = new Date().toISOString();
  console.log(`[adms ${ts}] ${event}${detail ? ` — ${detail}` : ""}`);
}
