import nodemailer from "nodemailer";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORTAL_URL = "https://hrms.adforcesolutions.com";
const LOGO_CANDIDATES = [
  path.join(__dirname, "..", "dist", "adforce-logo.png"),
  path.join(__dirname, "..", "public", "adforce-logo.png"),
  path.join(__dirname, "assets", "adforce-logo.png"),
];

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env"
    );
  }

  const port = Number(SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: SMTP_SECURE === "true" || (SMTP_SECURE !== "false" && port === 465),
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

function roleLabel(role) {
  if (role === "Executive") return "Executive";
  if (role === "HR Admin") return "HR Admin";
  return "Employee";
}

function portalLoginUrl() {
  return String(process.env.APP_URL || DEFAULT_PORTAL_URL).replace(/\/+$/, "");
}

function findLogoPath() {
  return LOGO_CANDIDATES.find((p) => existsSync(p)) || null;
}

function logoHeaderHtml(includeCidLogo) {
  if (includeCidLogo) {
    return `
      <div style="background:#0f172a;padding:20px 24px;text-align:center;">
        <img src="cid:adforce-logo" alt="Adforce Solutions" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;" />
      </div>`;
  }
  return `
    <div style="background:#0f172a;color:#ffffff;padding:20px 24px;font-size:18px;font-weight:700;text-align:center;">
      Adforce Solutions
    </div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCredentialsHtml({ name, email, password, role, isReset, loginUrl, includeCidLogo }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(password);
  const safeUrl = escapeHtml(loginUrl);
  const greeting = isReset
    ? "Your password has been reset"
    : "Welcome to Adforce Solutions";
  const intro = isReset
    ? `<p style="margin:0 0 16px;color:#334155;line-height:1.5;">Hi ${safeName}, your Adforce Solutions HRMS login password has been reset by an administrator.</p>`
    : `<p style="margin:0 0 16px;color:#334155;line-height:1.5;">Hi ${safeName}, welcome to <b>Adforce Solutions</b>. Your ${escapeHtml(roleLabel(role))} account for the HRMS portal has been created.</p>`;

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    ${logoHeaderHtml(includeCidLogo)}
    <div style="padding:24px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${greeting}</h1>
      ${intro}
      <p style="margin:0 0 8px;color:#475569;font-size:13px;">Portal login URL</p>
      <p style="margin:0 0 16px;">
        <a href="${safeUrl}" style="color:#0f172a;font-size:15px;font-weight:700;word-break:break-all;">${safeUrl}</a>
      </p>
      <div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 8px;color:#475569;font-size:13px;">Email (username)</p>
        <p style="margin:0 0 16px;color:#0f172a;font-size:15px;font-weight:700;">${safeEmail}</p>
        <p style="margin:0 0 8px;color:#475569;font-size:13px;">${isReset ? "New temporary password" : "Temporary password"}</p>
        <p style="margin:0;color:#0f172a;font-size:15px;font-weight:700;font-family:Consolas,monospace;">${safePassword}</p>
      </div>
      <p style="margin:0 0 16px;color:#334155;line-height:1.5;">Please change your password after your first login.</p>
      <p style="margin:0 0 20px;color:#334155;line-height:1.5;">Click the link above, enter your email and password to access the HR portal where you can view your attendance, request leaves, and more.</p>
      <p style="margin:0 0 16px;">
        <a href="${safeUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Open HRMS Portal</a>
      </p>
      <p style="margin:0;color:#64748b;font-size:12px;">If you did not expect this email, contact your HR administrator.</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendCredentialsEmail({
  to,
  name,
  email,
  password,
  role = "Employee",
  isReset = false,
}) {
  const recipient = String(to || email || "").trim();
  if (!recipient || !recipient.includes("@")) {
    throw new Error(`Invalid recipient email: "${recipient || "(empty)"}"`);
  }

  const loginUrl = portalLoginUrl();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from || !String(from).includes("@")) {
    throw new Error("SMTP_FROM / SMTP_USER must be a valid email address");
  }

  const logoPath = findLogoPath();
  const includeCidLogo = !!logoPath;
  const subject = isReset
    ? "Adforce Solutions HRMS — your password has been reset"
    : `Welcome to Adforce Solutions — your ${roleLabel(role)} HRMS account is ready`;

  console.log(`[mail] Sending credentials email → to=${recipient} role=${role || "Employee"} reset=${!!isReset} loginUrl=${loginUrl}`);

  const mailOptions = {
    from,
    to: recipient,
    subject,
    text: [
      `Hi ${name},`,
      "",
      isReset
        ? "Your Adforce Solutions HRMS login password has been reset by an administrator."
        : `Welcome to Adforce Solutions. Your ${roleLabel(role)} account for the HRMS portal has been created.`,
      "",
      `Portal login URL: ${loginUrl}`,
      `Email (username): ${email}`,
      `${isReset ? "New temporary password" : "Temporary password"}: ${password}`,
      "",
      "Please change your password after your first login.",
      "",
      "Click the link above, enter your email and password to access the HR portal where you can view your attendance, request leaves, and more.",
    ].join("\n"),
    html: buildCredentialsHtml({
      name,
      email,
      password,
      role,
      isReset,
      loginUrl,
      includeCidLogo,
    }),
  };

  if (logoPath) {
    mailOptions.attachments = [
      {
        filename: "adforce-logo.png",
        path: logoPath,
        cid: "adforce-logo",
        contentDisposition: "inline",
      },
    ];
  }

  try {
    const info = await getTransporter().sendMail(mailOptions);
    console.log(`[mail] Credentials email sent → to=${recipient} messageId=${info?.messageId || "n/a"}`);
    return info;
  } catch (e) {
    console.error(`[mail] Credentials email FAILED → to=${recipient} role=${role}:`, e?.message || e);
    throw e;
  }
}

function buildNotificationHtml({ name, subject, body, link, includeCidLogo = false }) {
  const portalUrl = link || portalLoginUrl();
  const safeBody = String(body || "").replace(/\n/g, "<br/>");

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    ${logoHeaderHtml(includeCidLogo)}
    <div style="padding:24px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${subject}</h1>
      <p style="margin:0 0 16px;color:#334155;">Hi ${name},</p>
      <div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin:0 0 16px;color:#334155;font-size:14px;line-height:1.5;">
        ${safeBody}
      </div>
      <p style="margin:0 0 16px;">
        <a href="${portalUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">View in HR Portal</a>
      </p>
      <p style="margin:0;color:#64748b;font-size:12px;">This is an automated message from Adforce HR.</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendNotificationEmail({ to, name, subject, body, link }) {
  const recipient = String(to || "").trim();
  if (!recipient || !recipient.includes("@")) {
    throw new Error(`Invalid recipient email: "${recipient || "(empty)"}"`);
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from || !String(from).includes("@")) {
    throw new Error("SMTP_FROM / SMTP_USER must be a valid email address");
  }

  const portalUrl = link || portalLoginUrl();
  const safeSubject = String(subject || "Adforce HR notification").trim();
  const logoPath = findLogoPath();
  const includeCidLogo = !!logoPath;
  const mailOptions = {
    from,
    to: recipient,
    subject: safeSubject,
    text: [
      `Hi ${name || "there"},`,
      "",
      body || "",
      "",
      `View in HR Portal: ${portalUrl}`,
    ].join("\n"),
    html: buildNotificationHtml({
      name: name || "there",
      subject: safeSubject,
      body,
      link: portalUrl,
      includeCidLogo,
    }),
  };
  if (logoPath) {
    mailOptions.attachments = [
      {
        filename: "adforce-logo.png",
        path: logoPath,
        cid: "adforce-logo",
        contentDisposition: "inline",
      },
    ];
  }
  await getTransporter().sendMail(mailOptions);
}

export async function sendWarningEmail({ to, name, warningType, reason, date }) {
  const recipient = String(to || "").trim();
  if (!recipient || !recipient.includes("@")) {
    throw new Error(`Invalid recipient email: "${recipient || "(empty)"}"`);
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from || !String(from).includes("@")) {
    throw new Error("SMTP_FROM / SMTP_USER must be a valid email address");
  }

  const portalUrl = portalLoginUrl();
  const typeLabel = String(warningType || "Warning").trim();
  const subject = `Adforce Solutions — ${typeLabel} Issued`;
  const body = [
    `A ${typeLabel.toLowerCase()} has been issued to you.`,
    "",
    `Type: ${typeLabel}`,
    `Date: ${date || "—"}`,
    `Reason: ${reason || "—"}`,
    "",
    "Please acknowledge this warning in the HR portal under My Profile → Warnings.",
  ].join("\n");

  const logoPath = findLogoPath();
  const includeCidLogo = !!logoPath;
  const mailOptions = {
    from,
    to: recipient,
    subject,
    text: [`Hi ${name || "there"},`, "", body, "", `View in HR Portal: ${portalUrl}`].join("\n"),
    html: buildNotificationHtml({
      name: name || "there",
      subject,
      body,
      link: portalUrl,
      includeCidLogo,
    }),
  };
  if (logoPath) {
    mailOptions.attachments = [
      {
        filename: "adforce-logo.png",
        path: logoPath,
        cid: "adforce-logo",
        contentDisposition: "inline",
      },
    ];
  }
  await getTransporter().sendMail(mailOptions);
}
