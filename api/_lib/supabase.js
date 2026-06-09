function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return {
    baseUrl: url.replace(/\/$/, ""),
    key,
  };
}

function requireSupabase() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured.");
  }
  return config;
}

async function supabaseFetch(path, options = {}) {
  const { baseUrl, key } = requireSupabase();
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Supabase ${path} returned ${response.status}: ${text}`);
  }

  return body;
}

async function upsertSubscriber(payload) {
  const [subscriber] = await supabaseFetch("subscribers?on_conflict=email", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      email: payload.email,
      watchlist: payload.watchlist,
      status: "active",
      source: payload.source,
      page: payload.page,
      user_agent: payload.user_agent,
      updated_at: payload.created_at,
    }),
  });

  return subscriber;
}

async function insertReport(report) {
  const [created] = await supabaseFetch("reports", {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(report),
  });

  return created;
}

async function getLatestReport(reportType) {
  const rows = await supabaseFetch(
    `reports?select=*&report_type=eq.${encodeURIComponent(
      reportType
    )}&status=eq.ready&order=report_date.desc,created_at.desc&limit=1`
  );
  return rows[0] || null;
}

async function getReadyReportForDate(reportType, reportDate) {
  const rows = await supabaseFetch(
    `reports?select=*&report_type=eq.${encodeURIComponent(
      reportType
    )}&report_date=eq.${encodeURIComponent(
      reportDate
    )}&status=eq.ready&order=created_at.desc&limit=1`
  );
  return rows[0] || null;
}

async function getReportById(reportId) {
  const rows = await supabaseFetch(
    `reports?select=*&id=eq.${encodeURIComponent(
      reportId
    )}&status=eq.ready&limit=1`
  );
  return rows[0] || null;
}

async function listReadyReports({ reportType, limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const typeFilter = reportType
    ? `&report_type=eq.${encodeURIComponent(reportType)}`
    : "";

  return supabaseFetch(
    `reports?select=id,title,report_type,report_date,markdown_body,text_body,created_at&status=eq.ready${typeFilter}&order=report_date.desc,created_at.desc&limit=${safeLimit}`
  );
}

async function listActiveSubscribers(limit = 1000) {
  return supabaseFetch(
    `subscribers?select=*&status=eq.active&order=created_at.asc&limit=${limit}`
  );
}

async function listSubscribers(limit = 1000) {
  const safeLimit = Math.min(Math.max(Number(limit) || 1000, 1), 5000);
  return supabaseFetch(
    `subscribers?select=id,email,watchlist,status,source,page,created_at,updated_at&order=created_at.desc&limit=${safeLimit}`
  );
}

async function getSentDelivery({ reportId, email }) {
  const rows = await supabaseFetch(
    `email_deliveries?select=*&report_id=eq.${encodeURIComponent(
      reportId
    )}&email=eq.${encodeURIComponent(email)}&status=eq.sent&limit=1`
  );
  return rows[0] || null;
}

async function insertDelivery(delivery) {
  const [created] = await supabaseFetch("email_deliveries", {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(delivery),
  });

  return created;
}

module.exports = {
  getSupabaseConfig,
  getLatestReport,
  getReportById,
  getReadyReportForDate,
  getSentDelivery,
  insertDelivery,
  insertReport,
  listReadyReports,
  listActiveSubscribers,
  listSubscribers,
  upsertSubscriber,
};
