const QUOTE_SYMBOLS = [
  { symbol: "^IXIC", cnbcSymbol: ".IXIC", label: "Nasdaq", note: "科技成长股整体风险偏好" },
  { symbol: "^GSPC", cnbcSymbol: ".SPX", label: "S&P 500", note: "大盘风险偏好" },
  { symbol: "SMH", label: "SMH", note: "半导体主线强弱" },
  { symbol: "SOXX", label: "SOXX", note: "半导体主线强弱" },
  { symbol: "NVDA", label: "NVDA", note: "AI GPU 核心标的" },
  { symbol: "AVGO", label: "AVGO", note: "定制 AI 芯片与网络芯片" },
  { symbol: "MRVL", label: "MRVL", note: "数据中心网络芯片 / 定制硅" },
  { symbol: "AMD", label: "AMD", note: "AI GPU 替代链条" },
  { symbol: "MU", label: "MU", note: "存储 / HBM 情绪" },
  { symbol: "COHR", label: "COHR", note: "光模块 / 光器件情绪" },
  { symbol: "LITE", label: "LITE", note: "光模块 / 光器件情绪" },
  { symbol: "AAOI", label: "AAOI", note: "数据中心光模块弹性标的" },
  { symbol: "GLW", label: "GLW", note: "光纤 / 数据中心连接材料" },
  { symbol: "^VIX", cnbcSymbol: ".VIX", label: "VIX", note: "市场风险情绪" },
];

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

async function fetchChart(symbol) {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
  );
  url.searchParams.set("range", "5d");
  url.searchParams.set("interval", "1d");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(`Yahoo chart returned ${response.status}: ${text.slice(0, 200)}`);
    }

    return parsed.chart?.result?.[0] || null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCnbcQuotes(symbolConfigs) {
  const symbols = symbolConfigs.map((config) => config.cnbcSymbol || config.symbol);
  const url = new URL("https://quote.cnbc.com/quote-html-webservice/quote.htm");
  url.searchParams.set("symbols", symbols.join("|"));
  url.searchParams.set("requestMethod", "quick");
  url.searchParams.set("noform", "1");
  url.searchParams.set("partnerId", "2");
  url.searchParams.set("fund", "1");
  url.searchParams.set("output", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "MornInvest/0.1",
      },
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(`CNBC quote returned ${response.status}: ${text.slice(0, 200)}`);
    }

    const rawQuotes = parsed.QuickQuoteResult?.QuickQuote || [];
    const quotes = Array.isArray(rawQuotes) ? rawQuotes : [rawQuotes];
    const byCnbcSymbol = new Map(
      quotes
        .filter((quote) => quote && quote.code === "0")
        .map((quote) => [String(quote.symbol || "").toUpperCase(), quote])
    );

    return new Map(
      symbolConfigs
        .map((config) => {
          const cnbcSymbol = String(config.cnbcSymbol || config.symbol).toUpperCase();
          return [config.symbol, byCnbcSymbol.get(cnbcSymbol) || null];
        })
        .filter(([, quote]) => quote)
    );
  } finally {
    clearTimeout(timeout);
  }
}

