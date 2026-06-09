const MAJOR_POLICY_EVENTS_2026 = [
  {
    date: "2026-06-10",
    time_et: "08:30",
    title: "美国 5 月 CPI",
    category: "inflation",
    source: "BLS",
    url: "https://www.bls.gov/schedule/news_release/cpi.htm",
    relevance: "通胀数据会影响降息预期、10Y 美债收益率和高估值科技股定价。",
  },
  {
    date: "2026-06-17",
    time_et: "14:00",
    title: "FOMC 利率决议与经济预测摘要",
    category: "fed",
    source: "Federal Reserve",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    relevance: "点阵图、声明措辞和鲍威尔发布会会影响利率路径与科技股估值压力。",
  },
  {
    date: "2026-06-25",
    time_et: "08:30",
    title: "美国一季度 GDP 终值",
    category: "growth",
    source: "BEA",
    url: "https://www.bea.gov/news/schedule",
    relevance: "经济增长和利润修订会影响软着陆交易与企业资本开支预期。",
  },
  {
    date: "2026-07-02",
    time_et: "08:30",
    title: "美国 6 月非农就业与失业率",
    category: "labor",
    source: "BLS",
    url: "https://www.bls.gov/schedule/news_release/empsit.htm",
    relevance: "就业强弱会影响降息预期、美元和长端利率，对成长股估值敏感。",
  },
  {
    date: "2026-07-07",
    time_et: "08:30",
    title: "美国 5 月个人收入与支出，含 PCE 价格指数",
    category: "inflation",
    source: "BEA",
    url: "https://www.bea.gov/news/schedule",
    relevance: "PCE 是美联储更关注的通胀指标，影响政策预期和科技股估值。",
  },
  {
    date: "2026-07-29",
    time_et: "14:00",
    title: "FOMC 利率决议",
    category: "fed",
    source: "Federal Reserve",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    relevance: "若市场预期降息路径变化，AI 与半导体估值弹性可能受影响。",
  },
];

function dateOnly(date) {
  return String(date || new Date().toISOString().slice(0, 10)).slice(0, 10);
}

function diffDays(left, right) {
  const leftDate = new Date(`${left}T00:00:00Z`);
  const rightDate = new Date(`${right}T00:00:00Z`);
  return Math.round((leftDate.getTime() - rightDate.getTime()) / (24 * 60 * 60 * 1000));
}

function collectPolicyCalendar({ reportDate, windowDays = 21 } = {}) {
  const baseDate = dateOnly(reportDate);
  const upcoming_events = MAJOR_POLICY_EVENTS_2026
    .map((event) => ({
      ...event,
      days_until: diffDays(event.date, baseDate),
    }))
    .filter((event) => event.days_until >= 0 && event.days_until <= windowDays)
    .sort((left, right) => left.days_until - right.days_until);

  if (!upcoming_events.length) {
    return null;
  }

  return {
    source: "Federal Reserve / BLS / BEA official calendars",
    source_rank: 1,
    title: "Upcoming major US policy and macro data dates",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    published_at: new Date().toISOString(),
    type: "policy_calendar",
    summary:
      "未来三周影响美股科技估值的主要政策和宏观数据时间点。只有当事件本身引发市场反应时，宏观才应进入日报主线；平时只作为观察日历。",
    upcoming_events,
  };
}

module.exports = {
  collectPolicyCalendar,
};
