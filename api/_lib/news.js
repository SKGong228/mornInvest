const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const YAHOO_RSS_ENDPOINT = "https://feeds.finance.yahoo.com/rss/2.0/headline";
const OFFICIAL_RSS_SOURCES = [
  {
    source: "NVIDIA Newsroom",
    url: "https://nvidianews.nvidia.com/cats/press_release.xml",
    tickers: ["NVDA"],
  },
  {
    source: "Broadcom Investor Relations",
    url: "https://investors.broadcom.com/rss/news-releases.xml",
    tickers: ["AVGO"],
  },
];
const CORE_TICKERS = [
  "NVDA",
  "AVGO",
  "AMD",
  "MU",
  "MRVL",
  "GLW",
  "COHR",
  "LITE",
  "AAOI",
  "ORCL",
  "MSFT",
  "AAPL",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "SMH",
  "QQQ",
];

const SOURCE_REGISTRY = [
  {
    rank: 1,
    type: "primary",
    domains: [
      "sec.gov",
      "bls.gov",
      "federalreserve.gov",
      "bea.gov",
      "nvidianews.nvidia.com",
      "investor.nvidia.com",
      "investors.broadcom.com",
      "ir.amd.com",
      "investor.apple.com",
      "microsoft.com",
      "ir.aboutamazon.com",
      "abc.xyz",
      "investor.fb.com",
      "investor.tsmc.com",
      "asml.com",
      "investors.micron.com",
      "ir.tesla.com",
      "investor.marvell.com",
      "investor.corning.com",
      "investors.coherent.com",
      "investor.lumentum.com",
      "investors.ao-inc.com",
    ],
  },
  {
    rank: 2,
    type: "tier_1_media",
    domains: [
      "reuters.com",
      "apnews.com",
      "bloomberg.com",
      "cnbc.com",
      "wsj.com",
      "ft.com",
      "axios.com",
      "theinformation.com",
      "nikkei.com",
      "nikkei.com/asia",
    ],
  },
  {
    rank: 3,
    type: "market_media",
    domains: [
      "finance.yahoo.com",
      "marketwatch.com",
      "barrons.com",
      "investors.com",
      "kiplinger.com",
      "morningstar.com",
      "seekingalpha.com",
    ],
  },
  {
    rank: 3,
    type: "technology_media",
    domains: [
      "theverge.com",
      "techcrunch.com",
      "arstechnica.com",
      "wired.com",
      "semianalysis.com",
      "servethehome.com",
      "9to5mac.com",
    ],
  },
];

const EXCLUDED_DOMAINS = new Set([
  "247wallst.com",
  "benzinga.com",
  "fool.com",
  "zacks.com",
  "investorplace.com",
  "tipranks.com",
  "stocktwits.com",
]);

const EXCLUDED_TITLE_PATTERNS = [
  /\bbest\b.*\bbuy\b/i,
  /\bbetter buy\b/i,
  /\bto buy\b/i,
  /\bshould you buy\b/i,
  /\bmissed out\b/i,
  /\broom to run\b/i,
  /\bbillionaire\b/i,
  /\bportfolio\b/i,
  /\bquality growth stocks?\b/i,
  /\bhere'?s? why\b/i,
  /\bthe real story\b/i,
  /\bposition became\b/i,
  /\bsurged\s+\d/i,
  /\bsurges?\s+\d/i,
  /\blesson investors?\b/i,
  /\bbuy,\s*sell,\s*or\s*hold\b/i,
  /\bprice target\b/i,
  /\banalysts?\b/i,
  /\bstock rises ahead\b/i,
  /\bipo\b/i,
  /\bquietly returned\b/i,
  /\betf.*returned\b/i,
];

const TITLE_RELEVANCE_PATTERNS = [
  /\bAI\b/i,
  /\bartificial intelligence\b/i,
  /\bchip(?:s)?\b/i,
  /\bsemiconductor(?:s)?\b/i,
  /\bGPU(?:s)?\b/i,
  /\bdata center(?:s)?\b/i,
  /\bcloud\b/i,
  /\bearnings\b/i,
  /\bguidance\b/i,
  /\bcapex\b/i,
  /\bNvidia\b/i,
  /\bBroadcom\b/i,
  /\bAMD\b/i,
  /\bMicron\b/i,
  /\bMicrosoft\b/i,
  /\bAmazon\b/i,
  /\bGoogle\b/i,
  /\bAlphabet\b/i,
  /\bMeta\b/i,
  /\bTesla\b/i,
  /\bMarvell\b/i,
  /\bCorning\b/i,
  /\bCoherent\b/i,
  /\bLumentum\b/i,
  /\bApplied Optoelectronics\b/i,
  /\bOracle\b/i,
  /\bCoreWeave\b/i,
  /\bSK hynix\b/i,
  /\bTSMC\b/i,
  /\bASML\b/i,
  /\bNasdaq\b/i,
  /\bSOX\b/i,
  /\bSMH\b/i,
  /\bSOXX\b/i,
  /\boptical\b/i,
  /\boptics\b/i,
  /\bphotonics\b/i,
  /\bsilicon photonics\b/i,
  /\bCPO\b/i,
  /\btransceiver(?:s)?\b/i,
  /\binterconnect(?:s)?\b/i,
  /\bEthernet\b/i,
  /\b800G\b/i,
  /\b1\.6T\b/i,
];

