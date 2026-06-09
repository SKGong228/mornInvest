const { json, requireCronSecret } = require("../_lib/http");
const { generateReportText } = require("../_lib/llm");
const { collectAShareMapping } = require("../_lib/a_share_mapping");
const { collectMarketDashboard } = require("../_lib/market");
const { collectPolicyCalendar } = require("../_lib/macro_calendar");
const { collectTechMarketSourceItems } = require("../_lib/news");
const { collectAShareDashboard } = require("../_lib/tushare");
const { getReadyReportForDate, insertReport } = require("../_lib/supabase");
const {
  markdownToBasicHtml,
  markdownToPlainText,
  wrapEmailHtml,
} = require("../_lib/render");

function getBeijingDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function extractTitle(markdown, fallback) {
  const firstHeading = String(markdown || "")
    .split("\n")
    .find((line) => line.startsWith("# "));
  return firstHeading ? firstHeading.slice(2).trim() : fallback;
}

function getReportModelName() {
  if (process.env.QWEN_API_KEY) {
    return process.env.QWEN_REPORT_MODEL || "qwen3.7-plus";
  }

  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_REPORT_MODEL || "gpt-4.1-mini";
  }

  return process.env.GEMINI_REPORT_MODEL || "gemini-2.5-flash";
}

module.exports = async function morningGenerate(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, message: "Method not allowed" });
  }

  if (!requireCronSecret(req, res)) {
    return;
  }

  const reportType = "daily";
  const reportDate = getBeijingDate();

  try {
    const existing = await getReadyReportForDate(reportType, reportDate);
    if (existing) {
      return json(res, 200, {
        ok: true,
        status: "skipped",
        message: `Ready ${reportType} report already exists for ${reportDate}.`,
        report_id: existing.id,
        report_date: reportDate,
      });
    }

    const [marketDashboard, aShareDashboard, policyCalendar, aShareMapping, newsItems] = await Promise.all([
      collectMarketDashboard({ reportDate }),
      collectAShareDashboard({ reportDate }),
      collectPolicyCalendar({ reportDate }),
      collectAShareMapping(),
      collectTechMarketSourceItems({ reportDate }),
    ]);
    const sourceItems = [
      marketDashboard,
      aShareDashboard,
      policyCalendar,
      aShareMapping,
      ...newsItems,
    ].filter(Boolean);
    if (sourceItems.length < 5) {
      return json(res, 200, {
        ok: true,
        status: "skipped",
        message: "Not enough source items to generate a daily report.",
        report_date: reportDate,
        source_count: sourceItems.length,
      });
    }

    const markdown = await generateReportText({
      reportType,
      reportDate,
      sourceItems,
    });
    const title = extractTitle(markdown, `MornInvest 美股科技晨报｜${reportDate}`);
    const htmlBody = wrapEmailHtml(title, markdownToBasicHtml(markdown));

    const report = await insertReport({
      report_type: reportType,
      report_date: reportDate,
      title,
      markdown_body: markdown,
      html_body: htmlBody,
      text_body: markdownToPlainText(markdown),
      source_items: sourceItems,
      status: "ready",
      model: getReportModelName(),
    });

    return json(res, 200, {
      ok: true,
      status: "created",
      report_id: report.id,
      report_date: reportDate,
      source_count: sourceItems.length,
      title: report.title,
    });
  } catch (error) {
    console.error("morning-generate cron error", error);
    return json(res, 500, {
      ok: false,
      message: "Morning generate cron failed.",
    });
  }
};
