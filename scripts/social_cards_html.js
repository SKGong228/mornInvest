const fs = require("node:fs/promises");
const { existsSync } = require("node:fs");
const path = require("node:path");

const WIDTH = 1080;
const HEIGHT = 1440;
const OUT_DIR = process.env.SOCIAL_OUTPUT_DIR || "social-output";
const CHROME_PATH =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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

function html(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function section(markdown, number) {
  const match = String(markdown).match(new RegExp(`##\\s+${number}\\.\\s+.+?(?=\\n##\\s+\\d+\\.|$)`, "s"));
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

function parseTable(block) {
  return String(block)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.includes("---"))
    .map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => clean(cell.trim())));
}

function parseSignals(markdown) {
  const block = section(markdown, 2);
  return block
    .split(/\n###\s+/)
    .slice(1)
    .map((chunk) => {
      const title = clean(chunk.split("\n")[0]).replace(/^信号\s*\d+[：:]/, "").trim();
      return {
        title,
        conclusion: fieldValue(chunk, "结论"),
        impact: fieldValue(chunk, "影响方向"),
        assets: fieldValue(chunk, "重点影响"),
      };
    })
    .slice(0, 3);
}

function parseNews(markdown) {
  const block = section(markdown, 3);
  return block
    .split(/\n###\s+/)
    .slice(1)
    .map((chunk) => ({
      title: clean(chunk.split("\n")[0]),
      assets: fieldValue(chunk, "相关资产"),
      facts: fieldValue(chunk, "事件摘要") || fieldValue(chunk, "事实摘要"),
      why: fieldValue(chunk, "意义") || fieldValue(chunk, "为什么重要"),
      aShare: fieldValue(chunk, "A股产业链指引") || fieldValue(chunk, "后续观察"),
    }))
    .slice(0, 4);
}

function parseReport(report) {
  const markdown = report.markdown_body;
  const sec0 = section(markdown, 0);
  const sec1 = section(markdown, 1);
  const sec5 = section(markdown, 5);
  const sec6 = section(markdown, 6);
  return {
    date: report.report_date,
    core: {
      conclusion: fieldValue(sec0, "一句话结论"),
      mainline: fieldValue(sec0, "今日主线"),
      risk: fieldValue(sec0, "风险等级") || "中",
      keywords: Array.from(sec0.matchAll(/【([^】]+)】/g)).map((match) => match[1]).slice(0, 6),
    },
    dashboard: parseTable(sec1),
    marketState: fieldValue(sec1, "市场状态"),
    signals: parseSignals(markdown),
    news: parseNews(markdown),
    focus: {
      variable: fieldValue(sec5, "最重要变量"),
      companies: fieldValue(sec5, "重点公司"),
      etfs: fieldValue(sec5, "重点 ETF"),
    },
    plain: {
      better: fieldValue(sec6, "更准确的理解是"),
    },
  };
}

function tag(text) {
  return `<span class="tag">${html(text)}</span>`;
}

function field(label, body, className = "") {
  return `<div class="field ${className}"><span>${html(label)}</span><p>${html(body)}</p></div>`;
}

function shell({ page, date, kicker, body }) {
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        html, body { width:${WIDTH}px; height:${HEIGHT}px; margin:0; overflow:hidden; }
        body {
          background:#f6f3ee;
          color:#111827;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
          line-height:1.58;
          -webkit-font-smoothing: antialiased;
        }
        .page { width:${WIDTH}px; height:${HEIGHT}px; padding:42px 52px; }
        .card {
          position:relative;
          width:976px;
          height:1356px;
          border:1px solid #d9dee8;
          border-radius:28px;
          background:#fff;
          overflow:hidden;
          box-shadow:0 18px 48px rgba(12,17,29,.08);
        }
        .topbar { height:14px; background:#0f766e; }
        .head { display:grid; grid-template-columns:1fr auto; gap:24px; padding:32px 34px 0; }
        .brand { color:#0f766e; font-size:30px; font-weight:700; letter-spacing:0; }
        .kicker { color:#64748b; font-size:22px; margin-top:2px; }
        .date { color:#64748b; font-size:22px; padding-top:8px; }
        .content { padding:76px 34px 90px; }
        .footer { position:absolute; left:34px; right:34px; bottom:28px; display:flex; justify-content:space-between; color:#64748b; font-size:18px; }
        h1 { margin:0 0 24px; font-size:58px; line-height:1.12; letter-spacing:0; font-weight:800; }
        h2 { margin:0 0 18px; font-size:38px; line-height:1.18; letter-spacing:0; font-weight:760; }
        h3 { margin:0 0 10px; font-size:28px; line-height:1.28; font-weight:760; }
        p { margin:0; font-size:27px; line-height:1.62; letter-spacing:0; }
        .muted { color:#64748b; }
        .green { color:#0f766e; }
        .tags { display:flex; flex-wrap:wrap; gap:12px; margin-top:30px; }
        .tag { display:inline-flex; align-items:center; min-height:42px; padding:0 15px; border-radius:999px; background:#e6f6f3; color:#0f766e; font-size:22px; font-weight:700; }
        .panel { border:1px solid #e2e8f0; border-radius:22px; background:#fbfcff; padding:26px 30px; overflow:hidden; }
        .status-strip { display:grid; grid-template-columns:180px 1fr; gap:24px; margin-top:28px; padding:18px 24px; border-radius:18px; }
        .status-strip .label { color:#64748b; font-size:20px; font-weight:700; }
        .status-strip .risk { margin-top:8px; color:#b56b18; font-size:38px; line-height:1.1; }
        .status-strip .state { margin-top:8px; font-size:30px; line-height:1.2; }
        .bullet { position:relative; padding-left:24px; margin-bottom:28px; }
        .bullet:before { content:""; position:absolute; left:0; top:13px; width:12px; height:12px; border-radius:50%; background:#0f766e; }
        .bullet.compact { margin-bottom:22px; }
        .bullet.compact h2 { margin-bottom:10px; }
        .core-mainline { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:5; overflow:hidden; }
        .field { margin-top:13px; }
        .field span { display:block; margin-bottom:3px; color:#64748b; font-size:21px; font-weight:760; }
        .field p { font-size:25px; line-height:1.52; }
        .metric { display:grid; grid-template-columns:1fr 310px; gap:18px; align-items:center; height:96px; margin-bottom:15px; border:1px solid #e2e8f0; border-radius:18px; padding:14px 28px; background:#fbfcff; }
        .metric strong { display:block; font-size:28px; line-height:1.1; font-weight:680; }
        .metric small { color:#64748b; font-size:19px; }
        .metric b { color:#0f766e; font-size:28px; font-weight:680; }
        .signal { height:303px; margin-bottom:20px; }
        .signal-title { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; }
        .signal-title .tag { flex:0 0 auto; margin-top:0; }
        .news { height:500px; margin-bottom:22px; }
        .news h2 { font-size:30px !important; line-height:1.22; margin-bottom:12px; }
        .news .field { margin-top:10px; }
        .news .field span { font-size:20px; }
        .news .field p { font-size:23px; line-height:1.45; display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; }
        .news .assets p { -webkit-line-clamp:1; color:#0f766e; }
        .news .facts p { -webkit-line-clamp:2; }
        .news .why p { -webkit-line-clamp:1; }
        .news .a-share p { -webkit-line-clamp:1; color:#0f766e; }
        .cta { position:absolute; left:34px; right:34px; bottom:112px; border-radius:24px; background:#0f766e; color:white; padding:28px 32px; }
        .cta span { display:block; color:#d1fae5; font-size:21px; }
        .cta strong { display:block; margin-top:8px; font-size:46px; line-height:1.1; font-weight:500; }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="card">
          <div class="topbar"></div>
          <header class="head">
            <div><div class="brand">MornInvest</div><div class="kicker">${html(kicker)}</div></div>
            <div class="date">${html(date)}</div>
          </header>
          <div class="content">${body}</div>
          <footer class="footer"><span>基于公开信息整理，不构成投资建议</span><span>${String(page).padStart(2, "0")}/06</span></footer>
        </section>
      </main>
    </body>
  </html>`;
}

function cardCoreCombined(data) {
  return shell({
    page: 1,
    date: data.date,
    kicker: "0. 今日核心判断",
    body: `
      <h1>今日美股科技主线</h1>
      <div class="bullet compact"><h2>一句话结论</h2><p style="font-size:30px;line-height:1.54;">${html(data.core.conclusion)}</p></div>
      <div class="bullet compact"><h2>今日主线</h2><p class="core-mainline">${html(data.core.mainline)}</p></div>
      <div class="panel status-strip">
        <div><div class="label">风险等级</div><div class="risk">${html(data.core.risk)}</div></div>
        <div><div class="label">市场状态</div><div class="state">${html(data.marketState || "板块分化")}</div></div>
      </div>
      <h2 style="margin-top:28px;">今日关键词</h2>
      <div class="tags">${data.core.keywords.map(tag).join("")}</div>
    `,
  });
}

function cardDashboard(data) {
  const rows = data.dashboard.slice(1, 10);
  return shell({
    page: 2,
    date: data.date,
    kicker: "1. 市场仪表盘",
    body: `
      ${rows
        .map(
          (row) => `
        <div class="metric">
          <div><strong>${html(row[0] || "")}</strong><small>${html(row[2] || "")}</small></div>
          <b>${html(row[1] || "")}</b>
        </div>`
        )
        .join("")}
      <p class="green" style="margin-top:22px;font-size:28px;">市场状态：${html(data.marketState)}</p>
    `,
  });
}

function cardSignals(data) {
  return shell({
    page: 3,
    date: data.date,
    kicker: "2. 今天最重要的 3 个信号",
    body: data.signals
      .map(
        (signal) => `
        <div class="panel signal">
          <div class="signal-title"><h2>${html(signal.title)}</h2>${tag(signal.impact || "中性")}</div>
          <p style="margin-top:8px;">${html(signal.conclusion)}</p>
          <div class="field"><span>重点影响</span><p class="green">${html(signal.assets)}</p></div>
        </div>`
      )
      .join(""),
  });
}

function cardNews(data, newsItems, page, kicker = "3. 重点新闻拆解") {
  return shell({
    page,
    date: data.date,
    kicker,
    body: newsItems
      .map(
        (item) => `
        <div class="panel news">
          <h2>${html(item.title)}</h2>
          ${field("相关资产", item.assets, "assets")}
          ${field("事件摘要", item.facts, "facts")}
          ${field("意义", item.why, "why")}
          ${field("A股产业链指引", item.aShare, "a-share")}
        </div>`
      )
      .join(""),
  });
}

function cardFocus(data) {
  return shell({
    page: 6,
    date: data.date,
    kicker: "5-6. 关注清单与普通投资者理解",
    body: `
      <div class="bullet"><h2>最重要变量</h2><p>${html(data.focus.variable)}</p></div>
      <div class="bullet"><h2>重点公司</h2><p>${html(data.focus.companies)}</p></div>
      <div class="bullet"><h2>更准确的理解</h2><p>${html(data.plain.better)}</p></div>
      <div class="cta"><span>完整日报与邮件订阅</span><strong>morninvest.com</strong></div>
    `,
  });
}

async function main() {
  const { chromium } = require("playwright");
  const report = await latestDailyReport();
  const data = parseReport(report);
  const cards = [
    cardCoreCombined(data),
    cardDashboard(data),
    cardSignals(data),
    cardNews(data, data.news.slice(0, 2), 4),
    cardNews(data, data.news.slice(2, 4), 5, "3. 重点新闻拆解（续）"),
    cardFocus(data),
  ];

  await fs.mkdir(OUT_DIR, { recursive: true });
  const launchOptions = { headless: true };
  if (CHROME_PATH && existsSync(CHROME_PATH)) {
    launchOptions.executablePath = CHROME_PATH;
  }
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const paths = [];
  for (let index = 0; index < cards.length; index += 1) {
    await page.setContent(cards[index], { waitUntil: "load" });
    const output = path.join(OUT_DIR, `morninvest-${data.date}-html-${String(index + 1).padStart(2, "0")}.png`);
    await page.screenshot({ path: output, fullPage: false });
    paths.push(output);
  }
  await browser.close();
  console.log(JSON.stringify({ date: data.date, paths }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
