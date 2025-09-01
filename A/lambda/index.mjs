import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const ses = new SESv2Client({ region: process.env.AWS_REGION });

const ok = (origin, body) => ({
  statusCode: 200,
  headers: {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "false",
    "Vary": "Origin"
  },
  body: JSON.stringify(body)
});
const err = (origin, code, msg) => ({
  statusCode: code,
  headers: {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "false",
    "Vary": "Origin"
  },
  body: JSON.stringify({ error: msg })
});

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const origin = event.headers?.origin || event.headers?.Origin || "*";
  const allowedOrigin = process.env.ALLOWED_ORIGIN;

  // Preflight
  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": (origin === allowedOrigin) ? origin : allowedOrigin,
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      },
      body: ""
    };
  }

  if (origin !== allowedOrigin) return err(allowedOrigin, 403, "Forbidden origin");
  if (method !== "POST") return err(allowedOrigin, 405, "Method Not Allowed");

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return err(allowedOrigin, 400, "Invalid JSON"); }

  // Honeypot
  if (data.website) return ok(allowedOrigin, { status: "ok" });

  const name = (data.name||"").trim();
  const email = (data.email||"").trim();
  const phone = (data.phone||"").trim();
  const city = (data.city||"").trim();
  const service = (data.service||"").trim();
  const message = (data.message||"").trim();
  const page = (data.page||"").trim();
  const userAgent = (data.userAgent||"").trim();

  if (!name || !email || !service || !message) {
    return err(allowedOrigin, 422, "Missing required fields");
  }

  const fromEmail = process.env.FROM_EMAIL; // e.g., no-reply@stallionsteelworks.com
  const toEmail   = process.env.TO_EMAIL;   // your inbox

  const subject = `Stallion SteelWorks Contact — ${name} (${service})`;
  const textBody =
`New inquiry:

Name: ${name}
Email: ${email}
Phone: ${phone}
City/Area: ${city}
Service: ${service}

Message:
${message}

Page: ${page}
User-Agent: ${userAgent}`;

  const htmlBody =
`<h2>New inquiry</h2>
<p><strong>Name:</strong> ${esc(name)}<br>
<strong>Email:</strong> ${esc(email)}<br>
<strong>Phone:</strong> ${esc(phone)}<br>
<strong>City/Area:</strong> ${esc(city)}<br>
<strong>Service:</strong> ${esc(service)}</p>
<p><strong>Message:</strong><br>${esc(message).replace(/\n/g,'<br>')}</p>
<hr>
<p><strong>Page:</strong> ${esc(page)}<br>
<strong>User-Agent:</strong> ${esc(userAgent)}</p>`;

  try {
    await ses.send(new SendEmailCommand({
      FromEmailAddress: fromEmail,
      Destination: { ToAddresses: [toEmail] },
      ReplyToAddresses: [email],
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: textBody, Charset: "UTF-8" },
            Html: { Data: htmlBody, Charset: "UTF-8" }
          }
        }
      }
    }));
    return ok(allowedOrigin, { status: "ok" });
  } catch (e) {
    console.error("SES send failed:", e);
    return err(allowedOrigin, 500, "Email send failed");
  }
};

function esc(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
