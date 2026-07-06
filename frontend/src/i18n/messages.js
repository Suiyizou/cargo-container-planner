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
    sceneOptions: {
      showAxes: "坐标轴",
      axisScale: "坐标轴大小",
      axisSmall: "小",
      axisNormal: "中",
      axisLarge: "大"
    },
    duration: {
      secondsShort: "{value} 秒",
      minutesShort: "{minutes} 分钟",
      minutesSecondsShort: "{minutes} 分 {seconds} 秒"
    },
    packingStatus: {
      commonReady: "常用箱型已出结果，特殊箱型补算中",
      partialReady: "部分方案可查看，其他箱型继续计算中"
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
      priorityContainers: "优先箱型",
      priorityContainersHint: "本次只计算 {count} 个已选箱型，减少等待时间",
      priorityCommon: "常用 GP/HQ",
      priorityAll: "全部箱型",
      supportRatio: "可承重支撑比例",
      nonStackSupportRatio: "不可重压支撑比例",
      supportRatioTrace: "可承重 / 不可重压支撑阈值",
      supportConstraintNote: "如果货物不在箱底，下方必须由可承重货物的顶面覆盖达到当前配置的支撑比例，并通过中心/四角采样与四象限分布校验；不可重压货物不会作为上层支撑。",
      supportFormula: "上层支撑条件 = 面积覆盖率达标 + 关键落脚点有支撑 + 四象限不能集中悬空"
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
      title: "装箱决策播报",
      clear: "清空播报",
      calculating: "计算中",
      latest: "最近一次计算",
      waiting: "正在整理 Web Worker 决策流程...",
      empty: "暂无流程数据，点击“重新计算”后会显示关键决策。",
      broadcast: "决策关键流上下滚动播报",
      records: "条记录",
      recordCount: "{count} 条记录",
      recordTotal: "共 {count} 条记录",
      recordIndex: "第 {index} 条记录",
      currentDecision: "当前执行决策",
      currentProgress: "当前进度",
      progressTitle: "当前进度",
      progressHint: "计算、渲染与输出状态",
      calculateStage: "策略计算",
      renderStage: "3D 渲染",
      completeStage: "完成",
      renderKicker: "渲染中",
      renderMeta: "正在刷新可视化结果",
      renderText: "正在生成 3D 装箱视图...",
      renderingText: "正在生成 3D 装箱视图，完成后会显示当前推荐箱型和货物坐标。",
      visualizing: "可视化视图",
      doneMeta: "本机计算已完成",
      doneText: "本机计算已完成，当前方案可以继续查看、导出或打印。",
      waitingTitle: "准备计算",
      waitingMeta: "正在准备本机装箱计算",
      elapsedTimer: "已用时 {value}",
      slowHint: "当前计算较慢，请耐心等待。",
      customerCurrentPlan: "当前方案",
      customerContainerMeta: "第 {index} 个箱型：{container}",
      containerCounter: "箱型进度 {current}/{total}",
      strategyCounter: "策略 {current}/{total}",
      remainingUnits: "剩余 {count} 个搜索单元",
      layerMeta: "第 {layer} 层",
      holdMeta: "第 {hold} 货舱",
      customerLoadingTitle: "货舱装箱计算",
      customerLayerPhase: "第 {layer} 层装箱",
      customerLayerText: "当前正在进行 {scope} 的货舱装箱计算 - 第 {layer} 层：{detail}",
      customerGenericText: "当前正在处理 {scope}：{detail}",
      customerOptimizingTitle: "空间利用优化",
      customerSupportTuningText: "正在优化 {scope} 的底层支撑和尾部空隙，尝试给上层货物提供更大的落脚面。",
      customerEvaluatingTitle: "箱型可装性评估",
      customerContainerText: "正在评估 {scope}，校验箱内尺寸、载重和可装性。",
      customerStrategyTitle: "装箱策略计算",
      customerStrategyText: "正在比较 {scope} 的装箱策略，寻找更稳、更满的摆放方式。",
      customerStrategyProgressText: "正在比较 {scope} 的装箱策略（第 {current}/{total} 个策略）：{detail}",
      customerSummaryTitle: "货舱结果汇总",
      customerHoldText: "正在汇总 {scope} 的第 {hold} 货舱结果：{detail}",
      customerBoxProgressText: "当前正在进行 {scope} 的第 {hold} 个货舱装箱计算，剩余 {remaining} 个搜索单元。",
      customerRecommendationText: "正在生成推荐方案，按合规状态和总参考运价排序。",
      customerPrepareTitle: "装箱数据准备",
      customerPrepareText: "正在整理货物、箱型和装箱规则，准备开始本机计算。",
      customerDetailFallback: "持续计算中",
      partialReadyText: "{scope} 的阶段结果已可查看，其他箱型继续在后台计算。",
      partialReadyMeta: "部分方案已可查看，最终推荐继续刷新中",
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
          description: "按合规状态和总参考运价生成推荐"
        }
      }
    },
    packingTimeout: {
      eyebrow: "本机计算未完成",
      title: "装箱计算超时",
      status: "本机计算超时",
      lead: "浏览器本地 Worker 已达到本次计算等待上限，系统已停止继续占用本机算力；如已出现部分结果，可以先作为参考查看。",
      elapsed: "已运行",
      timeout: "等待上限",
      cargoScale: "货物规模",
      cargoScaleValue: "{types} 类 / {pieces} 件",
      containerScale: "箱型规模",
      containerScaleValue: "{count} 个箱型",
      decisionRecords: "决策记录",
      currentStatus: "当前状态",
      partialStatus: "部分结果可用",
      noFinalStatus: "未生成最终推荐",
      reasonTitle: "可能原因",
      reasonFallback: "本次货物或箱型组合较复杂，Worker 未能在前端等待时间内完成所有箱型和策略搜索。",
      lastDecisionTitle: "最后执行到",
      suggestionTitle: "建议处理",
      suggestionReduceContainers: "先减少参与计算的箱型数量，优先保留实际订舱候选箱型。",
      suggestionSplitCargo: "将大票货物按项目、目的港或装箱批次拆分后分别计算。",
      suggestionUsePartial: "如果页面已有常用箱型阶段结果，可先查看部分方案，再决定是否继续补算特殊箱型。",
      close: "关闭",
      adjust: "返回调整",
      retry: "重新计算"
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
    sceneOptions: {
      showAxes: "Coordinate Axes",
      axisScale: "Axis Size",
      axisSmall: "Small",
      axisNormal: "Medium",
      axisLarge: "Large"
    },
    duration: {
      secondsShort: "{value}s",
      minutesShort: "{minutes}m",
      minutesSecondsShort: "{minutes}m {seconds}s"
    },
    packingStatus: {
      commonReady: "Common containers ready, special containers still running",
      partialReady: "Partial plan ready, other container types still running"
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
      priorityContainers: "Priority Containers",
      priorityContainersHint: "Only {count} selected container types are calculated this run",
      priorityCommon: "Common GP/HQ",
      priorityAll: "All Containers",
      supportRatio: "Stackable Support Ratio",
      nonStackSupportRatio: "Non-stack Support Ratio",
      supportRatioTrace: "Stackable / Non-stack Support Thresholds",
      supportConstraintNote: "If cargo is not on the container floor, lower stackable surfaces must meet the configured support ratio and pass center/corner sampling plus quadrant distribution checks; non-stack cargo cannot support upper cargo.",
      supportFormula: "Support condition = area coverage passes + key landing points are supported + support is distributed across quadrants"
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
      title: "Packing Decision Broadcast",
      clear: "Clear Broadcast",
      calculating: "Calculating",
      latest: "Latest Calculation",
      waiting: "Building the worker decision flow...",
      empty: "No flow data yet. Click Recalculate to show key decisions.",
      broadcast: "Vertical key-decision broadcast",
      records: "records",
      recordCount: "{count} records",
      recordTotal: "{count} records total",
      recordIndex: "Record {index}",
      currentDecision: "Current Decision",
      currentProgress: "Current Progress",
      progressTitle: "Current Progress",
      progressHint: "Calculation, rendering, and output status",
      calculateStage: "Strategy Calculation",
      renderStage: "3D Rendering",
      completeStage: "Complete",
      renderKicker: "Rendering",
      renderMeta: "Refreshing visualization",
      renderText: "Generating the 3D packing scene...",
      renderingText: "Generating the 3D packing scene. The current container and cargo coordinates will appear after rendering.",
      visualizing: "Visualization",
      doneMeta: "Local calculation completed",
      doneText: "Local calculation is complete. The current plan is ready to inspect, export, or print.",
      waitingTitle: "Preparing Calculation",
      waitingMeta: "Preparing the local packing calculation",
      elapsedTimer: "Elapsed {value}",
      slowHint: "This calculation is taking longer than usual. Please wait.",
      customerCurrentPlan: "Current plan",
      customerContainerMeta: "Container type {index}: {container}",
      containerCounter: "Container {current}/{total}",
      strategyCounter: "Strategy {current}/{total}",
      remainingUnits: "{count} search units remaining",
      layerMeta: "Layer {layer}",
      holdMeta: "Hold {hold}",
      customerLoadingTitle: "Hold Packing Calculation",
      customerLayerPhase: "Layer {layer} packing",
      customerLayerText: "Calculating hold packing for {scope} - layer {layer}: {detail}",
      customerGenericText: "Processing {scope}: {detail}",
      customerOptimizingTitle: "Space Utilization Optimization",
      customerSupportTuningText: "Optimizing lower support and tail gaps for {scope} to create more landing area for upper cargo.",
      customerEvaluatingTitle: "Container Loadability Check",
      customerContainerText: "Evaluating {scope}: checking internal dimensions, payload, and loadability.",
      customerStrategyTitle: "Packing Strategy Calculation",
      customerStrategyText: "Comparing packing strategies for {scope} to find a more stable and fuller layout.",
      customerStrategyProgressText: "Comparing packing strategies for {scope} (strategy {current}/{total}): {detail}",
      customerSummaryTitle: "Hold Result Summary",
      customerHoldText: "Summarizing hold {hold} for {scope}: {detail}",
      customerBoxProgressText: "Calculating hold {hold} for {scope}; {remaining} search units remain.",
      customerRecommendationText: "Generating recommendations by compliance status and total reference freight.",
      customerPrepareTitle: "Packing Data Preparation",
      customerPrepareText: "Preparing cargo, container types, and packing rules before local calculation starts.",
      customerDetailFallback: "Calculation is still running",
      partialReadyText: "The stage result for {scope} is ready to inspect while other container types continue in the background.",
      partialReadyMeta: "Partial plan ready; final recommendation is still refreshing",
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
          description: "Rank by compliance status and total reference freight"
        }
      }
    },
    packingTimeout: {
      eyebrow: "Local Calculation Incomplete",
      title: "Packing Calculation Timed Out",
      status: "Local calculation timed out",
      lead: "The browser Web Worker reached the waiting limit for this calculation, so the app stopped using local compute. If partial results are already shown, you can review them as a reference.",
      elapsed: "Elapsed",
      timeout: "Wait Limit",
      cargoScale: "Cargo Scale",
      cargoScaleValue: "{types} types / {pieces} pcs",
      containerScale: "Container Scale",
      containerScaleValue: "{count} container types",
      decisionRecords: "Decision Records",
      currentStatus: "Current Status",
      partialStatus: "Partial results available",
      noFinalStatus: "No final recommendation",
      reasonTitle: "Likely Reason",
      reasonFallback: "This cargo/container combination is complex, and the Worker did not finish all container and strategy searches within the frontend wait limit.",
      lastDecisionTitle: "Last Reached Step",
      suggestionTitle: "Suggested Next Steps",
      suggestionReduceContainers: "Reduce the container types included in the calculation and keep only realistic booking candidates first.",
      suggestionSplitCargo: "Split large shipments by project, destination, or loading batch before recalculating.",
      suggestionUsePartial: "If common-container stage results are already visible, review the partial plan before deciding whether to continue special-container calculation.",
      close: "Close",
      adjust: "Adjust Setup",
      retry: "Recalculate"
    }
  }
};
