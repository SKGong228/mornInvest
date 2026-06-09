const { json } = require("./_lib/http");
const {
  getSupabaseConfig,
  listActiveSubscribers,
  listSubscribers,
} = require("./_lib/supabase");

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

function publicStats(subscribers) {
  return {
    active_count: subscribers.length,
  };
}

function adminStats(subscribers) {
  const active = subscribers.filter((subscriber) => subscriber.status === "active");
  const withWatchlist = subscribers.filter(
    (subscriber) => Array.isArray(subscriber.watchlist) && subscriber.watchlist.length
  );

  return {
    total_count: subscribers.length,
    active_count: active.length,
    inactive_count: subscribers.length - active.length,
    with_watchlist_count: withWatchlist.length,
  };
}

module.exports = async function subscribers(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, message: "Method not allowed" });
  }

  if (!getSupabaseConfig()) {
    return json(res, 500, {
      ok: false,
      message: "Supabase is not configured.",
    });
  }

  try {
    if (!hasAdminAccess(req)) {
      const activeSubscribers = await listActiveSubscribers(5000);
      res.setHeader("Cache-Control", "public, max-age=60");
      return json(res, 200, {
        ok: true,
        stats: publicStats(activeSubscribers),
      });
    }

    const subscribers = await listSubscribers(5000);
    return json(res, 200, {
      ok: true,
      stats: adminStats(subscribers),
      subscribers,
    });
  } catch (error) {
    console.error("subscribers api error", error);
    return json(res, 500, {
      ok: false,
      message: "Subscribers are temporarily unavailable.",
    });
  }
};
