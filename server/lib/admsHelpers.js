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
  return "OK\r\n";
}

export function sendAdmsText(res, body, status = 200) {
  const text = body.endsWith("\r\n") ? body : `${body}\r\n`;
  res.status(status);
  // ZKTeco firmware rejects charset suffix and extra Express headers (ETag, CORS, etc.)
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Length", Buffer.byteLength(text, "utf8"));
  res.setHeader("Connection", "close");
  res.removeHeader("ETag");
  res.end(text);
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
  const parts = line.split("\t");
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

export function buildRegistrationResponse(serial, stamps = {}) {
  const sn = serial || "DEVICE";
  return [
    `GET OPTION FROM: ${sn}`,
    `ATTLOGStamp=${stamps.attlogStamp ?? 0}`,
    `OPERLOGStamp=${stamps.operlogStamp ?? 0}`,
    `ATTPHOTOStamp=${stamps.attphotoStamp ?? 0}`,
    "ErrorDelay=60",
    "Delay=5",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=TransData AttLog\tOpLog\tAttPhoto",
    "Realtime=1",
    "TimeZone=5",
    "ServerVer=2.4.1",
  ].join("\r\n");
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
