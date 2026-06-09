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
  { symbol: "^TNX", cnbcSymbol: "US10Y", label: "10Y 美债收益率", note: "估值压力来源" },
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

function formatCnbcQuote(symbolConfig, quote) {
  const latest = Number.parseFloat(quote?.last);
  const previous = Number.parseFloat(quote?.previous_day_closing);
  const changePct = Number.parseFloat(quote?.change_pct);
  if (!Number.isFinite(latest)) {
    return null;
  }

  if (symbolConfig.symbol === "^TNX") {
    const bpChange = Number.isFinite(previous) ? round((latest - previous) * 100, 1) : null;
    return {
      asset: symbolConfig.label,
      symbol: symbolConfig.symbol,
      latest: `${round(latest, 2)}%`,
      change: bpChange === null ? "暂无可靠输入" : `${bpChange} bp`,
      performance: bpChange === null ? `${round(latest, 2)}%` : `${round(latest, 2)}% / ${bpChange} bp`,
      note: symbolConfig.note,
    };
  }

  if (symbolConfig.symbol === "^VIX") {
    return {
      asset: symbolConfig.label,
      symbol: symbolConfig.symbol,
      latest: String(round(latest, 2)),
      change: Number.isFinite(changePct) ? `${round(changePct, 2)}%` : "暂无可靠输入",
      performance: Number.isFinite(changePct) ? `${round(latest, 2)} / ${round(changePct, 2)}%` : String(round(latest, 2)),
      note: symbolConfig.note,
    };
  }

  return {
    asset: symbolConfig.label,
    symbol: symbolConfig.symbol,
    latest: String(round(latest, 2)),
    change: Number.isFinite(changePct) ? `${round(changePct, 2)}%` : "暂无可靠输入",
    performance: Number.isFinite(changePct) ? `${round(changePct, 2)}%` : "暂无可靠输入",
    note: symbolConfig.note,
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

  if (symbolConfig.symbol === "^TNX") {
    return {
      asset: symbolConfig.label,
      symbol: symbolConfig.symbol,
      latest: `${round(latest / 10, 2)}%`,
      change: `${round((latest - previous) * 10, 1)} bp`,
      performance: `${round(latest / 10, 2)}% / ${round((latest - previous) * 10, 1)} bp`,
      note: symbolConfig.note,
    };
  }

  if (symbolConfig.symbol === "^VIX") {
    return {
      asset: symbolConfig.label,
      symbol: symbolConfig.symbol,
      latest: String(round(latest, 2)),
      change: `${round(changePct, 2)}%`,
      performance: `${round(latest, 2)} / ${round(changePct, 2)}%`,
      note: symbolConfig.note,
    };
  }

  return {
    asset: symbolConfig.label,
    symbol: symbolConfig.symbol,
    latest: String(round(latest, 2)),
    change: `${round(changePct, 2)}%`,
    performance: `${round(changePct, 2)}%`,
    note: symbolConfig.note,
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

async function collectMarketDashboard() {
  let cnbcQuotes = new Map();
  try {
    cnbcQuotes = await fetchCnbcQuotes(QUOTE_SYMBOLS);
  } catch {
    cnbcQuotes = new Map();
  }

  const settled = await Promise.allSettled(
    QUOTE_SYMBOLS.map(async (symbolConfig) => {
      const cnbcQuote = cnbcQuotes.get(symbolConfig.symbol);
      if (cnbcQuote) {
        return formatCnbcQuote(symbolConfig, cnbcQuote);
      }

      const chart = await fetchChart(symbolConfig.symbol);
      return formatQuote(symbolConfig, chart);
    })
  );

  const quotes = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .filter(Boolean);

  return {
    source: "CNBC quote API / Yahoo Finance chart API",
    title: "Market dashboard for US technology morning brief",
    url: "https://finance.yahoo.com/",
    published_at: new Date().toISOString(),
    type: "market_dashboard",
    summary: "Latest available daily market data for major US technology assets and risk indicators.",
    market_state: inferMarketState(quotes),
    quotes,
  };
}

module.exports = {
  collectMarketDashboard,
};
