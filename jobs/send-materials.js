const fs = require("node:fs/promises");
const path = require("node:path");
const { sendEmail } = require("../api/_lib/resend");
const {
  getReadyReportForDate,
  insertDelivery,
  listDeliveriesForReport,
  listSubscribers,
} = require("../api/_lib/supabase");

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

async function fileAttachment(filePath) {
  const content = await fs.readFile(filePath);
  return {
    filename: path.basename(filePath),
    content: content.toString("base64"),
  };
}

async function main() {
  const reportDate = process.env.REPORT_DATE || getBeijingDate();
  const recipients = String(process.env.MATERIALS_RECIPIENTS || "gongshk@outlook.com")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  const zipPath =
    process.env.MATERIALS_ZIP ||
    path.join("report-output", `morninvest-${reportDate}-materials.zip`);

  await fs.access(zipPath);

  const report = await getReadyReportForDate("daily", reportDate);
  if (!report) {
    throw new Error(`No ready daily report found for ${reportDate}.`);
  }

  const dashboard = await buildValidationDashboard({ report, reportDate });
  const attachment = await fileAttachment(zipPath);
  const results = [];
  for (const recipient of recipients) {
    const existing = await findSentMaterialsDelivery({
      reportId: report.id,
      email: recipient,
    });
    if (existing) {
      results.push({ recipient, status: "already_sent" });
      continue;
    }

    const sent = await sendEmail({
      to: recipient,
      subject: `MornInvest 运营素材包｜${reportDate}`,
      html: `
        <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#111827;">
          <h2>MornInvest 运营素材包｜${reportDate}</h2>
          <p>附件里包含今天的雪球 Word、小红书图片和社媒文案。</p>
          ${dashboard.html}
          <p>文件包括：<br>
          1. 雪球 Word 文档<br>
          2. 小红书 6 张图片<br>
          3. 小红书/雪球发布文案</p>
          <p style="color:#64748b;font-size:13px;">本文和素材仅用于信息整理，不构成投资建议。</p>
        </div>
      `,
      text: [
        `MornInvest 运营素材包｜${reportDate}`,
        "",
        "附件里包含今天的雪球 Word、小红书图片和社媒文案。",
        "",
        dashboard.text,
        "",
        "1. 雪球 Word 文档",
        "2. 小红书 6 张图片",
        "3. 小红书/雪球发布文案",
        "",
        "本文和素材仅用于信息整理，不构成投资建议。",
      ].join("\n"),
      attachments: [attachment],
    });
    await insertDelivery({
      subscriber_id: null,
      report_id: report.id,
      email: recipient,
      status: "sent",
      provider: "resend-materials",
      provider_message_id: sent.id || null,
      sent_at: new Date().toISOString(),
    });
    results.push({ recipient, status: "sent", id: sent.id || null });
  }

  console.log(JSON.stringify({ ok: true, report_date: reportDate, zip: zipPath, results }, null, 2));
}

async function buildValidationDashboard({ report, reportDate }) {
  const [subscribers, deliveries] = await Promise.all([
    listSubscribers(5000),
    listDeliveriesForReport(report.id),
  ]);
  const activeSubscribers = subscribers.filter((subscriber) => subscriber.status === "active");
  const newSubscribers = subscribers.filter(
    (subscriber) => beijingDateFromIso(subscriber.created_at) === reportDate
  );
  const mainDeliveries = deliveries.filter((delivery) => delivery.provider !== "resend-materials");
  const sentCount = mainDeliveries.filter((delivery) => delivery.status === "sent").length;
  const failedCount = mainDeliveries.filter((delivery) => delivery.status === "failed").length;
  const materialsSentCount = deliveries.filter(
    (delivery) => delivery.provider === "resend-materials" && delivery.status === "sent"
  ).length;

  const rows = [
    ["日报状态", "ready"],
    ["当前有效订阅", String(activeSubscribers.length)],
    ["今日新增订阅", String(newSubscribers.length)],
    ["主日报已发送", String(sentCount)],
    ["主日报失败", String(failedCount)],
    ["素材包已发送", String(materialsSentCount)],
  ];

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;color:#64748b;">${escapeHtml(
          label
        )}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:700;">${escapeHtml(
          value
        )}</td></tr>`
    )
    .join("");
  const text = ["每日验证看板", ...rows.map(([label, value]) => `${label}：${value}`)].join("\n");

  return {
    html: `
      <h3 style="margin-top:22px;">每日验证看板</h3>
      <table style="border-collapse:collapse;font-size:14px;">${htmlRows}</table>
    `,
    text,
  };
}

function beijingDateFromIso(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function findSentMaterialsDelivery({ reportId, email }) {
  const { getSupabaseConfig } = require("../api/_lib/supabase");
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured.");
  }

  const response = await fetch(
    `${config.baseUrl}/rest/v1/email_deliveries?select=*&report_id=eq.${encodeURIComponent(
      reportId
    )}&email=eq.${encodeURIComponent(
      email
    )}&provider=eq.resend-materials&status=eq.sent&limit=1`,
    {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
    }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase email_deliveries returned ${response.status}: ${text}`);
  }
  const rows = text ? JSON.parse(text) : [];
  return rows[0] || null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
