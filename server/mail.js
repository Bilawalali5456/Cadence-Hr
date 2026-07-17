import nodemailer from "nodemailer";

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

function buildCredentialsHtml({ name, email, password, role, isReset, loginUrl }) {
  const greeting = isReset ? "Your password has been reset" : "Welcome to Adforce HR";
  const intro = isReset
    ? `<p style="margin:0 0 16px;color:#334155;">Hi ${name}, your Adforce HR login password has been reset by an administrator.</p>`
    : `<p style="margin:0 0 16px;color:#334155;">Hi ${name}, your ${roleLabel(role)} account for Adforce HR has been created.</p>`;

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;color:#ffffff;padding:20px 24px;font-size:18px;font-weight:700;">
      Adforce HR
    </div>
    <div style="padding:24px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${greeting}</h1>
      ${intro}
      <div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 8px;color:#475569;font-size:13px;">Login email</p>
        <p style="margin:0 0 16px;color:#0f172a;font-size:15px;font-weight:700;">${email}</p>
        <p style="margin:0 0 8px;color:#475569;font-size:13px;">${isReset ? "New temporary password" : "Temporary password"}</p>
        <p style="margin:0;color:#0f172a;font-size:15px;font-weight:700;font-family:Consolas,monospace;">${password}</p>
      </div>
      <p style="margin:0 0 16px;color:#334155;">Please sign in and change your password on first login.</p>
      ${
        loginUrl
          ? `<p style="margin:0 0 16px;"><a href="${loginUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Open Adforce HR</a></p>`
          : ""
      }
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

  const loginUrl = process.env.APP_URL || "";
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from || !String(from).includes("@")) {
    throw new Error("SMTP_FROM / SMTP_USER must be a valid email address");
  }

  const subject = isReset
    ? "Adforce HR — your password has been reset"
    : `Adforce HR — your ${roleLabel(role)} account is ready`;

  await getTransporter().sendMail({
    from,
    to: recipient,
    subject,
    text: [
      `Hi ${name},`,
      "",
      isReset
        ? "Your Adforce HR login password has been reset."
        : `Your ${roleLabel(role)} account for Adforce HR has been created.`,
      "",
      `Login email: ${email}`,
      `${isReset ? "New temporary password" : "Temporary password"}: ${password}`,
      "",
      "Please sign in and change your password on first login.",
      loginUrl ? `Sign in: ${loginUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    html: buildCredentialsHtml({ name, email, password, role, isReset, loginUrl }),
  });
}

function buildNotificationHtml({ name, subject, body, link }) {
  const portalUrl = link || process.env.APP_URL || "https://hr.adforcesolutions.com";
  const safeBody = String(body || "").replace(/\n/g, "<br/>");

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;color:#ffffff;padding:20px 24px;font-size:18px;font-weight:700;">
      Adforce HR
    </div>
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

  const portalUrl = link || process.env.APP_URL || "https://hr.adforcesolutions.com";
  const safeSubject = String(subject || "Adforce HR notification").trim();

  await getTransporter().sendMail({
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
    html: buildNotificationHtml({ name: name || "there", subject: safeSubject, body, link: portalUrl }),
  });
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

  const portalUrl = process.env.APP_URL || "https://hr.adforcesolutions.com";
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

  await getTransporter().sendMail({
    from,
    to: recipient,
    subject,
    text: [`Hi ${name || "there"},`, "", body, "", `View in HR Portal: ${portalUrl}`].join("\n"),
    html: buildNotificationHtml({
      name: name || "there",
      subject,
      body,
      link: portalUrl,
    }),
  });
}