function compact(value, maxLength = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeXml(value).replace(/<[^>]*>/g, " ");
}

function normalizeDomain(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }

  try {
    const url = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").split("/")[0];
  }
}

function domainMatches(domain, pattern) {
  const normalized = normalizeDomain(domain);
  const target = normalizeDomain(pattern);
  return normalized === target || normalized.endsWith(`.${target}`);
}

function hasKeyword(haystack, keyword) {
  const normalized = String(haystack || "").toLowerCase();
  const term = String(keyword || "").toLowerCase().trim();
  if (/^[a-z0-9]+$/.test(term) && term.length <= 4) {
    return new RegExp(`\\b${term}\\b`, "i").test(normalized);
  }
  return normalized.includes(term);
}

function getSourceProfile(domain) {
  const normalized = normalizeDomain(domain);

  if (EXCLUDED_DOMAINS.has(normalized)) {
    return null;
  }

  for (const group of SOURCE_REGISTRY) {
    if (group.domains.some((pattern) => domainMatches(normalized, pattern))) {
      return {
        source_rank: group.rank,
        source_type: group.type,
        domain: normalized,
      };
    }
  }

  return {
    source_rank: 4,
    source_type: "discovery_only",
    domain: normalized,
  };
}

function inferTickers(text) {
  const haystack = String(text || "").toLowerCase();
  const pairs = [
    ["NVDA", ["nvidia", "nvda"]],
    ["AVGO", ["broadcom", "avgo"]],
    ["AMD", ["advanced micro devices", " amd "]],
    ["MRVL", ["marvell", "mrvl"]],
    ["GLW", ["corning", "glw"]],
    ["COHR", ["coherent", "cohr"]],
    ["LITE", ["lumentum"]],
    ["AAOI", ["applied optoelectronics", "aaoi"]],
    ["MU", ["micron", " mu "]],
    ["TSM", ["tsmc", "taiwan semiconductor"]],
    ["ASML", ["asml"]],
    ["ORCL", ["oracle", "orcl"]],
    ["MSFT", ["microsoft", "msft"]],
    ["AAPL", ["apple", "aapl"]],
    ["AMZN", ["amazon", "aws", "amzn"]],
    ["GOOGL", ["google", "alphabet", "googl"]],
    ["META", ["meta platforms", "facebook", "meta"]],
    ["TSLA", ["tesla", "tsla"]],
  ];

  return pairs
    .filter(([, aliases]) => aliases.some((alias) => hasKeyword(haystack, alias)))
    .map(([ticker]) => ticker);
}

function inferThemes(text) {
  const haystack = String(text || "").toLowerCase();
  const themes = [];
  const checks = [
    ["AI infrastructure", ["ai", "artificial intelligence", "data center"]],
    ["semiconductor", ["chip", "semiconductor", "gpu", "asic"]],
    [
      "optical interconnect",
      ["optical", "optics", "photonics", "silicon photonics", "cpo", "transceiver", "800g", "1.6t"],
    ],
    ["data center networking", ["ethernet", "switching", "interconnect", "networking", "dsp", "active optical"]],
    ["cloud capex", ["cloud", "capex", "aws", "azure", "google cloud"]],
    ["earnings guidance", ["earnings", "revenue", "guidance", "forecast"]],
    ["regulation", ["regulation", "antitrust", "export control", "sec"]],
    ["consumer electronics", ["iphone", "apple", "device", "hardware"]],
    ["autonomous driving", ["autonomous", "robotaxi", "electric vehicle", "tesla"]],
  ];

  for (const [theme, keywords] of checks) {
    if (keywords.some((keyword) => hasKeyword(haystack, keyword))) {
      themes.push(theme);
    }
  }

  return themes;
}

