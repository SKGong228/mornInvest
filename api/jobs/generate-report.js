const {
  json,
  readJsonBody,
  requireCronSecret,
  requirePost,
} = require("../_lib/http");
const { generateReportText } = require("../_lib/llm");
const { insertReport } = require("../_lib/supabase");
const {
  markdownToBasicHtml,
  markdownToPlainText,
  wrapEmailHtml,
} = require("../_lib/render");

function getReportModelName() {
  if (process.env.QWEN_API_KEY) {
    return process.env.QWEN_REPORT_MODEL || "qwen3.7-plus";
  }

  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_REPORT_MODEL || "gpt-4.1-mini";
  }

  return process.env.GEMINI_REPORT_MODEL || "gemini-2.5-flash";
}

function extractTitle(markdown, fallback) {
  const firstHeading = String(markdown || "")
    .split("\n")
    .find((line) => line.startsWith("# "));
  return firstHeading ? firstHeading.slice(2).trim() : fallback;
}

module.exports = async function generateReport(req, res) {
  if (!requirePost(req, res) || !requireCronSecret(req, res)) {
    return;
  }

  try {
    const body = await readJsonBody(req);
    const reportType = String(body.report_type || "daily").slice(0, 40);
    const reportDate = String(body.report_date || new Date().toISOString().slice(0, 10)).slice(0, 80);
    const sourceItems = Array.isArray(body.source_items) ? body.source_items : [];

    if (!sourceItems.length) {
      return json(res, 400, {
        ok: false,
        message: "source_items is required. Do not generate reports without sources.",
      });
    }

    const markdown = await generateReportText({
      reportType,
      reportDate,
      sourceItems,
    });
    const title = extractTitle(markdown, `MornInvest ${reportType} report ${reportDate}`);
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
      report_id: report.id,
      title: report.title,
    });
  } catch (error) {
    console.error("generate-report error", error);
    return json(res, 500, {
      ok: false,
      message: "Report generation failed.",
    });
  }
};
