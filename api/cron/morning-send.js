const { json, requireCronSecret } = require("../_lib/http");
const { sendEmail } = require("../_lib/resend");
const {
  getReadyReportForDate,
  getSentDelivery,
  insertDelivery,
  listActiveSubscribers,
} = require("../_lib/supabase");

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

module.exports = async function morningSend(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, message: "Method not allowed" });
  }

  if (!requireCronSecret(req, res)) {
    return;
  }

  const reportType = "daily";
  const reportDate = getBeijingDate();

  try {
    const report = await getReadyReportForDate(reportType, reportDate);
    if (!report) {
      return json(res, 200, {
        ok: true,
        status: "skipped",
        message: `No ready ${reportType} report found for ${reportDate}.`,
        report_date: reportDate,
      });
    }

    const allowlist = String(process.env.SEND_ALLOWLIST || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const subscribers = (await listActiveSubscribers(1000)).filter((subscriber) => {
      if (!allowlist.length) {
        return true;
      }
      return allowlist.includes(String(subscriber.email || "").toLowerCase());
    });
    const results = [];

    for (const subscriber of subscribers) {
      const existing = await getSentDelivery({
        reportId: report.id,
        email: subscriber.email,
      });

      if (existing) {
        results.push({ email: subscriber.email, status: "already_sent" });
        continue;
      }

      try {
        const sent = await sendEmail({
          to: subscriber.email,
          subject: report.title,
          html: report.html_body,
          text: report.text_body,
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
      status: "completed",
      report_id: report.id,
      report_date: reportDate,
      total: subscribers.length,
      results,
    });
  } catch (error) {
    console.error("morning-send cron error", error);
    return json(res, 500, {
      ok: false,
      message: "Morning send cron failed.",
    });
  }
};
