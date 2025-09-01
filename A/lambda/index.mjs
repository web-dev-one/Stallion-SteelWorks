// index.mjs — Contact form mailer (Node 18 / AWS Lambda / SES v2)
// CORS allow-list + SES email send

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

// Region: Lambda injects AWS_REGION automatically; fallback for local runs.
const REGION = process.env.AWS_REGION || "us-east-1";
const ses = new SESv2Client({ region: REGION });

// ---- CORS allow-list helpers ----
// Set env ALLOWED_ORIGINS to a comma-separated list, e.g.
// "https://stallionsteelworks.com,https://www.stallionsteelworks.com"
const allowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsOriginFor(origin) {
  return allowed.includes(origin) ? origin : "";
}

function ok(origin, body) {
  const allow = corsOriginFor(origin);
  return {
    statusCode: 200,
    headers: allow
      ? {
          "Access-Control-Allow-Origin": allow,
          "Access-Control-Allow-Credentials": "false",
          "Vary": "Origin",
        }
      : {},
    body: JSON.stringify(body),
  };
}

function err(origin, code, msg) {
  const allow = corsOriginFor(origin);
  return {
    statusCode: code,
    headers: allow
      ? {
          "Access-Control-Allow-Origin": allow,
          "Access-Control-Allow-Credentials": "false",
          "Vary": "Origin",
        }
      : {},
    body: JSON.stringify({ error: msg }),
  };
}

// ---- HTML escaping helper ----
function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ---- Lambda handler ----
export const handler = async (event) => {
  const method =
    event.requestContext?.http?.method || event.httpMethod || "GET";
  const origin = event.headers?.origin || event.headers?.Origin || "";

  // CORS preflight
  if (method === "OPTIONS") {
    const allow = corsOriginFor(origin);
    return {
      statusCode: allow ? 204 : 403,
      headers: allow
        ? {
            "Access-Control-Allow-Origin": allow,
            "Access-Control-Allow-Methods": "POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
            "Vary": "Origin",
          }
        : {},
      body: "",
    };
  }

  // Enforce allowed origins for actual requests
  if (!corsOriginFor(origin)) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden origin" }) };
  }

  if (method !== "POST") {
    return err(origin, 405, "Method Not Allowed");
  }

  // Parse JSON body
  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return err(origin, 400, "Invalid JSON");
  }

  // Honeypot: silently succeed to mislead bots
  if (data.website) {
    return ok(origin, { status: "ok" });
  }

  // Extract + validate fields
  const name = (data.name || "").trim();
  const email = (data.email || "").trim();
  const phone = (data.phone || "").trim();
  const city = (data.city || "").trim();
  const service = (data.service || "").trim();
  const message = (data.message || "").trim();
  const page = (data.page || "").trim();
  const userAgent = (data.userAgent || "").trim();

  if (!name || !email || !service || !message) {
    return err(origin, 422, "Missing required fields");
  }

  // Env vars
  const FROM_EMAIL = process.env.FROM_EMAIL; // e.g., no-reply@stallionsteelworks.com (domain must be SES-verified)
  const TO_EMAIL = process.env.TO_EMAIL;     // e.g., stallionsteelworks@gmail.com

  if (!FROM_EMAIL || !TO_EMAIL) {
    console.error("Missing FROM_EMAIL or TO_EMAIL env var");
    return err(origin, 500, "Server not configured");
  }

  // Compose email
  const subject = `Stallion SteelWorks Contact — ${name} (${service})`;

  const textBody = `New inquiry:

Name: ${name}
Email: ${email}
Phone: ${phone}
City/Area: ${city}
Service: ${service}

Message:
${message}

Page: ${page}
User-Agent: ${userAgent}
`;

  const htmlBody = `<h2>New inquiry</h2>
<p><strong>Name:</strong> ${esc(name)}<br>
<strong>Email:</strong> ${esc(email)}<br>
<strong>Phone:</strong> ${esc(phone)}<br>
<strong>City/Area:</strong> ${esc(city)}<br>
<strong>Service:</strong> ${esc(service)}</p>
<p><strong>Message:</strong><br>${esc(message).replace(/\n/g, "<br>")}</p>
<hr>
<p><strong>Page:</strong> ${esc(page)}<br>
<strong>User-Agent:</strong> ${esc(userAgent)}</p>`;

  // Send via SES v2
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: FROM_EMAIL,
        Destination: { ToAddresses: [TO_EMAIL] },
        ReplyToAddresses: [email], // replying goes to the customer
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: textBody, Charset: "UTF-8" },
              Html: { Data: htmlBody, Charset: "UTF-8" },
            },
          },
        },
      })
    );

    return ok(origin, { status: "ok" });
  } catch (e) {
    console.error("SES send failed:", e);
    return err(origin, 500, "Email send failed");
  }
};