function relevanceScore(item) {
  const tickerScore = item.tickers.length * 3;
  const themeScore = item.themes.length * 2;
  const sourceScore = Math.max(0, 5 - item.source_rank) * 4;
  const title = `${item.title} ${item.summary}`.toLowerCase();
  const impactScore = [
    "earnings",
    "guidance",
    "revenue",
    "ai",
    "chip",
    "semiconductor",
    "data center",
    "optical",
    "photonics",
    "transceiver",
    "interconnect",
    "ethernet",
    "800g",
    "1.6t",
    "capex",
    "regulation",
    "export control",
    "antitrust",
    "sec",
  ].filter((keyword) => title.includes(keyword)).length;

  return sourceScore + tickerScore + themeScore + impactScore;
}

function isLowQualityTitle(title) {
  return EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

function isRelevantTitle(title) {
  return TITLE_RELEVANCE_PATTERNS.some((pattern) => pattern.test(title));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      if (response.status === 429) {
        throw new Error("GDELT_RATE_LIMIT");
      }
      throw new Error(`GDELT returned ${response.status}: ${text.slice(0, 300)}`);
    }

    return Array.isArray(parsed.articles) ? parsed.articles : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGdeltArticlesWithRetry(query, maxRecords = 20) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchGdeltArticles(query, maxRecords);
    } catch (error) {
      if (String(error.message || error) !== "GDELT_RATE_LIMIT" || attempt === 2) {
        throw error;
      }
      await sleep(6000 * (attempt + 1));
    }
  }
  return [];
}

function getXmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? compact(stripTags(match[1]), tag === "description" ? 700 : 260) : "";
}