function monthToken(date) {
  const parsed = new Date(`${date || new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 7).replace("-", "");
  }
  return `${parsed.getUTCFullYear()}${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function previousMonthToken(token) {
  const year = Number.parseInt(String(token).slice(0, 4), 10);
  const month = Number.parseInt(String(token).slice(4, 6), 10);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function xmlValue(entry, field) {
  const match = String(entry || "").match(
    new RegExp(`<d:${field}[^>]*>([^<]*)</d:${field}>`)
  );
  return match ? match[1] : "";
}

async function fetchTreasuryYieldMonth(month) {
  const url = new URL(
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml"
  );
  url.searchParams.set("data", "daily_treasury_yield_curve");
  url.searchParams.set("field_tdr_date_value_month", month);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/xml,text/xml",
        "User-Agent": "MornInvest/0.1",
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Treasury XML returned ${response.status}: ${text.slice(0, 200)}`);
    }

    return Array.from(text.matchAll(/<entry>[\s\S]*?<\/entry>/g))
      .map((match) => ({
        date: xmlValue(match[0], "NEW_DATE").slice(0, 10),
        twoYear: Number.parseFloat(xmlValue(match[0], "BC_2YEAR")),
        tenYear: Number.parseFloat(xmlValue(match[0], "BC_10YEAR")),
      }))
      .filter((row) => row.date && Number.isFinite(row.tenYear))
      .sort((left, right) => left.date.localeCompare(right.date));
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTreasuryYieldQuote(reportDate) {
  const currentMonth = monthToken(reportDate);
  const rows = [
    ...(await fetchTreasuryYieldMonth(previousMonthToken(currentMonth))),
    ...(await fetchTreasuryYieldMonth(currentMonth)),
  ].sort((left, right) => left.date.localeCompare(right.date));

  if (rows.length < 2) {
    return null;
  }

  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const bpChange = round((latest.tenYear - previous.tenYear) * 100, 1);

  return {
    asset: "10Y 美债收益率",
    symbol: "^TNX",
    latest: `${round(latest.tenYear, 2)}%`,
    change: `${bpChange > 0 ? "+" : ""}${bpChange} bp`,
    performance: `${round(latest.tenYear, 2)}% / ${bpChange > 0 ? "+" : ""}${bpChange} bp`,
    note: `估值压力来源，Treasury 官方日度收益率，最新日期 ${latest.date}`,
    source: "U.S. Treasury Daily Treasury Rates XML Feed",
    source_url:
      "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?data=yield",
    two_year: Number.isFinite(latest.twoYear) ? `${round(latest.twoYear, 2)}%` : null,
    trade_date: latest.date,
  };
}

function formatCnbcQuote(symbolConfig, quote) {
  const latest = Number.parseFloat(quote?.last);
  const previous = Number.parseFloat(quote?.previous_day_closing);
  const changePct = Number.parseFloat(quote?.change_pct);
  if (!Number.isFinite(latest)) {
    return null;
  }

  if (symbolConfig.symbol === "^VIX") {
    return {
      asset: symbolConfig.label,
      symbol: symbolConfig.symbol,
      latest: String(round(latest, 2)),
      change: formatSignedPct(changePct),
      performance: Number.isFinite(changePct) ? `${round(latest, 2)} / ${formatSignedPct(changePct)}` : String(round(latest, 2)),
      note: symbolConfig.note,
      data_scope: "latest_quote",
      source: "CNBC quote API",
    };
  }

  return {
    asset: symbolConfig.label,
    symbol: symbolConfig.symbol,
    latest: String(round(latest, 2)),
    change: formatSignedPct(changePct),
    performance: formatSignedPct(changePct),
    note: symbolConfig.note,
    data_scope: "latest_quote",
    source: "CNBC quote API",
  };
}

function formatQuote(symbolConfig, chart) {
  const closes = chart?.indicators?.quote?.[0]?.close || [];
  const valid = closes.filter((value) => Number.isFinite(value));
  if (valid.length < 2) {
    return null;
  }

  const previous = valid[valid.length - 2];
  const latest = valid[valid.length - 1];
  const changePct = ((latest - previous) / previous) * 100;

  if (symbolConfig.symbol === "^VIX") {
    return {
      asset: symbolConfig.label,
      symbol: symbolConfig.symbol,
      latest: String(round(latest, 2)),
      change: formatSignedPct(changePct),
      performance: `${round(latest, 2)} / ${formatSignedPct(changePct)}`,
      note: symbolConfig.note,
      data_scope: "daily_close",
      source: "Yahoo Finance chart API",
    };
  }

  return {
    asset: symbolConfig.label,
    symbol: symbolConfig.symbol,
    latest: String(round(latest, 2)),
    change: formatSignedPct(changePct),
    performance: formatSignedPct(changePct),
    note: symbolConfig.note,
    data_scope: "daily_close",
    source: "Yahoo Finance chart API",
  };
}

function inferMarketState(quotes) {
  const nasdaq = quotes.find((quote) => quote.symbol === "^IXIC");
  const smh = quotes.find((quote) => quote.symbol === "SMH");
  const vix = quotes.find((quote) => quote.symbol === "^VIX");

  const nasdaqChange = Number.parseFloat(nasdaq?.change || "0");
  const smhChange = Number.parseFloat(smh?.change || "0");
  const vixChange = Number.parseFloat(vix?.change || "0");

  if (nasdaqChange <= -1 || smhChange <= -1) {
    return "风险偏好下降";
  }
  if (nasdaqChange >= 1 && smhChange >= 1) {
    return "风险偏好上升";
  }
  if (Math.abs(nasdaqChange - smhChange) >= 1 || Math.abs(vixChange) >= 5) {
    return "板块分化";
  }
  return "事件驱动";
}

function parseChangePct(quote) {
  const parsed = Number.parseFloat(String(quote?.change || "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSignedPct(value) {
  if (!Number.isFinite(value)) {
    return "暂无可靠输入";
  }
  const rounded = round(value, 2);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function buildSectorRows(quotes) {
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const groups = [
    {
      sector: "大盘风险偏好",
      symbols: ["^IXIC", "^GSPC"],
      note: "科技成长股和大盘风险偏好",
    },
    {
      sector: "半导体",
      symbols: ["SMH", "SOXX"],
      note: "芯片板块整体强弱",
    },
    {
      sector: "AI GPU / 算力",
      symbols: ["NVDA", "AMD"],
      note: "AI GPU 核心与替代链条",
    },
    {
      sector: "定制 AI / 数据中心网络芯片",
      symbols: ["AVGO", "MRVL"],
      note: "ASIC、网络芯片与数据中心互连",
    },
    {
      sector: "HBM / 存储",
      symbols: ["MU"],
      note: "存储与 HBM 情绪",
    },
    {
      sector: "光模块 / 光互连",
      symbols: ["COHR", "LITE", "AAOI", "GLW"],
      note: "AI 数据中心光模块、光器件与连接材料",
    },
    {
      sector: "宏观风险",
      symbols: ["^TNX", "^VIX"],
      note: "估值压力与波动率",
    },
  ];

  return groups
    .map((group) => {
      const members = group.symbols.map((symbol) => bySymbol.get(symbol)).filter(Boolean);
      if (!members.length) {
        return null;
      }

      if (group.sector === "宏观风险") {
        return {
          sector: group.sector,
          performance: members.map((quote) => quote.performance).join(" / "),
          representatives: members.map((quote) => quote.asset).join(" / "),
          leaders: members.map((quote) => `${quote.asset} ${quote.performance}`).join(" / "),
          note: group.note,
          methodology: "宏观风险不计算篮子均值，分别展示 10Y 美债收益率和 VIX。",
        };
      }

      const changes = members.map(parseChangePct).filter(Number.isFinite);
      const avg = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null;
      const leaders = members
        .filter((quote) => Number.isFinite(parseChangePct(quote)))
        .sort((left, right) => parseChangePct(right) - parseChangePct(left))
        .slice(0, 3)
        .map((quote) => `${quote.asset} ${quote.change}`)
        .join(" / ");

      return {
        sector: group.sector,
        performance: formatSignedPct(avg),
        representatives: members.map((quote) => quote.asset).join(" / "),
        leaders: leaders || "暂无可靠输入",
        note: group.note,
        methodology:
          group.sector === "光模块 / 光互连"
            ? "MornInvest 等权光互连篮子：COHR、LITE、AAOI、GLW 的收盘涨跌幅算术平均值，非交易所官方指数。"
            : "MornInvest 等权板块篮子：代表资产收盘涨跌幅算术平均值，非交易所官方指数。",
      };
    })
    .filter(Boolean);
}

function buildIndicatorRows(quotes) {
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const rows = [
    {
      indicator: "Nasdaq",
      symbols: ["^IXIC"],
      meaning: "科技成长股整体风险偏好",
    },
    {
      indicator: "S&P 500",
      symbols: ["^GSPC"],
      meaning: "美股大盘风险偏好",
    },
    {
      indicator: "SMH",
      symbols: ["SMH"],
      meaning: "半导体 ETF 风险偏好",
    },
    {
      indicator: "SOXX",
      symbols: ["SOXX"],
      meaning: "半导体 ETF 风险偏好",
    },
    {
      indicator: "10Y 美债收益率",
      symbols: ["^TNX"],
      meaning: "科技股估值压力来源",
    },
    {
      indicator: "VIX",
      symbols: ["^VIX"],
      meaning: "市场波动率与风险情绪",
    },
  ];

  return rows
    .map((row) => {
      const quote = row.symbols.map((symbol) => bySymbol.get(symbol)).find(Boolean);
      if (!quote) {
        return null;
      }
      return {
        indicator: row.indicator,
        latest: quote.latest || "暂无可靠输入",
        day_change: quote.change || "暂无可靠输入",
        meaning: row.meaning,
        symbol: quote.symbol,
        data_scope: quote.data_scope || (quote.symbol === "^TNX" ? "official_daily" : "latest_quote"),
        source: quote.source || (quote.symbol === "^TNX" ? quote.source : "market quote API"),
        trade_date: quote.trade_date || null,
      };
    })
    .filter(Boolean);
}

async function collectMarketDashboard({ reportDate } = {}) {
  let cnbcQuotes = new Map();
  try {
    cnbcQuotes = await fetchCnbcQuotes(QUOTE_SYMBOLS);
  } catch {
    cnbcQuotes = new Map();
  }

  const settled = await Promise.allSettled(
    [
      ...QUOTE_SYMBOLS.map(async (symbolConfig) => {
        const cnbcQuote = cnbcQuotes.get(symbolConfig.symbol);
        if (cnbcQuote) {
          return formatCnbcQuote(symbolConfig, cnbcQuote);
        }

        const chart = await fetchChart(symbolConfig.symbol);
        return formatQuote(symbolConfig, chart);
      }),
      fetchTreasuryYieldQuote(reportDate),
    ]
  );

  const quotes = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .filter(Boolean);

  return {
    source: "U.S. Treasury Daily Rates / CNBC quote API / Yahoo Finance chart API",
    title: "Market dashboard for US technology morning brief",
    url: "https://finance.yahoo.com/",
    published_at: new Date().toISOString(),
    type: "market_dashboard",
    summary: "Latest available daily market data for major US technology assets and risk indicators.",
    data_policy:
      "指标仪表盘逐项展示，不合并不同指标。股票、ETF 和指数默认使用最新可得报价或日线收盘口径；10Y 美债收益率使用 U.S. Treasury 官方日度收益率；自定义板块篮子必须标注等权算法。",
    market_state: inferMarketState(quotes),
    quotes,
    indicator_rows: buildIndicatorRows(quotes),
    sector_rows: buildSectorRows(quotes),
  };
}

module.exports = {
  collectMarketDashboard,
};
