const fs = require("node:fs/promises");
const path = require("node:path");

const OUT_DIR = process.env.REPORT_OUTPUT_DIR || "report-output";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function supabaseGet(query) {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${baseUrl}/rest/v1/${query}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase returned ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : [];
}

async function latestDailyReport() {
  const reportDate = process.env.REPORT_DATE;
  const params = new URLSearchParams({
    select: "id,title,report_date,markdown_body,created_at",
    report_type: "eq.daily",
    status: "eq.ready",
    order: "report_date.desc,created_at.desc",
    limit: "20",
  });
  if (reportDate) {
    params.set("report_date", `eq.${reportDate}`);
    params.set("limit", "1");
  }
  const rows = await supabaseGet(`reports?${params.toString()}`);
  const report = rows.find((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.report_date || ""));
  if (!report) {
    throw new Error("No public daily report found.");
  }
  return report;
}

function clean(value = "") {
  return String(value)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/---/g, "")
    .trim();
}

const SOCIAL_TEXT_REPLACEMENTS = [
  [/\bNVIDIA\b|\bNvidia\b|英伟达/g, "NVDA"],
  [/\bAdvanced Micro Devices\b/g, "AMD"],
  [/\bBroadcom\b|博通/g, "AVGO"],
  [/\bMarvell\b/g, "MRVL"],
  [/\bMicron\b|美光/g, "MU"],
  [/\bTaiwan Semiconductor\b|\bTSMC\b/g, "TSM"],
  [/\bApplied Materials\b/g, "AMAT"],
  [/\bLam Research\b/g, "LRCX"],
  [/\bKLA\b/g, "KLAC"],
  [/\bIntel\b|英特尔/g, "INTC"],
  [/\bQualcomm\b|高通/g, "QCOM"],
  [/\bCoherent\b/g, "COHR"],
  [/\bLumentum\b/g, "LITE"],
  [/\bApplied Optoelectronics\b/g, "AAOI"],
  [/\bCorning\b|康宁/g, "GLW"],
  [/\bArista\b/g, "ANET"],
  [/\bCisco\b|思科/g, "CSCO"],
  [/\bMicrosoft\b|微软/g, "MSFT"],
  [/\bAmazon\b|亚马逊/g, "AMZN"],
  [/\bAlphabet\b|\bGoogle\b|谷歌/g, "GOOGL"],
  [/\bMeta\b/g, "META"],
  [/\bApple\b|苹果/g, "AAPL"],
  [/\bTesla\b|特斯拉/g, "TSLA"],
  [/\bOracle\b/g, "ORCL"],
  [/\bAdobe\b/g, "ADBE"],
  [/\bSalesforce\b/g, "CRM"],
  [/\bServiceNow\b/g, "NOW"],
  [/\bSnowflake\b/g, "SNOW"],
  [/\bMongoDB\b/g, "MDB"],
  [/\bDatadog\b/g, "DDOG"],
  [/\bCloudflare\b/g, "NET"],
  [/SK\s*hynix/gi, "HBM 供应链"],
  [/台积电/g, "代工链"],
  [/(中际旭创|新易盛|天孚通信|光迅科技)/g, "光模块链"],
  [/(工业富联|浪潮信息|中科曙光)/g, "服务器链"],
  [/(沪电股份|胜宏科技|深南电路)/g, "PCB链"],
  [/(北方华创|中微公司|拓荆科技)/g, "设备链"],
  [/(兆易创新|澜起科技|长电科技|通富微电)/g, "存储封测链"],
  [/(金山办公|用友网络|宝信软件|光环新网)/g, "软件云链"],
  [/https?:\/\/\S+/g, ""],
  [/\b(?:www\.)?morninvest\.com\S*/gi, ""],
];

function socialText(value = "") {
  let output = clean(value);
  for (const [pattern, replacement] of SOCIAL_TEXT_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }
  return output.replace(/\s+/g, " ").trim();
}

function section(markdown, number) {
  const match = String(markdown).match(
    new RegExp(`##\\s+${number}\\.\\s+.+?(?=\\n##\\s+\\d+\\.|$)`, "s")
  );
  return match ? match[0].trim() : "";
}

function fieldValue(block, label) {
  const lines = String(block)
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

function parseSignals(markdown) {
  return section(markdown, 2)
    .split(/\n###\s+/)
    .slice(1)
    .map((chunk) => ({
      title: clean(chunk.split("\n")[0]).replace(/^信号\s*\d+[：:]/, "").trim(),
      conclusion: fieldValue(chunk, "结论"),
      assets: fieldValue(chunk, "重点影响"),
    }))
    .slice(0, 3);
}

function parseReport(report) {
  const markdown = report.markdown_body || "";
  const core = section(markdown, 0);
  const focus = section(markdown, 5);
  const aShare = section(markdown, 7);
  return {
    date: report.report_date,
    conclusion: fieldValue(core, "一句话结论"),
    mainline: fieldValue(core, "今日主线"),
    keywords: Array.from(core.matchAll(/【([^】]+)】/g)).map((match) => match[1]).slice(0, 5),
    signals: parseSignals(markdown),
    focus: fieldValue(focus, "最重要变量"),
    aShareImpact: fieldValue(aShare, "对 A 股大方向的影响"),
  };
}

function compactDate(date) {
  return String(date || "").replace(/-/g, "").slice(4);
}

function buildCopy(data) {
  const title = `MornInvest｜${compactDate(data.date)}美股科技主线：${data.keywords.slice(0, 2).join("、") || "AI链条"}`;
  const signalLines = data.signals
    .map((signal, index) => `${index + 1}. ${socialText(signal.title)}：${socialText(signal.conclusion || signal.assets)}`)
    .join("\n");
  const tags = [
    "#美股",
    "#科技股",
    "#纳斯达克",
    "#AI",
    "#半导体",
    "#光模块",
    "#CPO",
    "#光互连",
    "#MornInvest",
  ].join(" ");

  const xiaohongshu = [
    `【小红书标题】`,
    title,
    "",
    `【小红书正文】`,
    socialText(data.conclusion),
    "",
    "今天主要看三件事：",
    signalLines,
    "",
    data.aShareImpact ? `A股映射：${socialText(data.aShareImpact)}，重点看美股信号能否传导到算力、光模块/CPO、半导体设备、PCB和云计算链条。` : "",
    "",
    "详细拆解放在图里。本文仅用于信息整理，不构成投资建议。",
    "",
    `【话题】`,
    tags,
  ].filter(Boolean).join("\n");

  const xueqiu = [
    `【雪球导语】`,
    `MornInvest ${data.date} 美股科技晨报。`,
    socialText(data.conclusion),
    "",
    socialText(data.mainline),
    "",
    "重点信号：",
    signalLines,
    "",
    data.focus ? `接下来重点看：${socialText(data.focus)}` : "",
    "",
    "完整正文见 Word 导入版本。本文仅用于信息整理，不构成投资建议。",
  ].filter(Boolean).join("\n");

  return `${xiaohongshu}\n\n---\n\n${xueqiu}\n`;
}

async function main() {
  const report = await latestDailyReport();
  const data = parseReport(report);
  const output = buildCopy(data);
  await fs.mkdir(OUT_DIR, { recursive: true });
  const outputPath = path.join(OUT_DIR, `morninvest-${data.date}-social-copy.txt`);
  await fs.writeFile(outputPath, output, "utf8");
  console.log(JSON.stringify({ date: data.date, path: outputPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
