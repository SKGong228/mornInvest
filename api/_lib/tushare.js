const TUSHARE_INDEX_SYMBOLS = [
  { ts_code: "000001.SH", name: "上证指数", note: "A 股大盘风险偏好" },
  { ts_code: "399001.SZ", name: "深证成指", note: "成长与制造链风险偏好" },
  { ts_code: "399006.SZ", name: "创业板指", note: "成长股和科技链情绪" },
  { ts_code: "000688.SH", name: "科创50", note: "硬科技与半导体情绪" },
  { ts_code: "000300.SH", name: "沪深300", note: "核心资产风险偏好" },
  { ts_code: "000905.SH", name: "中证500", note: "中盘成长与制造链情绪" },
];

function formatDateForTushare(date) {
  return String(date || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
}

function dateDaysBefore(date, days) {
  const parsed = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
  parsed.setDate(parsed.getDate() - days);
  return parsed;
}

function formatYmd(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function rowsFromTushareData(data) {
  const fields = data?.fields || [];
  const items = data?.items || [];
  return items.map((item) => Object.fromEntries(fields.map((field, index) => [field, item[index]])));
}

async function tushareRequest(apiName, params, fields) {
  const token = process.env.TUSHARE_TOKEN;
  if (!token) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(process.env.TUSHARE_BASE_URL || "http://api.tushare.pro", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MornInvest/0.1",
      },
      body: JSON.stringify({
        api_name: apiName,
        token,
        params,
        fields,
      }),
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(`Tushare returned ${response.status}: ${text.slice(0, 200)}`);
    }

    if (parsed.code && parsed.code !== 0) {
      throw new Error(`Tushare ${apiName} returned ${parsed.code}: ${parsed.msg || "unknown error"}`);
    }

    return rowsFromTushareData(parsed.data);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLatestIndexRow(config, reportDate) {
  const endDate = formatDateForTushare(reportDate);
  const startDate = formatYmd(dateDaysBefore(reportDate, 14));
  const rows = await tushareRequest(
    "index_daily",
    {
      ts_code: config.ts_code,
      start_date: startDate,
      end_date: endDate,
    },
    "ts_code,trade_date,close,pct_chg,amount"
  );

  return rows
    .filter((row) => row && row.ts_code === config.ts_code)
    .sort((left, right) => String(right.trade_date).localeCompare(String(left.trade_date)))[0] || null;
}

function signedPct(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return "暂无可靠输入";
  }
  return `${parsed > 0 ? "+" : ""}${Math.round(parsed * 100) / 100}%`;
}

async function collectAShareDashboard({ reportDate } = {}) {
  if (!process.env.TUSHARE_TOKEN) {
    return null;
  }

  try {
    const rows = await Promise.all(
      TUSHARE_INDEX_SYMBOLS.map(async (config) => {
        const row = await fetchLatestIndexRow(config, reportDate);
        if (!row) {
          return null;
        }
        return {
          name: config.name,
          ts_code: config.ts_code,
          trade_date: row.trade_date,
          close: row.close,
          pct_chg: Number.parseFloat(row.pct_chg),
          performance: signedPct(row.pct_chg),
          note: config.note,
        };
      })
    );

    const indexes = rows.filter(Boolean);
    if (!indexes.length) {
      return null;
    }

    return {
      source: "Tushare Pro",
      source_rank: 2,
      title: "A-share index dashboard for MornInvest",
      url: "https://tushare.pro/",
      published_at: new Date().toISOString(),
      type: "a_share_dashboard",
      summary:
        "A股主要指数最新可用日线表现，用于日报中的A股科技链条方向参考，不构成A股个股建议。",
      indexes,
    };
  } catch (error) {
    console.warn(`Tushare dashboard skipped: ${error.message || error}`);
    return null;
  }
}

module.exports = {
  collectAShareDashboard,
};
