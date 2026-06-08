const QUOTE_SYMBOLS = [
  { symbol: "^IXIC", label: "Nasdaq", note: "科技成长股整体风险偏好" },
  { symbol: "^GSPC", label: "S&P 500", note: "大盘风险偏好" },
  { symbol: "SMH", label: "SMH", note: "半导体主线强弱" },
  { symbol: "SOXX", label: "SOXX", note: "半导体主线强弱" },
  { symbol: "NVDA", label: "NVDA", note: "AI GPU 核心标的" },
  { symbol: "AVGO", label: "AVGO", note: "定制 AI 芯片与网络芯片" },
  { symbol: "AMD", label: "AMD", note: "AI GPU 替代链条" },
  { symbol: "MU", label: "MU", note: "存储 / HBM 情绪" },
  { symbol: "^TNX", label: "10Y 美债收益率", note: "估值压力来源" },
  { symbol: "^VIX", label: "VIX", note: "市场风险情绪" },
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
  const settled = await Promise.allSettled(
    QUOTE_SYMBOLS.map(async (symbolConfig) => {
      const chart = await fetchChart(symbolConfig.symbol);
      return formatQuote(symbolConfig, chart);
    })
  );

  const quotes = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .filter(Boolean);

  return {
    source: "Yahoo Finance chart API",
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
