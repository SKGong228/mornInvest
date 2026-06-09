const fs = require("node:fs/promises");
const path = require("node:path");
const { sendEmail } = require("../api/_lib/resend");

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

  const attachment = await fileAttachment(zipPath);
  const results = [];
  for (const recipient of recipients) {
    const sent = await sendEmail({
      to: recipient,
      subject: `MornInvest 运营素材包｜${reportDate}`,
      html: `
        <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#111827;">
          <h2>MornInvest 运营素材包｜${reportDate}</h2>
          <p>附件里包含今天的雪球 Word、小红书图片和社媒文案。</p>
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
        "1. 雪球 Word 文档",
        "2. 小红书 6 张图片",
        "3. 小红书/雪球发布文案",
        "",
        "本文和素材仅用于信息整理，不构成投资建议。",
      ].join("\n"),
      attachments: [attachment],
    });
    results.push({ recipient, status: "sent", id: sent.id || null });
  }

  console.log(JSON.stringify({ ok: true, report_date: reportDate, zip: zipPath, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
