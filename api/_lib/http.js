function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function requirePost(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { ok: false, message: "Method not allowed" });
    return false;
  }
  return true;
}

function requireCronSecret(req, res) {
  if (!process.env.CRON_SECRET) {
    json(res, 500, { ok: false, message: "CRON_SECRET is not configured." });
    return false;
  }

  const headerSecret = req.headers["x-cron-secret"];
  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (headerSecret !== process.env.CRON_SECRET && bearer !== process.env.CRON_SECRET) {
    json(res, 401, { ok: false, message: "Unauthorized." });
    return false;
  }

  return true;
}

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) {
    return "invalid";
  }
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
}

module.exports = {
  json,
  maskEmail,
  readJsonBody,
  requireCronSecret,
  requirePost,
};

