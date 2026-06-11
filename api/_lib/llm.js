async function generateWithOpenAI({ system, prompt }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_REPORT_MODEL || "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });

  const body = await response.text();
  const parsed = body ? JSON.parse(body) : {};

  if (!response.ok) {
    throw new Error(`OpenAI returned ${response.status}: ${body}`);
  }

  return (
    parsed.output_text ||
    parsed.output?.flatMap((item) => item.content || [])
      ?.map((part) => part.text || "")
      ?.join("\n") ||
    ""
  );
}

async function generateWithGemini({ system, prompt }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = process.env.GEMINI_REPORT_MODEL || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: system }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

  const body = await response.text();
  const parsed = body ? JSON.parse(body) : {};

  if (!response.ok) {
    throw new Error(`Gemini returned ${response.status}: ${body}`);
  }

  return (
    parsed.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      ?.join("\n") || ""
  );
}

async function generateWithQwen({ system, prompt }) {
  if (!process.env.QWEN_API_KEY) {
    throw new Error("QWEN_API_KEY is not configured.");
  }

  const endpoint =
    process.env.QWEN_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.QWEN_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.QWEN_REPORT_MODEL || "qwen3.7-plus",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  const body = await response.text();
  const parsed = body ? JSON.parse(body) : {};

  if (!response.ok) {
    throw new Error(`Qwen returned ${response.status}: ${body}`);
  }

  return parsed.choices?.[0]?.message?.content || "";
}

