const A_SHARE_TECH_FUNDS = [
  { ts_code: "159915.SZ", name: "创业板 ETF", note: "A 股成长股风险偏好" },
  { ts_code: "588000.SH", name: "科创50 ETF", note: "硬科技与半导体情绪" },
  { ts_code: "512480.SH", name: "半导体 ETF", note: "A 股半导体链条情绪" },
  { ts_code: "159995.SZ", name: "芯片 ETF", note: "国产芯片与设计链条情绪" },
  { ts_code: "515050.SH", name: "5G 通信 ETF", note: "通信、光模块与高速连接情绪" },
  { ts_code: "516510.SH", name: "云计算 ETF", note: "云计算与软件链条情绪" },
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
    const response = await fetch(process.env.TUSHARE_BASE_URL || "https://api.tushare.pro", {
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

async function fetchFundRows(reportDate) {
  const endDate = formatDateForTushare(reportDate);
  const startDate = formatYmd(dateDaysBefore(reportDate, 14));
  return tushareRequest(
    "fund_daily",
    {
      start_date: startDate,
      end_date: endDate,
    },
    "ts_code,trade_date,close,pct_chg,amount"
  );
}

function latestRowsByCode(rows) {
  const byCode = new Map();
  for (const row of rows || []) {
    const code = row?.ts_code;
    if (!code) {
      continue;
    }
    const existing = byCode.get(code);
    if (!existing || String(row.trade_date).localeCompare(String(existing.trade_date)) > 0) {
      byCode.set(code, row);
    }
  }
  return byCode;
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
    const rowsByCode = latestRowsByCode(await fetchFundRows(reportDate));
    const funds = A_SHARE_TECH_FUNDS.map((config) => {
      const row = rowsByCode.get(config.ts_code);
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
    }).filter(Boolean);

    if (!funds.length) {
      return null;
    }

    return {
      source: "Tushare Pro",
      source_rank: 2,
      title: "A-share technology fund dashboard for MornInvest",
      url: "https://tushare.pro/",
      published_at: new Date().toISOString(),
      type: "a_share_dashboard",
      summary:
        "A股科技主题 ETF 最新可用日线表现，用于日报中的A股科技链条方向参考，不构成A股个股建议。",
      funds,
    };
  } catch (error) {
    console.warn(`Tushare dashboard skipped: ${error.message || error}`);
    return null;
  }
}

module.exports = {
  collectAShareDashboard,
};
