const { generateReportText } = require("../api/_lib/llm");
const { collectMarketDashboard } = require("../api/_lib/market");
const { collectTechMarketSourceItems } = require("../api/_lib/news");
const { collectAShareDashboard } = require("../api/_lib/tushare");
const {
  getReadyReportForDate,
  insertReport,
} = require("../api/_lib/supabase");
const {
  markdownToBasicHtml,
  markdownToPlainText,
  wrapEmailHtml,
} = require("../api/_lib/render");

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

function formatDatedTitle(markdown, reportDate) {
  const baseTitle = extractTitle(markdown, "MornInvest 美股科技晨报")
    .replace(/｜\d{4}-\d{2}-\d{2}$/, "")
    .trim();
  return `${baseTitle}｜${reportDate}`;
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

async function main() {
  const reportType = "daily";
  const reportDate = process.env.REPORT_DATE || getBeijingDate();
  const forceRegenerate = /^(1|true|yes)$/i.test(process.env.FORCE_REGENERATE || "");

  const existing = await getReadyReportForDate(reportType, reportDate);
  if (existing && !forceRegenerate) {
    console.log(
      JSON.stringify({
        ok: true,
        status: "skipped",
        reason: "report_exists",
        report_id: existing.id,
        report_date: reportDate,
      })
    );
    return;
  }

  const [marketDashboard, aShareDashboard, newsItems] = await Promise.all([
    collectMarketDashboard(),
    collectAShareDashboard({ reportDate }),
    collectTechMarketSourceItems({ reportDate }),
  ]);
  const sourceItems = [marketDashboard, aShareDashboard, ...newsItems].filter(Boolean);
  if (sourceItems.length < 5) {
    console.log(
      JSON.stringify({
        ok: true,
        status: "skipped",
        reason: "not_enough_sources",
        report_date: reportDate,
        source_count: sourceItems.length,
      })
    );
    return;
  }

  const markdown = await generateReportText({
    reportType,
    reportDate,
    sourceItems,
  });
  const title = formatDatedTitle(markdown, reportDate);
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

  console.log(
    JSON.stringify({
      ok: true,
      status: "created",
      report_id: report.id,
      report_date: reportDate,
      source_count: sourceItems.length,
      title: report.title,
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
