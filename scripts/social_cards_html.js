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
  [/\bASML\b/g, "ASML"],
  [/\bIntel\b|英特尔/g, "INTC"],
  [/\bQualcomm\b|高通/g, "QCOM"],
  [/\bArm\b/g, "ARM"],
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

function compactText(value = "", maxLength = 150) {
  const normalized = socialText(value).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sentences = normalized
    .split(/(?<=[。！？；;])\s*/)
    .filter(Boolean);
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

function html(value = "") {
  return socialText(value)
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
      market: fieldValue(chunk, "市场反应"),
      why: fieldValue(chunk, "意义") || fieldValue(chunk, "为什么重要"),
      read: fieldValue(chunk, "影响解读") || fieldValue(chunk, "我的判断"),
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
  const sec7 = section(markdown, 7);
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
    aShare: {
      impact: fieldValue(sec7, "对 A 股大方向的影响"),
      directions: fieldValue(sec7, "可能受影响方向"),
      logic: fieldValue(sec7, "传导逻辑"),
      warning: fieldValue(sec7, "需要警惕"),
    },
  };
}

function tag(text) {
  return `<span class="tag">${html(text)}</span>`;
}

function field(label, body, className = "") {
  return `<div class="field ${className}"><span>${html(label)}</span><p>${html(body)}</p></div>`;
}

const TOTAL_PAGES = 9;

