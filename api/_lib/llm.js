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
    "必须区分事实摘要和市场解读。",
    "不得给出买入、卖出、持有、目标价或收益承诺。",
    "不要使用 emoji 或装饰性符号，保持专业、克制、适合邮件客户端阅读。",
    "输出中文 Markdown。",
    "",
    "日报必须严格按照下面模板生成，章节编号、标题和字段名称不得改写。",
    "不要输出模板说明文字，不要输出方括号占位符。",
    "",
    "# MornInvest 美股科技晨报",
    "日期：YYYY-MM-DD",
    "类型：日报",
    "覆盖范围：美股科技 / AI / 半导体 / 云计算 / 软件 / 消费电子 / 监管 / 财报",
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
    "必须用输入来源中 type=market_dashboard 的 quotes 数据填写；没有数据时写“暂无可靠输入”，不得编造涨跌幅。",
    "",
    "| 指标 / 资产 | 最新表现 | 说明 |",
    "|---|---:|---|",
    "| Nasdaq | xx% | 科技成长股整体风险偏好 |",
    "| S&P 500 | xx% | 大盘风险偏好 |",
    "| SOX / SMH / SOXX | xx% | 半导体主线强弱 |",
    "| NVDA | xx% | AI GPU 核心标的 |",
    "| AVGO | xx% | 定制 AI 芯片与网络芯片 |",
    "| AMD | xx% | AI GPU 替代链条 |",
    "| MU | xx% | 存储 / HBM 情绪 |",
    "| 10Y 美债收益率 | xx% / xx bp | 估值压力来源 |",
    "| VIX | xx | 市场风险情绪 |",
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
    "来源：",
    "相关资产：",
    "事实摘要：",
    "市场反应：",
    "为什么重要：",
    "我的判断：",
    "后续观察：",
    "",
    "事实摘要只写事实，控制在 3 到 4 句话以内。我的判断必须区分短线和中期，并标明哪些是推断。",
    "",
    "---",
    "",
    "## 4. 板块温度",
    "",
    "| 板块 | 今日状态 | 主要原因 |",
    "|---|---|---|",
    "| AI GPU | 偏强 / 偏弱 / 分化 | 原因 |",
    "| 定制 AI 芯片 | 偏强 / 偏弱 / 分化 | 原因 |",
    "| HBM / 存储 | 偏强 / 偏弱 / 分化 | 原因 |",
    "| 云计算 | 偏强 / 偏弱 / 分化 | 原因 |",
    "| 软件 SaaS | 偏强 / 偏弱 / 分化 | 原因 |",
    "| 消费电子 | 偏强 / 偏弱 / 分化 | 原因 |",
    "| 电动车 / 自动驾驶 | 偏强 / 偏弱 / 分化 | 原因 |",
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
    "## 7. 信息来源",
    "",
    "一手来源：",
    "- 公司财报 / SEC 文件 / BLS / Fed / BEA 等。一手来源必须来自输入来源。",
    "",
    "市场报道：",
    "- Reuters / AP / Bloomberg / WSJ / CNBC / Axios / Yahoo Finance 等。市场报道必须来自输入来源。",
    "",
    "免责声明：",
    "本文基于公开信息整理，仅用于市场观察和信息学习，不构成任何投资建议。",
    "",
    "质量要求：",
    "整体篇幅不少于 1800 个中文字符。若输入材料太少，必须在今日核心判断中标注“本期来源有限”，但仍按结构输出。",
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
