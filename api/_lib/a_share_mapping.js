const A_SHARE_TECH_CHAIN_MAPPING = [
  {
    us_signal: "NVDA / AMD / AI GPU 需求增强",
    a_share_direction: "AI 算力、服务器、液冷、电源、PCB",
    representative_assets: [
      "工业富联",
      "浪潮信息",
      "中科曙光",
      "沪电股份",
      "胜宏科技",
      "AI 人工智能 ETF",
    ],
    transmission:
      "情绪映射来自全球 AI CAPEX 上修；基本面映射需要看国内服务器订单、PCB 产能利用率和利润率兑现。",
  },
  {
    us_signal: "AVGO / MRVL / ANET 数据中心网络走强",
    a_share_direction: "高速连接、交换芯片、服务器网络、PCB",
    representative_assets: [
      "沪电股份",
      "深南电路",
      "胜宏科技",
      "紫光股份",
      "中际旭创",
    ],
    transmission:
      "美股网络芯片和交换设备走强通常会带动高速互连链条情绪，但 A 股基本面要看海外客户订单和高端板占比。",
  },
  {
    us_signal: "COHR / LITE / AAOI / GLW 光互连升温",
    a_share_direction: "光模块、CPO、光器件、光纤材料",
    representative_assets: [
      "中际旭创",
      "新易盛",
      "天孚通信",
      "光迅科技",
      "通信 ETF",
    ],
    transmission:
      "情绪映射最直接；基本面映射取决于 800G/1.6T 订单、良率、ASP 和北美云厂商资本开支持续性。",
  },
  {
    us_signal: "MU / HBM / 存储周期改善",
    a_share_direction: "存储、HBM 配套、封测、先进封装",
    representative_assets: [
      "兆易创新",
      "澜起科技",
      "长电科技",
      "通富微电",
      "半导体 ETF",
    ],
    transmission:
      "情绪映射来自全球存储周期和 HBM 供需改善；基本面映射要看价格周期、国产替代和封测订单。",
  },
  {
    us_signal: "TSM / ASML / AMAT / LRCX 设备链变化",
    a_share_direction: "半导体设备、材料、晶圆制造",
    representative_assets: [
      "北方华创",
      "中微公司",
      "拓荆科技",
      "沪硅产业",
      "芯片 ETF",
    ],
    transmission:
      "美股设备链强弱更多反映全球晶圆厂资本开支，A 股映射需要结合国内扩产、国产替代和订单节奏。",
  },
  {
    us_signal: "MSFT / AMZN / GOOGL / META 云资本开支变化",
    a_share_direction: "云计算、IDC、AI 应用、企业软件",
    representative_assets: [
      "金山办公",
      "用友网络",
      "宝信软件",
      "光环新网",
      "云计算 ETF",
    ],
    transmission:
      "海外云厂商 CAPEX 上修偏利好算力基础设施链；软件和应用端更依赖国内商业化进度，不能简单同涨同跌。",
  },
];

function collectAShareMapping() {
  return {
    source: "MornInvest A-share technology chain mapping",
    source_rank: 3,
    title: "A-share technology chain mapping for US tech signals",
    url: "https://morninvest.com/",
    published_at: new Date().toISOString(),
    type: "a_share_mapping",
    summary:
      "美股科技信号到 A 股科技链条的方向映射。代表资产仅用于相关性理解，不构成投资建议、买卖建议或仓位建议。",
    mappings: A_SHARE_TECH_CHAIN_MAPPING,
  };
}

module.exports = {
  collectAShareMapping,
};