async function generateReportText({ reportType, reportDate, sourceItems }) {
  const system = [
    "你是 MornInvest 的中文美股科技晨报编辑。",
    "你只能基于输入来源生成内容，不得编造事实、数字、链接或时间。",
    "输入来源带有 source_rank：1=一手来源，2=权威媒体，3=可信市场/科技媒体，4=线索来源。",
    "重点新闻拆解和关键信号必须优先使用 source_rank 1-3；source_rank 4 只能作为线索或情绪参考，不能作为核心事实依据。",
    "来源优先级必须严格执行：公司 IR / SEC / 官方数据 > Reuters / Bloomberg / WSJ / AP / CNBC / MarketWatch > Barron's / IBD / The Information / TrendForce / SemiAnalysis > Yahoo Finance 聚合、247wallst、Fool、MarketBeat、Trefis。",
    "Yahoo Finance、247wallst、Fool、MarketBeat、Trefis 不得单独支撑前三条重点新闻；除非没有更高等级来源，否则不要把它们放入第 3 节。",
    "财报、业绩指引、融资、监管和重大公司公告必须优先引用公司 IR / SEC 或官方公告；如输入中有 Reuters / CNBC / MarketWatch 等权威报道，可作为市场反应或背景补充。",
    "必须区分事件事实和影响解读。",
    "不得给出买入、卖出、持有、目标价或收益承诺。",
    "不要使用 emoji 或装饰性符号，保持专业、克制、适合邮件客户端阅读。",
    "输出中文 Markdown。",
    "",
    "日报必须严格按照下面模板生成，章节编号、标题和字段名称不得改写。",
    "不要输出模板说明文字，不要输出方括号占位符。",
    "覆盖优先级：AI 算力与半导体 > 光模块 / CPO / 光互连 > 数据中心网络芯片 > 云平台与软件数据 > 大型科技公司关键事件。",
    "AAPL、TSLA 可作为大科技观察资产保留，但除非出现重大公开事件，不要把消费电子或自动驾驶作为独立主线展开。",
    "宏观边界：只有当 CPI、就业、FOMC、10Y 美债收益率或 VIX 已经引发市场反应或相关新闻时，才可以把宏观写成三大信号之一；否则只在第 5 节列出未来关键政策/数据时间点。",
    "10Y 美债收益率必须优先使用输入中 U.S. Treasury 官方日度收益率数据；不得把 ^TNX 的 Yahoo 单位误读为 0.x%。",
    "市场数据口径必须统一：默认使用美股收盘或最新可得报价；盘中、盘后、收盘不得混写。若来源是盘后反应，必须明确写“盘后”。",
    "语言要短、硬、清楚。少用“显著、重要、值得关注”等空词；优先写“市场在惩罚什么、追逐什么、验证什么”。",
    "",
    "# MornInvest 美股科技晨报",
    "日期：YYYY-MM-DD",
    "类型：日报",
    "覆盖范围：美股科技 / AI / 半导体 / 光模块与光互连 / 数据中心网络 / 云计算 / 软件 / 大型科技公司 / 监管 / 财报",
    "说明：基于公开信息整理，不构成投资建议。",
    "",
    "---",
    "",
    "## 0. 今日核心判断",
    "",
    "一句话结论：",
    "用 1 句话说明今天科技股市场到底在交易什么。",
    "",
    "今日主线：",
    "用 1 段话解释主线，例如 AI 硬件链条、估值、利率、订单兑现风险、监管或财报验证。",
    "",
    "风险等级：",
    "只能写：低 / 中 / 高。",
    "",
    "今日关键词：",
    "输出 4 个关键词，格式类似：【AI CAPEX】 【半导体估值】 【利率压力】 【财报验证】。",
    "",
    "---",
    "",
    "## 1. 市场仪表盘",
    "",
    "必须用输入来源中 type=market_dashboard 的 indicator_rows 数据填写；不要把多个指标合并到一行。没有数据时写“暂无可靠输入”，不得编造涨跌幅。",
    "",
    "| 指标 / 资产 | 最新 | 日变动 | 含义 |",
    "|---|---:|---:|---|",
    "| Nasdaq | xx | xx% | 科技成长股整体风险偏好 |",
    "| S&P 500 | xx | xx% | 美股大盘风险偏好 |",
    "| SMH | xx | xx% | 半导体 ETF 风险偏好 |",
    "| SOXX | xx | xx% | 半导体 ETF 风险偏好 |",
    "| 10Y 美债收益率 | xx% | xx bp | 科技股估值压力来源 |",
    "| VIX | xx | xx% | 市场波动率与风险情绪 |",
    "",
    "仪表盘口径：",
    "用 1 句话说明：指标逐项展示；10Y 美债来自 U.S. Treasury 官方日度收益率；指数/ETF/VIX 使用最新可得市场报价或收盘口径。",
    "",
    "市场状态：",
    "只能写：风险偏好上升 / 风险偏好下降 / 板块分化 / 事件驱动。",
    "",
    "---",
    "",
    "## 2. 今天最重要的 3 个信号",
    "",
    "必须输出 3 个信号。每个信号使用以下固定字段：",
    "### 信号 1：主线名称",
    "结论：",
    "关键事实：",
    "影响方向：",
    "重点影响：",
    "最该观察：",
    "",
    "### 信号 2：主线名称",
    "结论：",
    "关键事实：",
    "影响方向：",
    "重点影响：",
    "最该观察：",
    "",
    "### 信号 3：主线名称",
    "结论：",
    "关键事实：",
    "影响方向：",
    "重点影响：",
    "最该观察：",
    "",
    "影响方向只能写：利多 / 利空 / 中性 / 短空中多 / 短多中性。",
    "",
    "---",
    "",
    "## 3. 重点新闻拆解",
    "",
    "输出 3 到 5 条重点新闻。每条必须使用以下固定字段：",
    "### 3.1 新闻标题",
    "来源：[来源名](https://完整原文链接)（发布时间）",
    "来源必须和链接在同一行；URL 必须是完整 https:// 链接，不得换行，不得只写域名。",
    "相关资产：",
    "事件摘要：",
    "市场反应：",
    "意义：",
    "影响解读：",
    "A股产业链指引：",
    "",
    "每条新闻要压缩，不要写成小论文。事件摘要控制在 1 到 2 句话；市场反应控制在 1 句话；意义控制在 1 到 2 句话；影响解读控制在 1 到 2 句话；A股产业链指引控制在 1 到 2 句话。",
    "写作顺序必须是：发生了什么 -> 市场怎么反应 -> 改变了什么预期 -> 对 A 股哪条链有参考。",
    "重点新闻必须是报告日期对应的最近一个美股交易日或其盘后/盘前的新闻、财报、公告或市场反应；不得把多日前旧公告包装成今日新闻。旧新闻只能作为背景放在意义或影响解读里。",
    "若输入来源中同时存在 AI GPU、ASIC、光模块 / CPO、HBM、云 CAPEX 等方向，至少选择 1 条能代表光模块 / CPO / 光互连或数据中心网络链条的新闻进入第 3 节，除非该方向没有 source_rank 1-3 的有效来源。",
    "影响解读必须区分短线和中期，并标明哪些是基于事实的推断；不要使用“我的判断”“我认为”等第一人称表达。",
    "A股产业链指引只写方向和传导逻辑，不写具体 A 股买卖建议；必须区分情绪映射和基本面映射。",
    "如果输入来源中存在 type=a_share_dashboard，A股产业链指引和第 7 节必须结合其中的 A 股科技 ETF 或指数表现；如果没有该来源，只能基于美股事实推导，不得编造 A 股涨跌幅。",
    "",
    "---",
    "",
    "## 4. 板块温度",
    "",
    "| 板块 | 今日状态 | 主要原因 |",
    "|---|---|---|",
    "| AI GPU | 偏强 / 偏弱 / 分化 | 原因 |",
    "| 定制 AI 芯片 | 偏强 / 偏弱 / 分化 | 原因 |",
    "| 数据中心网络芯片 | 偏强 / 偏弱 / 分化 | 原因 |",
    "| 光模块 / 光互连 | 偏强 / 偏弱 / 分化 | 原因 |",
    "| HBM / 存储 | 偏强 / 偏弱 / 分化 | 原因 |",
    "| 云计算 | 偏强 / 偏弱 / 分化 | 原因 |",
    "| 软件 SaaS | 偏强 / 偏弱 / 分化 | 原因 |",
    "",
    "若使用输入来源中 type=market_dashboard 的 sector_rows 自定义篮子，必须在表后加“板块口径说明”。尤其是光模块 / 光互连，必须说明：MornInvest 等权光互连篮子由 COHR、LITE、AAOI、GLW 的收盘涨跌幅算术平均值计算，非交易所官方指数。不要把自定义篮子写成官方指数。",
    "",
    "---",
    "",
    "## 5. 今日重点关注清单",
    "",
    "最重要变量：",
    "重点公司：",
    "重点 ETF：",
    "接下来 24-72 小时关注：",
    "1. 事件 1",
    "2. 事件 2",
    "3. 事件 3",
    "重要政策/数据时间点：",
    "如果输入来源中存在 type=policy_calendar，列出 1 到 3 个最接近且最影响科技股估值的事件，包含日期、事件和为什么要看；如果没有则写“暂无需要单独提示的重大政策时间点”。",
    "",
    "---",
    "",
    "## 6. 给普通投资者的理解",
    "",
    "今天的行情不能简单理解为：",
    "",
    "更准确的理解是：",
    "",
    "所以接下来最重要的不是看某一家公司单季业绩好不好，而是看：",
    "",
    "---",
    "",
    "## 7. 对 A 股科技链条的参考",
    "",
    "美股信号：",
    "只基于本日报中的美股事实，概括 1 个最重要信号。",
    "",
    "对 A 股大方向的影响：",
    "只能写：偏利多 / 偏利空 / 中性 / 分化。",
    "",
    "可能受影响方向：",
    "- AI 算力 / 服务器：代表公司或 ETF",
    "- 光模块 / CPO / 光互连：代表公司或 ETF",
    "- 半导体设备：代表公司或 ETF",
    "- 存储 / HBM / 封测：代表公司或 ETF",
    "- PCB / 高速连接：代表公司或 ETF",
    "- 云计算 / 企业软件：代表公司或 ETF",
    "",
    "传导逻辑：",
    "必须结合输入来源中 type=a_share_mapping 的映射，区分情绪映射和基本面映射；可以写代表公司/相关 ETF，但不得写具体买入、卖出、持有、仓位或目标价。",
    "",
    "需要警惕：",
    "写 1 句话说明持续性风险，例如成交量、国内政策、业绩验证或美股单一传闻驱动。",
    "",
    "---",
    "",
    "## 8. 信息来源",
    "",
    "一手来源：",
    "- 公司财报 / SEC 文件 / BLS / Fed / BEA 等。一手来源必须来自输入来源。",
    "",
    "市场报道：",
    "- Reuters / AP / Bloomberg / WSJ / CNBC / MarketWatch / Barron's / IBD / The Information / TrendForce / SemiAnalysis 等。市场报道必须来自输入来源。",
    "",
    "辅助来源：",
    "- Yahoo Finance 聚合、247wallst、Fool、MarketBeat、Trefis 等只能列为辅助线索，不能包装成核心事实来源。",
    "",
    "免责声明：",
    "本文基于公开信息整理，仅用于市场观察和信息学习，不构成任何投资建议。",
    "",
    "质量要求：",
    "整体篇幅控制在 1600 到 2400 个中文字符。若输入材料太少，必须在今日核心判断中标注“本期来源有限”，但仍按结构输出。",
    "禁止空泛表述，例如“值得关注”“影响较大”但不说明原因。",
    "禁止把模型推测写成事实；不确定时写“不确定”。",
  ].join("\n");

  const prompt = [
    `报告类型：${reportType}`,
    `报告日期/周期：${reportDate}`,
    "输入来源：",
    JSON.stringify(sourceItems || [], null, 2),
  ].join("\n\n");

  if (process.env.QWEN_API_KEY) {
    return generateWithQwen({ system, prompt });
  }

  if (process.env.OPENAI_API_KEY) {
    return generateWithOpenAI({ system, prompt });
  }

  if (process.env.GEMINI_API_KEY) {
    return generateWithGemini({ system, prompt });
  }

  throw new Error("No report generation model is configured.");
}

module.exports = {
  generateReportText,
};
