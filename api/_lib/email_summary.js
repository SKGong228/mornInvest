function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clean(value = "") {
  return String(value)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/---/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderInline(value = "") {
  return escapeHtml(value)
    .replace(
      /【([^】]+)】/g,
      '<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 9px;border-radius:999px;background:#ecfdf5;border:1px solid #99f6e4;color:#0f766e;font-size:13px;line-height:1.4;font-weight:700;">$1</span>'
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function section(markdown, number) {
  const match = String(markdown || "").match(
    new RegExp(`##\\s+${number}\\.\\s+.+?(?=\\n##\\s+\\d+\\.|$)`, "s")
  );
  return match ? match[0].trim() : "";
}

function fieldValue(block, label) {
  const lines = String(block || "")
    .split("\n")
    .map((line) => line.trim());

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === `${label}：` || line === `${label}:`) {
      const values = [];
      for (const nextLine of lines.slice(index + 1)) {
        if (!nextLine) {
          if (values.length) break;
          continue;
        }
        if (/^[^：:]{2,32}[：:]$/.test(nextLine) || nextLine.startsWith("#")) {
          break;
        }
        values.push(nextLine);
      }
      return clean(values.join(" "));
    }
    if (line.startsWith(`${label}：`) || line.startsWith(`${label}:`)) {
      return clean(line.includes("：") ? line.split("：").slice(1).join("：") : line.split(":").slice(1).join(":"));
    }
  }
  return "";
}

function compact(value, maxLength = 180) {
  const normalized = clean(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sentences = normalized.split(/(?<=[。！？；;])\s*/).filter(Boolean);
  let output = "";
  for (const sentence of sentences) {
    if ((output + sentence).length > maxLength) {
      break;
    }
    output += sentence;
  }
  if (output.length >= 48) {
    return output;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function parseSignals(markdown) {
  return section(markdown, 2)
    .split(/\n###\s+/)
    .slice(1)
    .map((chunk) => ({
      title: clean(chunk.split("\n")[0]).replace(/^信号\s*\d+[：:]/, "").trim(),
      conclusion: compact(fieldValue(chunk, "结论"), 120),
      assets: compact(fieldValue(chunk, "重点影响"), 95),
    }))
    .filter((signal) => signal.title || signal.conclusion || signal.assets)
    .slice(0, 3);
}

function parseReport(report) {
  const markdown = report.markdown_body || "";
  const core = section(markdown, 0);
  const market = section(markdown, 1);
  const focus = section(markdown, 5);
  const aShare = section(markdown, 7);

  return {
    title: report.title || "MornInvest 美股科技晨报",
    date: report.report_date || "",
    conclusion: compact(fieldValue(core, "一句话结论"), 140),
    mainline: compact(fieldValue(core, "今日主线"), 220),
    risk: compact(fieldValue(core, "风险等级"), 12),
    keywords: Array.from(core.matchAll(/【([^】]+)】/g)).map((match) => match[1]).slice(0, 4),
    marketState: compact(fieldValue(market, "市场状态"), 30),
    signals: parseSignals(markdown),
    focus: {
      variable: compact(fieldValue(focus, "最重要变量"), 120),
      companies: compact(fieldValue(focus, "重点公司"), 120),
      etfs: compact(fieldValue(focus, "重点 ETF"), 80),
    },
    aShare: {
      impact: compact(fieldValue(aShare, "对 A 股大方向的影响"), 30),
      logic: compact(fieldValue(aShare, "传导逻辑"), 180),
      warning: compact(fieldValue(aShare, "需要警惕"), 100),
    },
  };
}

function reportUrl(report) {
  const baseUrl = String(process.env.PUBLIC_SITE_URL || "https://www.morninvest.com").replace(/\/$/, "");
  return `${baseUrl}/reports/${report.id ? `?id=${encodeURIComponent(report.id)}` : ""}`;
}

function chip(label, value) {
  if (!value) {
    return "";
  }
  return `<span style="display:inline-block;margin:0 8px 8px 0;padding:5px 10px;border-radius:999px;background:#f8fafc;border:1px solid #dbe3ee;color:#334155;font-size:13px;font-weight:800;">${escapeHtml(label)}：${escapeHtml(value)}</span>`;
}

function paragraph(value, margin = "0 0 14px") {
  if (!value) {
    return "";
  }
  return `<p style="margin:${margin};font-size:15px;line-height:1.72;color:#18212f;">${renderInline(value)}</p>`;
}

function sectionTitle(value) {
  return `<h2 style="font-size:17px;line-height:1.35;margin:26px 0 12px;color:#0f172a;border-top:1px solid #e2e8f0;padding-top:18px;font-weight:900;">${escapeHtml(value)}</h2>`;
}

function buildSummaryBody(report) {
  const data = parseReport(report);
  const fullUrl = reportUrl(report);
  const keywords = data.keywords
    .map(
      (keyword) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 9px;border-radius:999px;background:#ecfdf5;border:1px solid #99f6e4;color:#0f766e;font-size:13px;line-height:1.4;font-weight:700;">${escapeHtml(keyword)}</span>`
    )
    .join("");
  const signals = data.signals
    .map(
      (signal, index) => `
        <div style="margin:0 0 12px;padding:12px 14px;border:1px solid #e2e8f0;border-left:4px solid #14b8a6;border-radius:6px;background:#ffffff;">
          <div style="font-size:15px;line-height:1.45;font-weight:900;color:#0f172a;margin:0 0 6px;">${index + 1}. ${escapeHtml(signal.title || "核心信号")}</div>
          ${paragraph(signal.conclusion, "0 0 6px")}
          ${signal.assets ? `<div style="font-size:13px;line-height:1.55;color:#64748b;"><strong>重点影响：</strong>${escapeHtml(signal.assets)}</div>` : ""}
        </div>`
    )
    .join("");

  const focusItems = [
    data.focus.variable ? `<li style="margin:0 0 7px;"><strong>最重要变量：</strong>${escapeHtml(data.focus.variable)}</li>` : "",
    data.focus.companies ? `<li style="margin:0 0 7px;"><strong>重点公司：</strong>${escapeHtml(data.focus.companies)}</li>` : "",
    data.focus.etfs ? `<li style="margin:0;"><strong>重点 ETF：</strong>${escapeHtml(data.focus.etfs)}</li>` : "",
  ].join("");

  const aShare = data.aShare.impact || data.aShare.logic || data.aShare.warning
    ? `
      ${sectionTitle("A 股科技链条参考")}
      ${chip("方向", data.aShare.impact)}
      ${paragraph(data.aShare.logic)}
      ${data.aShare.warning ? `<p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;"><strong>需要警惕：</strong>${escapeHtml(data.aShare.warning)}</p>` : ""}
    `
    : "";

  return `
    <div style="margin:4px 0 14px;">
      ${chip("风险等级", data.risk)}
      ${chip("市场状态", data.marketState)}
    </div>
    ${paragraph(data.conclusion, "0 0 10px")}
    ${paragraph(data.mainline)}
    ${keywords ? `<div style="margin:0 0 8px;">${keywords}</div>` : ""}

    ${sectionTitle("今天最重要的 3 个信号")}
    ${signals || paragraph("本期来源有限，完整拆解请查看网页全文。")}

    ${sectionTitle("今日观察")}
    <ul style="margin:0 0 14px 20px;padding:0;font-size:15px;line-height:1.72;color:#18212f;">${focusItems}</ul>

    ${aShare}

    <div style="margin:26px 0 0;padding:16px 18px;border-radius:8px;background:#0f172a;">
      <p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#dbeafe;">邮件版只保留精华。重点新闻拆解、原文链接、板块温度和信息来源请看网页完整版。</p>
      <a href="${escapeHtml(fullUrl)}" style="display:inline-block;background:#14b8a6;color:#ffffff;text-decoration:none;border-radius:6px;padding:9px 14px;font-size:14px;font-weight:900;">查看完整日报</a>
    </div>
  `;
}

function buildSummaryText(report) {
  const data = parseReport(report);
  const fullUrl = reportUrl(report);
  const lines = [
    data.title,
    "",
    data.risk ? `风险等级：${data.risk}` : "",
    data.marketState ? `市场状态：${data.marketState}` : "",
    "",
    data.conclusion,
    data.mainline,
    data.keywords.length ? `关键词：${data.keywords.join(" / ")}` : "",
    "",
    "今天最重要的 3 个信号：",
    ...data.signals.map((signal, index) => `${index + 1}. ${signal.title}：${signal.conclusion}${signal.assets ? `｜重点影响：${signal.assets}` : ""}`),
    "",
    data.focus.variable ? `最重要变量：${data.focus.variable}` : "",
    data.focus.companies ? `重点公司：${data.focus.companies}` : "",
    data.focus.etfs ? `重点 ETF：${data.focus.etfs}` : "",
    "",
    data.aShare.impact ? `A股科技链条参考：${data.aShare.impact}` : "",
    data.aShare.logic ? `传导逻辑：${data.aShare.logic}` : "",
    data.aShare.warning ? `需要警惕：${data.aShare.warning}` : "",
    "",
    `完整日报：${fullUrl}`,
    "",
    "本文基于公开信息整理，仅用于市场观察和信息学习，不构成任何投资建议。",
  ].filter(Boolean);
  return lines.join("\n");
}

function wrapSummaryEmailHtml(title, bodyHtml) {
  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f3f6f9;color:#18212f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;line-height:1.7;">
    <div style="display:none;max-height:0;overflow:hidden;color:#f3f6f9;">邮件精华版：核心判断、三大信号和今日观察。完整日报见网页。</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f6f9;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="height:5px;background:#14b8a6;border-radius:8px 8px 0 0;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="background:#ffffff;border-left:1px solid #dbe3ee;border-right:1px solid #dbe3ee;padding:24px 26px 20px;">
                <div style="font-size:12px;color:#0f766e;font-weight:900;text-transform:uppercase;margin-bottom:8px;">MornInvest</div>
                <h1 style="font-size:24px;line-height:1.28;margin:0;color:#0f172a;font-weight:900;">${escapeHtml(title)}</h1>
                <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#64748b;">邮件精华版：每天早上 5 分钟看懂美股科技主线</p>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #dbe3ee;border-top:none;border-radius:0 0 8px 8px;padding:4px 26px 28px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;">
            <tr>
              <td style="font-size:12px;color:#64748b;padding:14px 4px 0;line-height:1.65;">本简报仅用于信息整理和研究参考，不构成投资建议、买卖建议或任何收益承诺。你收到这封邮件是因为订阅了 MornInvest 测试版。</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildEmailSummary(report) {
  return {
    html: wrapSummaryEmailHtml(report.title || "MornInvest 美股科技晨报", buildSummaryBody(report)),
    text: buildSummaryText(report),
  };
}

module.exports = {
  buildEmailSummary,
};