async function fetchYahooTickerRss(ticker) {
  const url = new URL(YAHOO_RSS_ENDPOINT);
  url.searchParams.set("s", ticker);
  url.searchParams.set("region", "US");
  url.searchParams.set("lang", "en-US");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const xml = await response.text();

    if (!response.ok) {
      throw new Error(`Yahoo RSS returned ${response.status}: ${xml.slice(0, 200)}`);
    }

    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    return itemBlocks.map((block) => ({
      ticker,
      title: getXmlTag(block, "title"),
      description: getXmlTag(block, "description"),
      url: getXmlTag(block, "link"),
      published_at: getXmlTag(block, "pubDate"),
      source: "finance.yahoo.com",
    }));
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRssFeed(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(source.url, { signal: controller.signal });
    const xml = await response.text();

    if (!response.ok) {
      throw new Error(`RSS returned ${response.status}: ${xml.slice(0, 200)}`);
    }

    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    return itemBlocks.slice(0, 8).map((block) => ({
      feed_source: source.source,
      feed_tickers: source.tickers,
      title: getXmlTag(block, "title"),
      description: getXmlTag(block, "description"),
      url: getXmlTag(block, "link"),
      published_at: getXmlTag(block, "pubDate"),
    }));
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeOfficialRssArticle(article) {
  const title = compact(article.title, 240);
  if (!title || !isRelevantTitle(title)) {
    return null;
  }

  const sourceProfile = getSourceProfile(article.url);
  if (!sourceProfile || sourceProfile.source_rank > 1) {
    return null;
  }

  const text = `${title} ${article.description || ""} ${(article.feed_tickers || []).join(" ")}`;
  const tickers = Array.from(new Set([...(article.feed_tickers || []), ...inferTickers(text)]));
  const themes = inferThemes(text);

  return {
    source: article.feed_source || sourceProfile.domain,
    title,
    url: article.url,
    published_at: article.published_at || "",
    summary: compact(article.description || title, 700),
    source_rank: sourceProfile.source_rank,
    source_type: sourceProfile.source_type,
    tickers,
    themes,
  };
}

function normalizeRssArticle(article) {
  const title = compact(article.title, 240);
  if (!title || isLowQualityTitle(title) || !isRelevantTitle(title)) {
    return null;
  }

  const sourceProfile = getSourceProfile(article.source || article.url);
  if (!sourceProfile) {
    return null;
  }

  const text = `${title} ${article.description || ""} ${article.ticker || ""}`;
  const tickers = Array.from(new Set([article.ticker, ...inferTickers(text)].filter(Boolean)));
  const themes = inferThemes(text);

  if (!tickers.length && !themes.length) {
    return null;
  }

  return {
    source: sourceProfile.domain,
    title,
    url: article.url,
    published_at: article.published_at || "",
    summary: compact(article.description || title, 700),
    source_rank: sourceProfile.source_rank,
    source_type: sourceProfile.source_type,
    tickers,
    themes,
  };
}

function normalizeArticle(article) {
  const title = compact(article.title, 240);
  if (isLowQualityTitle(title) || !isRelevantTitle(title)) {
    return null;
  }

  const domain = normalizeDomain(article.domain || article.url || "");
  const sourceProfile = getSourceProfile(domain);
  if (!sourceProfile) {
    return null;
  }

  const source = compact(sourceProfile.domain || article.sourceCollection || "GDELT");
  const text = `${title} ${source}`;
  const tickers = inferTickers(text);
  const themes = inferThemes(text);

  if (!tickers.length && !themes.length) {
    return null;
  }

  if (sourceProfile.source_rank >= 4 && (!tickers.length || !themes.length)) {
    return null;
  }

  return {
    source,
    title,
    url: article.url,
    published_at: article.seendate || article.published || "",
    summary: title,
    source_rank: sourceProfile.source_rank,
    source_type: sourceProfile.source_type,
    tickers,
    themes,
  };
}

async function collectTechMarketSourceItems() {
  const seen = new Set();
  const items = [];

  const officialBatches = await Promise.allSettled(
    OFFICIAL_RSS_SOURCES.map((source) => fetchRssFeed(source))
  );

  for (const batch of officialBatches) {
    if (batch.status !== "fulfilled") {
      continue;
    }

    for (const article of batch.value) {
      if (!article?.url || !article?.title) {
        continue;
      }

      const key = article.url.split("#")[0].replace(/\?.*$/, "");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const item = normalizeOfficialRssArticle(article);
      if (item) {
        items.push(item);
      }
    }
  }

  const rssBatches = await Promise.allSettled(
    CORE_TICKERS.map((ticker) => fetchYahooTickerRss(ticker))
  );

  for (const batch of rssBatches) {
    if (batch.status !== "fulfilled") {
      continue;
    }

    for (const article of batch.value) {
      if (!article?.url || !article?.title) {
        continue;
      }

      const key = article.url.split("#")[0].replace(/\?.*$/, "");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const item = normalizeRssArticle(article);
      if (item) {
        items.push(item);
      }
    }
  }

  const trustedQueries = [
    'domain:reuters.com (NVIDIA OR Broadcom OR AMD OR Micron OR Marvell OR Microsoft OR Apple OR Amazon OR Google OR Meta OR Tesla) (AI OR chip OR semiconductor OR cloud OR earnings)',
    'domain:apnews.com (NVIDIA OR Broadcom OR AMD OR Micron OR Marvell OR Microsoft OR Apple OR Amazon OR Google OR Meta OR Tesla OR Nasdaq) (AI OR chip OR semiconductor OR tech OR market)',
    'domain:reuters.com (Marvell OR MRVL OR Corning OR GLW OR Coherent OR COHR OR Lumentum OR LITE OR "Applied Optoelectronics" OR AAOI) (AI OR "data center" OR optical OR photonics OR transceiver OR networking OR ethernet OR earnings)',
    'domain:apnews.com (Marvell OR MRVL OR Corning OR GLW OR Coherent OR COHR OR Lumentum OR LITE OR "Applied Optoelectronics" OR AAOI) (AI OR "data center" OR optical OR photonics OR transceiver OR networking OR ethernet OR earnings)',
  ];
  const discoveryQueries = [
    '(NVIDIA OR NVDA OR Broadcom OR AVGO OR AMD OR Micron OR Marvell OR MRVL OR TSMC OR ASML) (AI OR chip OR semiconductor OR "data center")',
    '(Marvell OR MRVL OR Corning OR GLW OR Coherent OR COHR OR Lumentum OR LITE OR "Applied Optoelectronics" OR AAOI) ("AI data center" OR optical OR optics OR photonics OR "silicon photonics" OR CPO OR transceiver OR "800G" OR "1.6T" OR ethernet OR networking)',
  ];
  const queries = items.length >= 10 ? trustedQueries : [...trustedQueries, ...discoveryQueries];
  const gdeltBatches = [];

  for (const query of queries) {
    await sleep(6500);
    try {
      gdeltBatches.push(await fetchGdeltArticlesWithRetry(query, 8));
    } catch {
      gdeltBatches.push([]);
    }
  }

  for (const batch of gdeltBatches) {
    for (const article of batch) {
      if (!article?.url || !article?.title) {
        continue;
      }

      const key = article.url.split("#")[0].replace(/\?.*$/, "");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const item = normalizeArticle(article);
      if (!item) {
        continue;
      }

      items.push(item);
    }
  }

  const ranked = items
    .filter((item) => item.title && item.url)
    .filter((item) => item.source_rank <= 3 || item.tickers.length || item.themes.length)
    .sort((a, b) => relevanceScore(b) - relevanceScore(a));

  const highTrust = ranked.filter((item) => item.source_rank <= 3);
  const discovery = ranked.filter((item) => item.source_rank > 3).slice(0, 3);

  return [...highTrust, ...discovery].slice(0, 18);
}

module.exports = {
  collectTechMarketSourceItems,
  getSourceProfile,
};
