const {
  json,
  readJsonBody,
} = require("./_lib/http");
const {
  getSupabaseConfig,
  insertAnalyticsEvent,
  listAnalyticsEvents,
} = require("./_lib/supabase");

const ALLOWED_EVENTS = new Set(["report_view", "report_copy", "report_cta_click"]);

function getAdminSecret() {
  return process.env.ADMIN_SECRET || process.env.CRON_SECRET || "";
}

function hasAdminAccess(req) {
  const configuredSecret = getAdminSecret();
  if (!configuredSecret) {
    return false;
  }

  const requestUrl = new URL(
    req.url,
    `https://${req.headers.host || "morninvest.com"}`
  );
  const querySecret = requestUrl.searchParams.get("key") || "";
  const headerSecret = req.headers["x-admin-secret"] || "";
  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  return [querySecret, headerSecret, bearer].includes(configuredSecret);
}

function safeString(value, maxLength = 300) {
  return String(value || "").trim().slice(0, maxLength);
}

function summarize(events) {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recent = events.filter((event) => {
    const time = new Date(event.created_at).getTime();
    return Number.isFinite(time) && time >= sevenDaysAgo;
  });

  const counts = {
    report_views_7d: 0,
    report_copies_7d: 0,
    report_cta_clicks_7d: 0,
  };
  const reportCounts = {};

  for (const event of recent) {
    if (event.event_type === "report_view") {
      counts.report_views_7d += 1;
    }
    if (event.event_type === "report_copy") {
      counts.report_copies_7d += 1;
    }
    if (event.event_type === "report_cta_click") {
      counts.report_cta_clicks_7d += 1;
    }

    const reportKey = event.report_date || event.report_id || "unknown";
    reportCounts[reportKey] = (reportCounts[reportKey] || 0) + 1;
  }

  return {
    ...counts,
    report_counts: Object.entries(reportCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([report, count]) => ({ report, count })),
    recent_events: recent.slice(0, 50),
  };
}

module.exports = async function analytics(req, res) {
  if (!getSupabaseConfig()) {
    return json(res, 500, {
      ok: false,
      message: "Supabase is not configured.",
    });
  }

  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const eventType = safeString(body.event_type, 40);
      if (!ALLOWED_EVENTS.has(eventType)) {
        return json(res, 400, { ok: false, message: "Unsupported event type." });
      }

      const created = await insertAnalyticsEvent({
        event_type: eventType,
        report_id: safeString(body.report_id, 80) || null,
        report_date: safeString(body.report_date, 40) || null,
        path: safeString(body.path, 500),
        session_id: safeString(body.session_id, 120),
        user_agent: safeString(req.headers["user-agent"], 500),
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      });

      return json(res, 200, { ok: true, id: created.id });
    } catch (error) {
      console.error("analytics post error", error);
      return json(res, 500, { ok: false, message: "Analytics event failed." });
    }
  }

  if (req.method === "GET") {
    if (!hasAdminAccess(req)) {
      return json(res, 401, { ok: false, message: "Unauthorized." });
    }

    try {
      const events = await listAnalyticsEvents(5000);
      return json(res, 200, {
        ok: true,
        stats: summarize(events),
      });
    } catch (error) {
      console.error("analytics get error", error);
      return json(res, 500, { ok: false, message: "Analytics are temporarily unavailable." });
    }
  }

  return json(res, 405, { ok: false, message: "Method not allowed" });
};
