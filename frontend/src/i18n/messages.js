export const DEFAULT_LOCALE = "zh-CN";
export const SUPPORTED_LOCALES = ["zh-CN", "en-US"];

export const localeOptions = [
  { value: "zh-CN", label: "中文", shortLabel: "中" },
  { value: "en-US", label: "English", shortLabel: "EN" }
];

export const messages = {
  "zh-CN": {
    language: {
      label: "语言",
      chinese: "中文",
      english: "English"
    },
    app: {
      name: "货代装箱体积规划系统",
      workspace: "工作台",
      loadingAuth: "正在检查登录状态..."
    },
    metrics: {
      spaceUtilization: "空间利用率",
      deckUtilization: "甲板利用率",
      lengthPercent: "长度 {value}%",
      lengthSuffix: " · 长度 {value}%",
      deckUtilizationWithLength: "甲板利用率 {value}%{length}"
    },
    packingStatus: {
      commonReady: "常用箱型已出结果，特殊箱型补算中"
    },
    smartImport: {
      recognitionPlaceholder: "例如：\n蝶阀100 110*45*82cm 8件 单重180kg 木箱\n纸箱B 60*40*35cm 30件 单重12kg\n易碎品C 55×45×30cm 12件 单重18kg 不可重压",
      recognitionSample: [
        "蝶阀100 110*45*82cm 8件 单重180kg 木箱",
        "蝶阀200 125*55*90cm 4件 总重960kg 木箱",
        "纸箱B 60*40*35cm 30件 单重12kg",
        "易碎品C 55×45×30cm 12件 单重18kg 不可重压",
        "电子产品配件 型号K 长48.5cm 宽15cm 高11.7cm 数量1 单重1.2kg 朝上",
        "",
        "cargo:",
        "E-Houses",
        "2 skids - each 31.200 kgs / 1080 x 200 x 340 cm",
        "3 skids - each 18.100 kgs / 660 x 200 x 340 cm",
        "2 skids - each 33.700 kgs / 1.210 x 230 x 340 cm"
      ].join("\n"),
      sampleLoadedMessage: "已填入示例文本，点击智能识别后会由后端流程提取中文和英文 skid 明细。"
    },
    planner: {
      supportRatio: "可承重支撑比例",
      nonStackSupportRatio: "不可重压支撑比例",
      supportRatioTrace: "可承重 / 不可重压支撑阈值",
      supportConstraintNote: "如果货物不在箱底，下方必须由可承重货物的顶面覆盖达到当前配置的支撑比例；不可重压货物不会作为上层支撑。",
      supportFormula: "上层支撑条件 = 下方可承重重叠面积 ÷ 当前底面积 ≥ 当前配置支撑比例"
    },
    algorithmGuide: {
      eyebrow: "装箱策略图解",
      title: "当前计算如何从货物清单得到可视化方案",
      lanes: {
        prepare: {
          title: "预处理",
          text: "同规格货物先合并成搜索块，保留原始单件信息。"
        },
        base: {
          title: "五策略快跑",
          text: "每个箱型先用 5 种确定性顺序跑 LAFF + 极点，不做昂贵降级。"
        },
        refine: {
          title: "只精修最优",
          text: "选出当前箱型最优基础解后，再做 4 件块到 2 件块、单件回填。"
        },
        stage: {
          title: "分阶段输出",
          text: "20GP、40GP、40HQ、20HQ 等常用箱先返回结果，冷藏和平板继续补算。"
        }
      },
      strategies: {
        footprint: {
          title: "LAFF 大底面积优先",
          text: "优先选择底面积大的货物作为层种子，让同层尽量密铺。"
        },
        height: {
          title: "LAFF 高度优先",
          text: "先处理高货，避免后期剩余空间无法容纳高件。"
        },
        support: {
          title: "可承重优先",
          text: "可承重货物先形成底层支撑面，减少悬空和支撑失败。"
        },
        nonstack: {
          title: "不可重压后放",
          text: "不可重压货物不作为上层支撑，尽量放到后续层或顶部。"
        },
        vertical: {
          title: "小件竖放补位",
          text: "对小件和特定颜色/类型货物尝试竖放，填补窄高空间。"
        }
      }
    },
    decisionFlow: {
      eyebrow: "决策流",
      title: "装箱决策流程",
      clear: "清空流程",
      waiting: "正在整理 Web Worker 决策流程...",
      empty: "暂无流程数据，点击“重新计算”后会显示关键阶段。",
      records: "条记录",
      keySummary: "关键摘要",
      status: {
        done: "已完成",
        active: "进行中",
        idle: "等待中"
      },
      steps: {
        start: {
          label: "准备数据",
          description: "读取货物、箱型与装箱参数"
        },
        prepare: {
          label: "块化预处理",
          description: "同规格货物先聚合，降低浏览器搜索压力"
        },
        container: {
          label: "箱型评估",
          description: "逐个箱型检查尺寸、载重与可装性"
        },
        strategy: {
          label: "策略搜索",
          description: "执行 LAFF、极点与多排序策略"
        },
        layer: {
          label: "分层装载",
          description: "单层密铺后换下一层继续堆叠"
        },
        repair: {
          label: "局部回填",
          description: "用小块和单件回填剩余空隙"
        },
        box: {
          label: "货舱汇总",
          description: "统计每个货舱装入件数和剩余货物"
        },
        recommendation: {
          label: "推荐输出",
          description: "按箱数、利用率和合规状态生成推荐"
        }
      }
    }
  },
  "en-US": {
    language: {
      label: "Language",
      chinese: "Chinese",
      english: "English"
    },
    app: {
      name: "Cargo Container Planning System",
      workspace: "Workspace",
      loadingAuth: "Checking login status..."
    },
    metrics: {
      spaceUtilization: "Space Utilization",
      deckUtilization: "Deck Utilization",
      lengthPercent: "Length {value}%",
      lengthSuffix: " · Length {value}%",
      deckUtilizationWithLength: "Deck utilization {value}%{length}"
    },
    packingStatus: {
      commonReady: "Common containers ready, special containers still running"
    },
    smartImport: {
      recognitionPlaceholder: [
        "Example:",
        "Valve A 110*45*82cm 8 pcs unit weight 180kg wooden crate",
        "Carton B 60*40*35cm 30 pcs unit weight 12kg",
        "Fragile C 55*45*30cm 12 pcs unit weight 18kg non-stackable"
      ].join("\n"),
      recognitionSample: [
        "Valve A 110*45*82cm 8 pcs unit weight 180kg wooden crate",
        "Valve B 125*55*90cm 4 pcs total weight 960kg wooden crate",
        "Carton B 60*40*35cm 30 pcs unit weight 12kg",
        "Fragile C 55*45*30cm 12 pcs unit weight 18kg non-stackable",
        "Electronic accessory model K length 48.5cm width 15cm height 11.7cm quantity 1 unit weight 1.2kg upright",
        "",
        "cargo:",
        "E-Houses",
        "2 skids - each 31.200 kgs / 1080 x 200 x 340 cm",
        "3 skids - each 18.100 kgs / 660 x 200 x 340 cm",
        "2 skids - each 33.700 kgs / 1.210 x 230 x 340 cm"
      ].join("\n"),
      sampleLoadedMessage: "Sample text inserted. Click Smart Recognition to let the backend extract the mixed cargo and skid details."
    },
    planner: {
      supportRatio: "Stackable Support Ratio",
      nonStackSupportRatio: "Non-stack Support Ratio",
      supportRatioTrace: "Stackable / Non-stack Support Thresholds",
      supportConstraintNote: "If cargo is not on the container floor, the lower stackable top surface must cover the configured support ratio; non-stack cargo cannot support upper cargo.",
      supportFormula: "Support condition = lower stackable overlap area / current footprint >= configured support ratio"
    },
    algorithmGuide: {
      eyebrow: "Packing Strategy Map",
      title: "How the calculator turns cargo lines into a visual plan",
      lanes: {
        prepare: {
          title: "Preprocess",
          text: "Identical cargo is grouped into solver blocks while original single-piece data is preserved."
        },
        base: {
          title: "Five Fast Strategies",
          text: "Each container first runs 5 deterministic LAFF + extreme-point orders without expensive downgrade."
        },
        refine: {
          title: "Refine Only The Best",
          text: "After the best base solution is selected, 4-piece blocks downgrade to 2-piece blocks and then single-piece backfill."
        },
        stage: {
          title: "Stage Results",
          text: "Common 20GP, 40GP, 40HQ, and 20HQ results return first; reefer and flat-rack containers continue in the background."
        }
      },
      strategies: {
        footprint: {
          title: "LAFF Footprint First",
          text: "Large floor-footprint cargo becomes the layer seed so each layer can be packed densely."
        },
        height: {
          title: "LAFF Height First",
          text: "Tall cargo is considered early so later remaining spaces do not exclude it."
        },
        support: {
          title: "Support First",
          text: "Stackable cargo forms stable lower support surfaces before fragile cargo is considered."
        },
        nonstack: {
          title: "Non-stackable Last",
          text: "Non-stackable cargo cannot support upper cargo and is pushed toward later layers or the top."
        },
        vertical: {
          title: "Small Vertical Fill",
          text: "Small or marked cargo may be rotated upright to occupy narrow vertical gaps."
        }
      }
    },
    decisionFlow: {
      eyebrow: "Decision Flow",
      title: "Packing Decision Flow",
      clear: "Clear Flow",
      waiting: "Building the worker decision flow...",
      empty: "No flow data yet. Click Recalculate to show key stages.",
      records: "records",
      keySummary: "Key Summary",
      status: {
        done: "Done",
        active: "Running",
        idle: "Waiting"
      },
      steps: {
        start: {
          label: "Prepare Data",
          description: "Read cargo, container types, and packing parameters"
        },
        prepare: {
          label: "Block Preprocessing",
          description: "Group identical cargo first to reduce browser search load"
        },
        container: {
          label: "Container Evaluation",
          description: "Check dimensions, payload, and loadability by container"
        },
        strategy: {
          label: "Strategy Search",
          description: "Run LAFF, extreme points, and multiple sort strategies"
        },
        layer: {
          label: "Layered Packing",
          description: "Fill one layer densely, then continue on the next layer"
        },
        repair: {
          label: "Local Backfill",
          description: "Backfill remaining gaps with smaller blocks and single pieces"
        },
        box: {
          label: "Hold Summary",
          description: "Summarize loaded pieces and remaining cargo by hold"
        },
        recommendation: {
          label: "Recommendation",
          description: "Rank by box count, utilization, and compliance status"
        }
      }
    }
  }
};
