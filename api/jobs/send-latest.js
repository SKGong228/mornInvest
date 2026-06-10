const {
  json,
  readJsonBody,
  requireCronSecret,
  requirePost,
} = require("../_lib/http");
const { sendEmail } = require("../_lib/resend");
const { buildEmailSummary } = require("../_lib/email_summary");
const {
  getLatestReport,
  insertDelivery,
  listActiveSubscribers,
} = require("../_lib/supabase");

module.exports = async function sendLatest(req, res) {
  if (!requirePost(req, res) || !requireCronSecret(req, res)) {
    return;
  }

  try {
    const body = await readJsonBody(req);
    const reportType = String(body.report_type || "daily").slice(0, 40);
    const limit = Math.min(Number(body.limit || 500), 1000);
    const dryRun = Boolean(body.dry_run);

    const report = await getLatestReport(reportType);
    if (!report) {
      return json(res, 404, {
        ok: false,
        message: `No ready ${reportType} report found.`,
      });
    }

    const subscribers = await listActiveSubscribers(limit);
    const results = [];

    for (const subscriber of subscribers) {
      if (dryRun) {
        results.push({ email: subscriber.email, status: "dry_run" });
        continue;
      }

      try {
        const emailSummary = buildEmailSummary(report);
        const sent = await sendEmail({
          to: subscriber.email,
          subject: report.title,
          html: emailSummary.html,
          text: emailSummary.text,
        });

        await insertDelivery({
          subscriber_id: subscriber.id,
          report_id: report.id,
          email: subscriber.email,
          status: "sent",
          provider: "resend",
          provider_message_id: sent.id || null,
          sent_at: new Date().toISOString(),
        });

        results.push({ email: subscriber.email, status: "sent" });
      } catch (error) {
        await insertDelivery({
          subscriber_id: subscriber.id,
          report_id: report.id,
          email: subscriber.email,
          status: "failed",
          provider: "resend",
          error_message: String(error.message || error).slice(0, 500),
        });

        results.push({ email: subscriber.email, status: "failed" });
      }
    }

    return json(res, 200, {
      ok: true,
      report_id: report.id,
      report_type: reportType,
      total: subscribers.length,
      results,
    });
  } catch (error) {
    console.error("send-latest error", error);
    return json(res, 500, {
      ok: false,
      message: "Sending latest report failed.",
    });
  }
};
