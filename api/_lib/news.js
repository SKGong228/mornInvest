const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

function compact(value, maxLength = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function inferTickers(text) {
  const haystack = String(text || "").toLowerCase();
  const pairs = [
    ["NVDA", ["nvidia", "nvda"]],
    ["AVGO", ["broadcom", "avgo"]],
    ["AMD", ["advanced micro devices", " amd "]],
    ["MU", ["micron", " mu "]],
    ["TSM", ["tsmc", "taiwan semiconductor"]],
    ["ASML", ["asml"]],
    ["MSFT", ["microsoft", "msft"]],
    ["AAPL", ["apple", "aapl"]],
    ["AMZN", ["amazon", "aws", "amzn"]],
    ["GOOGL", ["google", "alphabet", "googl"]],
    ["META", ["meta platforms", "facebook", "meta"]],
    ["TSLA", ["tesla", "tsla"]],
  ];

  return pairs
    .filter(([, aliases]) => aliases.some((alias) => haystack.includes(alias)))
    .map(([ticker]) => ticker);
}

function inferThemes(text) {
  const haystack = String(text || "").toLowerCase();
  const themes = [];
  const checks = [
    ["AI infrastructure", ["ai", "artificial intelligence", "data center"]],
    ["semiconductor", ["chip", "semiconductor", "gpu", "asic"]],
    ["cloud capex", ["cloud", "capex", "aws", "azure", "google cloud"]],
    ["earnings guidance", ["earnings", "revenue", "guidance", "forecast"]],
    ["regulation", ["regulation", "antitrust", "export control", "sec"]],
    ["consumer electronics", ["iphone", "apple", "device", "hardware"]],
    ["autonomous driving", ["autonomous", "robotaxi", "ev", "tesla"]],
  ];

  for (const [theme, keywords] of checks) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      themes.push(theme);
    }
  }

  return themes;
}

async function fetchGdeltArticles(query, maxRecords = 20) {
  const url = new URL(GDELT_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("timespan", "36h");
  url.searchParams.set("sort", "HybridRel");
  url.searchParams.set("maxrecords", String(maxRecords));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(`GDELT returned ${response.status}: ${text.slice(0, 300)}`);
    }

    return Array.isArray(parsed.articles) ? parsed.articles : [];
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeArticle(article) {
  const title = compact(article.title, 240);
  const source = compact(article.domain || article.sourceCollection || "GDELT");
  const text = `${title} ${source}`;
  const tickers = inferTickers(text);
  const themes = inferThemes(text);

  return {
    source,
    title,
    url: article.url,
    published_at: article.seendate || article.published || "",
    summary: title,
    tickers,
    themes,
  };
}

async function collectTechMarketSourceItems() {
  const queries = [
    '(NVIDIA OR NVDA OR Broadcom OR AVGO OR AMD OR Micron OR TSMC OR ASML) (AI OR chip OR semiconductor OR "data center")',
    '(Microsoft OR Apple OR Amazon OR Google OR Alphabet OR Meta OR Tesla) (AI OR cloud OR earnings OR regulation OR capex)',
    '("AI data center" OR "cloud capex" OR "export controls" OR "semiconductor equipment" OR "AI chip")',
  ];

  const batches = await Promise.allSettled(
    queries.map((query) => fetchGdeltArticles(query, 20))
  );

  const seen = new Set();
  const items = [];

  for (const batch of batches) {
    if (batch.status !== "fulfilled") {
      continue;
    }

    for (const article of batch.value) {
      if (!article?.url || !article?.title) {
        continue;
      }

      const key = article.url.split("#")[0];
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      items.push(normalizeArticle(article));
    }
  }

  return items
    .filter((item) => item.title && item.url)
    .slice(0, 18);
}

module.exports = {
  collectTechMarketSourceItems,
};