function shell({ page, date, kicker, body, cover = false }) {
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        html, body { width:${WIDTH}px; height:${HEIGHT}px; margin:0; overflow:hidden; }
        body {
          background:#eef1f4;
          color:#111827;
          font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC",
            "Noto Sans SC", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          line-height:1.5;
          -webkit-font-smoothing: antialiased;
        }
        .page { width:${WIDTH}px; height:${HEIGHT}px; padding:34px 42px; }
        .card {
          position:relative;
          width:996px;
          height:1372px;
          border:1px solid #d9dee8;
          border-radius:22px;
          background:#fff;
          overflow:hidden;
          box-shadow:0 18px 46px rgba(12,17,29,.10);
        }
        .card.cover { color:#f8fafc; border-color:#111827; background:#080b10; }
        .cover:before {
          content:""; position:absolute; inset:0;
          background:
            linear-gradient(145deg, rgba(20,184,166,.28), transparent 34%),
            radial-gradient(circle at 84% 18%, rgba(45,212,191,.28), transparent 28%),
            linear-gradient(180deg, rgba(255,255,255,.04), transparent 42%);
        }
        .cover .content, .cover .head { position:relative; z-index:1; }
        .topbar { height:10px; background:#0f766e; }
        .head { display:grid; grid-template-columns:1fr auto; gap:20px; padding:28px 34px 0; }
        .brand { color:#0f766e; font-size:28px; font-weight:850; letter-spacing:.02em; }
        .kicker { color:#64748b; font-size:20px; margin-top:2px; font-weight:700; }
        .date { color:#64748b; font-size:20px; padding-top:6px; font-weight:700; }
        .cover .brand { color:#7dd3fc; }
        .cover .kicker, .cover .date { color:#94a3b8; }
        .content { padding:58px 36px 86px; }
        .footer { position:absolute; left:34px; right:34px; bottom:25px; display:flex; justify-content:space-between; color:#64748b; font-size:17px; }
        .cover .footer { color:#94a3b8; z-index:1; }
        h1 { margin:0 0 24px; font-size:56px; line-height:1.14; letter-spacing:0; font-weight:850; }
        h2 { margin:0 0 16px; font-size:34px; line-height:1.2; letter-spacing:0; font-weight:820; }
        h3 { margin:0 0 10px; font-size:26px; line-height:1.26; font-weight:800; }
        p { margin:0; font-size:25px; line-height:1.58; letter-spacing:0; }
        .muted { color:#64748b; }
        .green { color:#0f766e; }
        .tags { display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; }
        .tag { display:inline-flex; align-items:center; min-height:38px; padding:0 13px; border-radius:999px; background:#e6f6f3; color:#0f766e; font-size:20px; font-weight:800; }
        .cover .tag { background:rgba(20,184,166,.14); border:1px solid rgba(45,212,191,.30); color:#ccfbf1; }
        .panel { border:1px solid #e2e8f0; border-radius:16px; background:#fbfcff; padding:24px 28px; overflow:hidden; }
        .status-strip { display:grid; grid-template-columns:180px 1fr; gap:22px; margin-top:24px; padding:18px 22px; border-radius:14px; }
        .status-strip .label { color:#64748b; font-size:19px; font-weight:800; }
        .status-strip .risk { margin-top:8px; color:#b56b18; font-size:36px; line-height:1.1; }
        .status-strip .state { margin-top:8px; font-size:29px; line-height:1.2; }
        .bullet { position:relative; padding-left:24px; margin-bottom:23px; }
        .bullet:before { content:""; position:absolute; left:0; top:13px; width:12px; height:12px; border-radius:50%; background:#0f766e; }
        .bullet.compact { margin-bottom:20px; }
        .bullet.compact h2 { margin-bottom:10px; }
        .core-mainline { font-size:25px; line-height:1.56; }
        .field { margin-top:14px; }
        .field span { display:block; margin-bottom:5px; color:#64748b; font-size:19px; font-weight:820; }
        .field p { font-size:24px; line-height:1.48; }
        .metric { display:grid; grid-template-columns:1fr 250px; gap:18px; align-items:center; min-height:82px; margin-bottom:12px; border:1px solid #e2e8f0; border-radius:14px; padding:13px 20px; background:#fbfcff; }
        .metric strong { display:block; font-size:25px; line-height:1.12; font-weight:760; }
        .metric small { display:block; margin-top:3px; color:#64748b; font-size:17px; line-height:1.25; }
        .metric b { color:#0f766e; font-size:25px; font-weight:800; text-align:right; }
        .signal { margin-bottom:16px; }
        .signal-title { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; }
        .signal-title .tag { flex:0 0 auto; margin-top:0; }
        .signal h2 { font-size:27px; margin-bottom:8px; }
        .signal p { font-size:22px; line-height:1.45; }
        .news-page h1 { font-size:43px; line-height:1.18; margin-bottom:20px; }
        .news-index { color:#0f766e; font-size:22px; font-weight:850; margin-bottom:10px; }
        .news-block { border-left:6px solid #14b8a6; padding-left:22px; }
        .news-field { margin-top:17px; }
        .news-field span { display:block; color:#64748b; font-size:20px; font-weight:850; margin-bottom:6px; }
        .news-field p { font-size:24px; line-height:1.5; }
        .news-field.assets p, .news-field.a-share p { color:#0f766e; font-weight:750; }
        .cover-title { margin-top:126px; font-size:80px; line-height:1.06; letter-spacing:0; }
        .cover-subtitle { margin-top:30px; max-width:840px; color:#dbeafe; font-size:30px; line-height:1.46; }
        .cover-meta { margin-top:52px; display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .cover-box { border:1px solid rgba(148,163,184,.24); border-radius:16px; padding:20px 22px; background:rgba(15,23,42,.58); }
        .cover-box span { display:block; color:#94a3b8; font-size:19px; font-weight:760; margin-bottom:7px; }
        .cover-box strong { display:block; color:#f8fafc; font-size:32px; line-height:1.18; }
        .cta { position:absolute; left:34px; right:34px; bottom:112px; border-radius:18px; background:#0f766e; color:white; padding:24px 28px; }
        .cta span { display:block; color:#d1fae5; font-size:21px; }
        .cta strong { display:block; margin-top:8px; font-size:46px; line-height:1.1; font-weight:500; }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="card ${cover ? "cover" : ""}">
          <div class="topbar"></div>
          <header class="head">
            <div><div class="brand">MornInvest</div><div class="kicker">${html(kicker)}</div></div>
            <div class="date">${html(date)}</div>
          </header>
          <div class="content">${body}</div>
          <footer class="footer"><span>基于公开信息整理，不构成投资建议</span><span>${String(page).padStart(2, "0")}/${String(TOTAL_PAGES).padStart(2, "0")}</span></footer>
        </section>
      </main>
    </body>
  </html>`;
}

function cardCover(data) {
  return shell({
    page: 1,
    date: data.date,
    kicker: "美股科技晨报",
    cover: true,
    body: `
      <h1 class="cover-title">今天科技股<br>在交易什么</h1>
      <p class="cover-subtitle">${html(compactText(data.core.conclusion, 72))}</p>
      <div class="tags">${data.core.keywords.map(tag).join("")}</div>
      <div class="cover-meta">
        <div class="cover-box"><span>风险等级</span><strong>${html(data.core.risk)}</strong></div>
        <div class="cover-box"><span>市场状态</span><strong>${html(data.marketState || "板块分化")}</strong></div>
      </div>
    `,
  });
}

function cardCoreCombined(data) {
  return shell({
    page: 2,
    date: data.date,
    kicker: "0. 今日核心判断",
    body: `
      <h1>今日美股科技主线</h1>
      <div class="bullet compact"><h2>一句话结论</h2><p style="font-size:30px;line-height:1.54;">${html(data.core.conclusion)}</p></div>
      <div class="bullet compact"><h2>今日主线</h2><p class="core-mainline">${html(compactText(data.core.mainline, 240))}</p></div>
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
  const rows = data.dashboard.slice(1, 8);
  return shell({
    page: 3,
    date: data.date,
    kicker: "1-2. 市场仪表盘与信号",
    body: `
      <h1>市场仪表盘</h1>
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
    page: 4,
    date: data.date,
    kicker: "2. 今天最重要的 3 个信号",
    body: data.signals
      .map(
        (signal) => `
        <div class="panel signal">
          <div class="signal-title"><h2>${html(signal.title)}</h2>${tag(signal.impact || "中性")}</div>
          <p style="margin-top:8px;">${html(compactText(signal.conclusion, 120))}</p>
          <div class="field"><span>重点影响</span><p class="green">${html(compactText(signal.assets, 90))}</p></div>
        </div>`
      )
      .join(""),
  });
}

function newsField(label, value, className = "", maxLength = 150) {
  return `<div class="news-field ${className}"><span>${html(label)}</span><p>${html(compactText(value, maxLength))}</p></div>`;
}

function cardNews(data, item, page, index) {
  return shell({
    page,
    date: data.date,
    kicker: "3. 重点新闻拆解",
    body: `
      <div class="news-page">
        <div class="news-index">NEWS ${index}</div>
        <div class="news-block">
          <h1>${html(item.title)}</h1>
          ${newsField("相关资产", item.assets, "assets", 80)}
          ${newsField("事件摘要", item.facts, "facts", 190)}
          ${item.market ? newsField("市场反应", item.market, "", 130) : ""}
          ${newsField("意义", item.why, "", 170)}
          ${newsField("A股产业链指引", item.aShare, "a-share", 155)}
        </div>
      </div>
    `,
  });
}

function cardFocus(data) {
  const aShareDirection =
    data.aShare.impact && clean(data.aShare.impact).length > 6 ? data.aShare.impact : data.aShare.logic;
  return shell({
    page: 9,
    date: data.date,
    kicker: "A股映射与关注清单",
    body: `
      <h1>接下来重点看什么</h1>
      <div class="bullet"><h2>最重要变量</h2><p>${html(compactText(data.focus.variable, 150))}</p></div>
      <div class="bullet"><h2>重点公司</h2><p>${html(compactText(data.focus.companies, 120))}</p></div>
      <div class="bullet"><h2>A股大方向</h2><p>${html(compactText(aShareDirection, 190))}</p></div>
      <div class="bullet"><h2>重点映射方向</h2><p>${html(compactText(data.aShare.directions, 150))}</p></div>
      <div class="cta"><span>完整内容见主页订阅</span><strong>MornInvest</strong></div>
    `,
  });
}

async function main() {
  const { chromium } = require("playwright");
  const report = await latestDailyReport();
  const data = parseReport(report);
  const cards = [
    cardCover(data),
    cardCoreCombined(data),
    cardDashboard(data),
    cardSignals(data),
    ...data.news.slice(0, 4).map((item, index) => cardNews(data, item, 5 + index, index + 1)),
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
