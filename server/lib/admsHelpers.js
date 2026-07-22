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
  3: "password",
  4: "card",
  15: "face",
};

export function admsOk() {
  return "OK";
}

/** Plain-text ADMS response: Content-Type text/plain (no charset), status 200. */
export function sendAdmsText(res, body, status = 200) {
  const text = body == null ? "" : String(body);
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
  const raw = String(text ?? "");
  const buf = Buffer.from(raw, "utf8");
  console.log(`[adms RESP ${label}] bytes=${buf.length}`);
  console.log(`[adms RESP ${label}] utf8=<<${raw.replace(/\r/g, "\\r").replace(/\n/g, "\\n")}>>`);
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

/**
 * ZKTeco ADMS registration response for GET /iclock/cdata.
 * ATTLOGStamp=0 means send all attendance; Stamp=9999 would block pushes.
 * Use exact \r\n line endings — do not change without device testing.
 */
export function buildRegistrationResponse(serial) {
  const sn = serial || "DEVICE";
  return (
    `GET OPTION FROM: ${sn}\r\n` +
    `ATTLOGStamp=0\r\n` +
    `OPERLOGStamp=0\r\n` +
    `ATTPHOTOStamp=0\r\n` +
    `ErrorDelay=30\r\n` +
    `Delay=5\r\n` +
    `TransTimes=00:00;14:05\r\n` +
    `TransInterval=1\r\n` +
    `TransFlag=TransData AttLog OpLog\r\n` +
    `Realtime=1\r\n` +
    `Encrypt=0\r\n` +
    `TimeZone=5\r\n` +
    `ServerVer=2.4.1\r\n`
  );
}

/** Parse OPERLOG USER line: PIN, Name, Card, Pri, Passwd, Grp, TZ, Verify */
export function parseOperLogUserLine(line) {
  const s = String(line || "").trim();
  if (!s) return null;

  if (/^USER\b/i.test(s) || /\bPIN=/i.test(s)) {
    const fields = {};
    const re = /(\w+)=([^\t]*)/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      fields[m[1].toLowerCase()] = String(m[2] || "").trim();
    }
    const pin = parseInt(fields.pin, 10);
    if (!Number.isFinite(pin)) return null;
    return {
      pin,
      name: fields.name || "",
      card: fields.card || "",
      pri: fields.pri || "",
      passwd: fields.passwd || "",
      grp: fields.grp || "",
      tz: fields.tz || "",
      verify: fields.verify || "",
      rawData: line,
    };
  }

  const parts = s.split("\t");
  if (parts.length >= 2 && /^\d+$/.test(parts[0].trim())) {
    return {
      pin: parseInt(parts[0].trim(), 10),
      name: (parts[1] || "").trim(),
      card: (parts[2] || "").trim(),
      pri: (parts[3] || "").trim(),
      passwd: (parts[4] || "").trim(),
      grp: (parts[5] || "").trim(),
      tz: (parts[6] || "").trim(),
      verify: (parts[7] || "").trim(),
      rawData: line,
    };
  }

  return null;
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
