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
    .map((signal, index) => `${index + 1}. ${signal.title}：${signal.conclusion || signal.assets}`)
    .join("\n");
  const tags = [
    "#美股",
    "#科技股",
    "#纳斯达克",
    "#AI",
    "#半导体",
    "#光模块",
    "#MornInvest",
  ].join(" ");

  const xiaohongshu = [
    `【小红书标题】`,
    title,
    "",
    `【小红书正文】`,
    data.conclusion,
    "",
    "今天主要看三件事：",
    signalLines,
    "",
    data.aShareImpact ? `A股映射：${data.aShareImpact}，重点还是看美股信号能否传导到算力、光模块、半导体和云计算链条。` : "",
    "",
    "详细拆解放在图里。本文仅用于信息整理，不构成投资建议。",
    "",
    `【话题】`,
    tags,
  ].filter(Boolean).join("\n");

  const xueqiu = [
    `【雪球导语】`,
    `MornInvest ${data.date} 美股科技晨报。`,
    data.conclusion,
    "",
    data.mainline,
    "",
    "重点信号：",
    signalLines,
    "",
    data.focus ? `接下来重点看：${data.focus}` : "",
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
