const { json } = require("./_lib/http");
const {
  getReportById,
  getSupabaseConfig,
  listReadyReports,
} = require("./_lib/supabase");
const { markdownToBasicHtml, markdownToPlainText } = require("./_lib/render");

function toPublicReport(report) {
  return {
    id: report.id,
    title: report.title,
    report_type: report.report_type,
    report_date: report.report_date,
    created_at: report.created_at,
    content_html: markdownToBasicHtml(report.markdown_body || ""),
    text_body:
      report.text_body || markdownToPlainText(report.markdown_body || ""),
  };
}

function isPublicReport(report) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(report.report_date || ""));
}

module.exports = async function reports(req, res) {
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
    const requestUrl = new URL(
      req.url,
      `https://${req.headers.host || "morninvest.com"}`
    );
    const id = requestUrl.searchParams.get("id");
    const reportType = requestUrl.searchParams.get("type") || "daily";
    const limit = id ? requestUrl.searchParams.get("limit") || 1 : 1;

    res.setHeader("Cache-Control", "public, max-age=60");

    if (id) {
      const report = await getReportById(id);
      if (!report || !isPublicReport(report)) {
        return json(res, 404, { ok: false, message: "Report not found." });
      }
      return json(res, 200, { ok: true, report: toPublicReport(report) });
    }

    const reports = await listReadyReports({ reportType, limit });
    return json(res, 200, {
      ok: true,
      reports: reports.filter(isPublicReport).map(toPublicReport),
    });
  } catch (error) {
    console.error("reports api error", error);
    return json(res, 500, {
      ok: false,
      message: "Reports are temporarily unavailable.",
    });
  }
};
