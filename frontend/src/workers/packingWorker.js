const TYPE_RULES = {
  normal: { rotatable: true, nonStack: false, extraGapCm: 0 },
  upright: { rotatable: false, nonStack: false, extraGapCm: 1 },
  nonstack: { rotatable: true, nonStack: true, extraGapCm: 2 },
  pallet: { rotatable: false, nonStack: false, extraGapCm: 3 }
};

const COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];
const EPS = 0.0001;
const DEFAULT_SUPPORT_RATIO = 0.8;
const DEFAULT_NONSTACK_SUPPORT_RATIO = 0.985;
const MAX_DETAILED_BOXES = 24;
const LOCAL_SEARCH_PASSES = 5;
const GROUPING_MIN_TOTAL_UNITS = 120;
const GROUPING_MIN_CARGO_QUANTITY = 24;
const GROUPING_MAX_BLOCK_QUANTITY = 4;
const NON_STACK_TOP_LAYER_CANDIDATES = 16;
const LOWER_GAP_SWAP_MAX_BLUE_MOVERS = 24;
const LOWER_GAP_SWAP_MAX_LATE_MOVERS = 3;
const LOWER_GAP_SWAP_MIN_DROP_CM = 5;
const MIXED_PLAN_MAX_SOLVER_UNITS = 120;
const BALANCE_GREEN_LIMIT_PERCENT = 2.5;
const BALANCE_RED_LIMIT_PERCENT = 5;
const FRONT_MAX_PERCENT = 60;
const REAR_MIN_PERCENT_40FR = 30;
const LATERAL_OFFSET_LIMIT_CM = 8;
const BALANCE_SKIP_BELOW_WEIGHT_KG = 10000;
const HEAVY_TOP_FRACTION = 0.35;
const BALANCE_SCORE_WEIGHT = 250000;
const EARLY_BALANCE_SCORE_WEIGHT = 65000;
const HEAVY_CENTER_WEIGHT = 1600;
const HEAVY_ZONE_WEIGHT = 4200;
const LIGHT_ZONE_WEIGHT = 650;
const BALANCE_ZONE_ORDER = ["frontLeft", "rearRight", "frontRight", "rearLeft"];
const FIT_STATUS = {
  FIT: "fit",
  BALANCE_BLOCKED: "balance-blocked",
  OVERSIZE: "oversize"
};
const UTILIZATION_LOW_WARN_PERCENT = 55;
const UTILIZATION_HIGH_WARN_PERCENT = 92;
const RECOMMENDATION_TARGET_FILL_PERCENT = 72;
const RECOMMENDATION_COST_WEIGHT = 520;
const RECOMMENDATION_BOX_WEIGHT = 110;

const SEARCH_STRATEGIES = [
  { id: "laff-footprint", name: "LAFF 大底面积优先", unitOrder: "footprint", pointOrder: "low-wide", blueVertical: false },
  { id: "laff-height", name: "LAFF 高度优先", unitOrder: "height", pointOrder: "low-wide", blueVertical: false },
  { id: "support-first", name: "普通承重货物优先", unitOrder: "support", pointOrder: "support", blueVertical: false },
  { id: "nonstack-last", name: "不可重压货物最后", unitOrder: "nonstack-last", pointOrder: "low-wide", blueVertical: false },
  { id: "blue-vertical", name: "蓝色/小件竖放支撑", unitOrder: "small-vertical", pointOrder: "support", blueVertical: true }
];

let activeTrace = null;

const workerScope = typeof self !== "undefined" ? self : null;
if (workerScope?.addEventListener) {
  workerScope.onmessage = (event) => {
    const { id, payload } = event.data || {};
    const trace = createWorkerTrace(id, payload?.traceOptions);
    activeTrace = trace;
    try {
      const result = calculate(payload || {}, {
        onStageResult(stageResult) {
          trace.flush();
          workerScope.postMessage({ id, type: "partial", result: stageResult });
        }
      });
      trace.flush();
      workerScope.postMessage({ id, type: "result", result });
    } catch (error) {
      trace.flush();
      workerScope.postMessage({ id, type: "error", message: error.message || "本机计算失败" });
    } finally {
      activeTrace = null;
    }
  };
}

function createWorkerTrace(id, options = {}) {
  const enabled = Boolean(options?.enabled) && Boolean(workerScope?.postMessage);
  const maxEntries = Math.min(120, Math.max(30, Math.floor(Number(options?.maxEntries || 80))));
  const batchSize = Math.min(40, Math.max(6, Math.floor(Number(options?.batchSize || 12))));
  const buffer = [];
  let emitted = 0;
  let dropped = 0;

  return {
    log(entry) {
      if (!enabled || !entry?.text) return;
      if (entry.level === "detail") return;
      if (emitted >= maxEntries) {
        dropped += 1;
        return;
      }
      emitted += 1;
      buffer.push({
        index: emitted,
        phase: entry.phase || "search",
        level: entry.level || "summary",
        text: String(entry.text)
      });
      if (buffer.length >= batchSize) this.flush();
    },
    flush() {
      if (!enabled || !buffer.length) return;
      const decisions = buffer.splice(0);
      workerScope.postMessage({ id, type: "decision", decisions });
    },
    droppedCount() {
      return dropped;
    }
  };
}

function traceDecision(entry) {
  activeTrace?.log(entry);
}

export function calculate(request = {}, options = {}) {
  const globalGapCm = safeGlobalGapCm(request.globalGapCm);
  const cargos = request.cargos || [];
  const total = totals(request.cargos || []);
  const utilization = safeUtilizationPercent(request.utilizationPercent);
  const balanceSettings = normalizeBalanceSettings(request.balanceSettings);
  const supportSettings = normalizeSupportSettings(request);
  const evaluations = [];
  const orderedContainers = orderContainersForCalculation(request.containers || []);
  const primaryCount = orderedContainers.filter(isPrimaryCalculationContainer).length;
  traceDecision({
    phase: "start",
    level: "summary",
    text: `开始本机装箱：${cargos.length} 类货物 / ${total.totalQuantity} 件，评估 ${(request.containers || []).length} 个箱型；轻载阈值 ${round(balanceSettings.skipBelowWeightKg / 1000)}t。`
  });

  for (let i = 0; i < orderedContainers.length; i += 1) {
    const container = orderedContainers[i];
    const runtimeContainer = { ...container, balanceSettings, supportSettings };
    traceDecision({
      phase: "container",
      level: "summary",
      text: `评估箱型：${container.name}，内尺寸 ${round(container.lengthCm)}×${round(container.widthCm)}×${round(container.heightCm)}cm，最大载重 ${round(Number(container.payloadKg || 0) / 1000)}t。`
    });
    const units = buildUnits(cargos, globalGapCm, runtimeContainer, total);
    traceDecision({
      phase: "prepare",
      level: "summary",
      text: units.length < total.totalQuantity
        ? `${container.name} · 启用同规格块化：原始 ${total.totalQuantity} 件压缩为 ${units.length} 个搜索单元，最大组合块 ${GROUPING_MAX_BLOCK_QUANTITY} 件。`
        : `${container.name} · 保持单件搜索：共 ${units.length} 个搜索单元。`
    });
    const evaluation = evaluateContainer(runtimeContainer, units, total, utilization, globalGapCm);
    evaluation.container = { ...container };
    evaluations.push(evaluation);
    if (i + 1 === primaryCount && primaryCount < orderedContainers.length && typeof options.onStageResult === "function") {
      options.onStageResult(buildCalculationResult(evaluations, {
        partial: true,
        stage: "primary",
        pendingContainers: orderedContainers.length - primaryCount
      }));
      traceDecision({
        phase: "recommendation",
        level: "summary",
        text: `Primary container stage ready: ${primaryCount} common containers evaluated, ${orderedContainers.length - primaryCount} special containers still running.`
      });
    }
    traceDecision({
      phase: "container",
      level: "summary",
      text: `${container.name} · 计算完成：${evaluation.fitStatus === FIT_STATUS.FIT ? "可装" : evaluation.fitStatus === FIT_STATUS.BALANCE_BLOCKED ? "偏载拦截" : "不可装"}，${evaluation.boxes > 0 ? `${evaluation.boxes} 箱` : "未形成完整方案"}，首箱利用率 ${round(evaluation.firstBoxFillPercent)}%，平均利用率 ${round(evaluation.averageFillPercent)}%。`
    });
  }

  const mixedEvaluation = safeBuildMixedContainerEvaluation(orderedContainers, cargos, total, utilization, globalGapCm, balanceSettings, supportSettings);
  if (mixedEvaluation) {
    evaluations.push(mixedEvaluation);
    traceDecision({
      phase: "recommendation",
      level: "summary",
      text: `智能组合候选：${mixedEvaluation.mixedPlan?.summary || "组合方案"}，${mixedEvaluation.boxes} 箱，平均利用率 ${round(mixedEvaluation.averageFillPercent)}%。`
    });
  }

  evaluations.sort(compareEvaluation);
  traceDecision({
    phase: "recommendation",
    level: "summary",
    text: evaluations[0]
      ? `推荐结果：${evaluations[0].mixedPlan?.summary || evaluations[0].container.name}，${evaluations[0].boxes > 0 ? `${evaluations[0].boxes} 箱` : "暂无完整方案"}，综合评分 ${round(evaluations[0].recommendation?.score)}。`
      : "没有生成可推荐方案。"
  });
  return {
    bestContainerId: evaluations[0]?.container.id || null,
    evaluations
  };
}

function buildCalculationResult(evaluations, extra = {}) {
  const sorted = [...evaluations].sort(compareEvaluation);
  return {
    bestContainerId: sorted[0]?.container.id || null,
    evaluations: sorted,
    ...extra
  };
}

function orderContainersForCalculation(containers) {
  const ordered = [...containers].sort((a, b) => containerCalculationRank(a) - containerCalculationRank(b));
  const primary = ordered.filter(isPrimaryCalculationContainer);
  const secondary = ordered.filter((container) => !isPrimaryCalculationContainer(container));
  return [...primary, ...secondary];
}

function isPrimaryCalculationContainer(container) {
  const meta = equipmentMeta(container);
  if (container?.usagePriority === "special") return false;
  return meta.equipmentClass === "GP" || meta.equipmentClass === "HQ";
}

function containerCalculationRank(container) {
  const id = String(container?.id || "").toLowerCase();
  const fixedOrder = ["20gp", "40gp", "40hq", "20hq", "45hq", "20rf", "40rf", "20fr", "40fr"];
  const fixedIndex = fixedOrder.indexOf(id);
  if (fixedIndex >= 0) return fixedIndex;
  const meta = equipmentMeta(container);
  const classRank = {
    GP: 10,
    HQ: 20,
    RF: 60,
    FR: 80
  }[meta.equipmentClass] || 90;
  const priorityPenalty = container?.usagePriority === "special" ? 20 : 0;
  return classRank + priorityPenalty + Math.min(9, volumeM3(container) / 100);
}

function evaluateContainer(container, units, total, utilizationPercent, globalGapCm) {
  const multi = packMultiple(container, units);
  return buildEvaluation(container, units, total, utilizationPercent, globalGapCm, multi);
}

function evaluateContainerFromReusable(container, units, total, utilizationPercent, globalGapCm, reusable) {
  const placed = reusable.firstBox.placed.map(copyUnit);
  const placedIds = new Set(placed.map((unit) => unit.unitKey));
  const unplaced = units.filter((unit) => !placedIds.has(unit.unitKey));
  const firstBox = makePackedBox(placed, unplaced, {
    id: "reused-one-box",
    name: `复用 ${reusable.container.name} 的单箱坐标`
  }, { localSearchPasses: 0, repairedCount: 0 });
  const multi = {
    boxes: unplaced.length ? 2 : 1,
    firstBox,
    packedBoxes: [firstBox],
    estimated: unplaced.length > 0,
    fatalOversize: false
  };
  return buildEvaluation(container, units, total, utilizationPercent, globalGapCm, multi);
}

function buildEvaluation(container, units, total, utilizationPercent, globalGapCm, multi) {
  const usableVolume = volumeM3(container) * utilizationPercent / 100;
  const usage = usageMetricsForPackedBoxes(container, multi.packedBoxes, utilizationPercent);
  const firstPackedRawVolume = sumCargoVolumeM3(multi.firstBox.placed);
  const firstPackedOccupiedVolume = firstPackedRawVolume;
  const fillPercent = usage.firstFillPercent;
  const rawFillPercent = usableVolume > 0 ? firstPackedRawVolume / usableVolume * 100 : 0;
  const remainingVolume = usableVolume - firstPackedOccupiedVolume;
  const weightBoxes = container.payloadKg > 0 ? Math.ceil(total.totalWeightKg / container.payloadKg) : 0;
  const packedBoxBalances = multi.packedBoxes.map((box) => box.balanceValidation || validateWeightBalance(container, box.placed));
  const balanceBlocked = Boolean(
    multi.balanceBlocked
    || packedBoxBalances.some((validation) => validation?.severity === "red")
    || multi.firstBox?.strategySummary?.complianceBlocked
  );
  const geometryFeasible = multi.boxes > 0 && multi.firstBox?.placed?.length > 0;
  const boxes = geometryFeasible ? Math.max(multi.boxes, weightBoxes) : -1;
  const fitStatus = !geometryFeasible
    ? FIT_STATUS.OVERSIZE
    : balanceBlocked
      ? FIT_STATUS.BALANCE_BLOCKED
      : FIT_STATUS.FIT;
  const averageFillPercent = geometryFeasible && boxes > 0
    ? averageUsagePercentForBoxCount(container, multi.packedBoxes, utilizationPercent, boxes, total)
    : 0;

  const evaluation = {
    container,
    feasible: fitStatus === FIT_STATUS.FIT,
    geometryFeasible,
    complianceFeasible: fitStatus === FIT_STATUS.FIT,
    balanceBlocked,
    fitStatus,
    fatalOversize: fitStatus === FIT_STATUS.OVERSIZE,
    boxes,
    totalUnits: total.totalQuantity,
    solverUnits: units.length,
    groupedBlockCount: units.filter((unit) => unit.groupQuantity > 1).length,
    groupedPhysicalUnits: units.reduce((sum, unit) => sum + Math.max(0, unitQuantity(unit) - 1), 0),
    usableVolumeM3: round(usableVolume),
    totalRawVolumeM3: round(total.totalRawVolumeM3),
    totalWeightKg: round(total.totalWeightKg),
    usageMode: usage.mode,
    firstBoxFillPercent: round(fillPercent),
    firstBoxRawFillPercent: round(rawFillPercent),
    averageFillPercent: round(averageFillPercent),
    firstBoxDeckAreaPercent: round(usage.firstDeckAreaPercent),
    firstBoxLengthPercent: round(usage.firstLengthPercent),
    averageDeckAreaPercent: round(usage.averageDeckAreaPercent),
    firstBoxOccupiedVolumeM3: round(firstPackedOccupiedVolume),
    firstBoxRemainingVolumeM3: round(Math.max(0, remainingVolume)),
    estimatedBoxes: multi.estimated,
    detailedBoxes: multi.packedBoxes.length,
    detailedBoxLimit: multi.detailedBoxLimit || MAX_DETAILED_BOXES,
    remainingUnitCountAfterDetailed: multi.remainingUnitCountAfterDetailed || 0,
    trace: buildTrace(container, units, total, multi, {
      utilizationPercent,
      globalGapCm,
      usableVolume,
      firstPackedRawVolume,
      firstPackedOccupiedVolume,
      fillPercent,
      rawFillPercent,
      usage,
      averageFillPercent,
      remainingVolume,
      weightBoxes,
      boxes
    }),
    packedBoxes: multi.packedBoxes.map((box, index) => {
      const balanceValidation = packedBoxBalances[index] || validateWeightBalance(container, box.placed);
      const placedForOutput = expandGroupedPlacements(box.placed);
      return {
        index: index + 1,
        container: box.container ? { ...box.container } : undefined,
        strategyId: box.strategyId,
        strategyName: box.strategyName,
        strategySummary: box.strategySummary,
        balanceValidation,
        placed: placedForOutput.map(toPlacementDto),
        unplacedUnitKeys: box.unplaced.map((unit) => unit.unitKey)
      };
    })
  };
  evaluation.recommendation = buildRecommendation(evaluation);
  Object.defineProperty(evaluation, "_sourceFirstBox", { value: multi.firstBox, enumerable: false });
  return evaluation;
}

function canSeedReusableOneBox(evaluation) {
  return evaluation.boxes === 1
    && evaluation._sourceFirstBox
    && evaluation._sourceFirstBox.placed.length === evaluation.totalUnits
    && !evaluation._sourceFirstBox.unplaced.length;
}

function canReuseOneBox(reusable, container, total) {
  if (!reusable?.firstBox?.placed?.length) return false;
  if (container.payloadKg > 0 && total.totalWeightKg > container.payloadKg) return false;
  return reusable.firstBox.placed.every((unit) =>
    unit.x + unit.lengthCm <= container.lengthCm + EPS
    && unit.y + unit.widthCm <= container.widthCm + EPS
    && unit.z + unit.heightCm <= containerHeightLimit(container) + EPS
  );
}

function packMultiple(container, allUnits) {
  let remaining = allUnits.map(copyUnit);
  const packedBoxes = [];
  let firstBox = { placed: [], unplaced: remaining, strategyId: "none", strategyName: "无可行摆放", strategySummary: {} };
  let estimated = false;
  let fatalOversize = false;
  let balanceBlocked = false;
  let remainingUnitCountAfterDetailed = 0;

  for (let boxIndex = 0; remaining.length && boxIndex < MAX_DETAILED_BOXES; boxIndex += 1) {
    traceDecision({
      phase: "box",
      level: "summary",
      text: `${container.name} · 第 ${boxIndex + 1} 货舱开始：剩余 ${sumUnitQuantity(remaining)} 件 / ${remaining.length} 个搜索单元。`
    });
    const packed = packContainer(container, remaining);
    if (boxIndex === 0) firstBox = packed;
    if (!packed.placed.length) {
      fatalOversize = true;
      break;
    }
    if (packed.balanceValidation?.severity === "red" || packed.strategySummary?.complianceBlocked) {
      balanceBlocked = true;
    }
    packedBoxes.push(packed);
    traceDecision({
      phase: "box",
      level: "summary",
      text: `${container.name} · 第 ${boxIndex + 1} 货舱完成：装入 ${sumUnitQuantity(packed.placed)} 件，剩余 ${sumUnitQuantity(packed.unplaced)} 件，采用「${packed.strategyName || "未知策略"}」。`
    });
    remaining = packed.unplaced.map(stripPlacement);
  }

  let boxes = packedBoxes.length;
  if (remaining.length && packedBoxes.length && !fatalOversize) {
    remainingUnitCountAfterDetailed = sumUnitQuantity(remaining);
    const averagePlaced = Math.max(1, Math.round(packedBoxes.reduce((sum, box) => sum + sumUnitQuantity(box.placed), 0) / packedBoxes.length));
    boxes += Math.ceil(remainingUnitCountAfterDetailed / averagePlaced);
    estimated = true;
    remaining = [];
  }

  return {
    boxes: remaining.length ? -1 : boxes,
    firstBox,
    packedBoxes,
    detailedBoxLimit: MAX_DETAILED_BOXES,
    remainingUnitCountAfterDetailed,
    estimated,
    fatalOversize: fatalOversize || remaining.length > 0,
    balanceBlocked
  };
}

function safeBuildMixedContainerEvaluation(containers, cargos, total, utilizationPercent, globalGapCm, balanceSettings, supportSettings) {
  try {
    return buildMixedContainerEvaluation(containers, cargos, total, utilizationPercent, globalGapCm, balanceSettings, supportSettings);
  } catch (error) {
    return null;
  }
}

function buildMixedContainerEvaluation(containers, cargos, total, utilizationPercent, globalGapCm, balanceSettings, supportSettings) {
  if (!Array.isArray(containers) || containers.length < 2 || !total.totalQuantity) return null;
  const runtimeContainers = containers.map((container) => ({ ...container, balanceSettings, supportSettings }));
  const seedContainer = pickMixedSeedContainer(runtimeContainers);
  let remaining = buildUnits(cargos, globalGapCm, seedContainer, total).map(copyUnit);
  if (remaining.length > MIXED_PLAN_MAX_SOLVER_UNITS) return null;
  if (!remaining.length) return null;

  const packedBoxes = [];
  let balanceBlocked = false;
  let fatalOversize = false;

  for (let boxIndex = 0; remaining.length && boxIndex < MAX_DETAILED_BOXES; boxIndex += 1) {
    const candidates = runtimeContainers
      .map((container) => {
        const packed = packContainer(container, remaining);
        const placedQuantity = sumUnitQuantity(packed.placed);
        if (!placedQuantity) return null;
        const fitStatus = packed.balanceValidation?.severity === "red" || packed.strategySummary?.complianceBlocked
          ? FIT_STATUS.BALANCE_BLOCKED
          : FIT_STATUS.FIT;
        return {
          container,
          packed,
          placedQuantity,
          fitStatus,
          score: mixedBoxCandidateScore(container, packed, remaining, utilizationPercent, fitStatus)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);

    const selected = candidates.find((candidate) => candidate.fitStatus === FIT_STATUS.FIT) || candidates[0];
    if (!selected?.packed?.placed?.length) {
      fatalOversize = true;
      break;
    }

    const selectedBox = {
      ...selected.packed,
      container: { ...selected.container, balanceSettings: undefined, supportSettings: undefined }
    };
    packedBoxes.push(selectedBox);
    if (selected.fitStatus === FIT_STATUS.BALANCE_BLOCKED) balanceBlocked = true;
    remaining = selected.packed.unplaced.map(stripPlacement);
  }

  if (remaining.length) fatalOversize = true;
  if (!packedBoxes.length) return null;
  const distinctContainerIds = new Set(packedBoxes.map((box) => box.container?.id).filter(Boolean));
  if (!fatalOversize && distinctContainerIds.size < 2) return null;

  const mixedContainer = {
    id: "mixed-plan",
    name: "智能组合方案",
    lengthCm: packedBoxes[0].container.lengthCm,
    widthCm: packedBoxes[0].container.widthCm,
    heightCm: packedBoxes[0].container.heightCm,
    payloadKg: packedBoxes.reduce((sum, box) => sum + Number(box.container.payloadKg || 0), 0),
    equipmentClass: "MIX",
    priceTier: "mixed",
    costFactor: mixedPlanCost(packedBoxes),
    mixedPlan: true
  };
  const multi = {
    boxes: fatalOversize ? -1 : packedBoxes.length,
    firstBox: packedBoxes[0],
    packedBoxes,
    detailedBoxLimit: MAX_DETAILED_BOXES,
    remainingUnitCountAfterDetailed: sumUnitQuantity(remaining),
    estimated: false,
    fatalOversize,
    balanceBlocked
  };
  const units = packedBoxes.flatMap((box) => box.placed.map(copyUnit));
  const evaluation = buildEvaluation(mixedContainer, units, total, utilizationPercent, globalGapCm, multi);
  evaluation.isMixedPlan = true;
  const totalUsableVolume = packedBoxes.reduce((sum, box) => sum + volumeM3(box.container) * utilizationPercent / 100, 0);
  const totalOccupiedVolume = packedBoxes.reduce((sum, box) => sum + sumCargoVolumeM3(box.placed), 0);
  const usage = usageMetricsForPackedBoxes(mixedContainer, packedBoxes, utilizationPercent);
  evaluation.usableVolumeM3 = round(totalUsableVolume);
  evaluation.firstBoxOccupiedVolumeM3 = round(totalOccupiedVolume);
  evaluation.firstBoxRemainingVolumeM3 = round(Math.max(0, totalUsableVolume - totalOccupiedVolume));
  evaluation.usageMode = usage.mode;
  evaluation.firstBoxFillPercent = round(usage.averageFillPercent);
  evaluation.firstBoxRawFillPercent = evaluation.firstBoxFillPercent;
  evaluation.averageFillPercent = evaluation.firstBoxFillPercent;
  evaluation.firstBoxDeckAreaPercent = round(usage.firstDeckAreaPercent);
  evaluation.firstBoxLengthPercent = round(usage.firstLengthPercent);
  evaluation.averageDeckAreaPercent = round(usage.averageDeckAreaPercent);
  evaluation.mixedPlan = {
    summary: mixedPlanSummary(packedBoxes),
    boxes: packedBoxes.map((box, index) => ({
      index: index + 1,
      containerId: box.container.id,
      containerName: box.container.name,
      placedCount: sumUnitQuantity(box.placed)
    }))
  };
  evaluation.recommendation = buildRecommendation(evaluation);
  return evaluation;
}

function mixedBoxCandidateScore(container, packed, remaining, utilizationPercent, fitStatus) {
  const placedQuantity = sumUnitQuantity(packed.placed);
  const totalQuantity = Math.max(1, sumUnitQuantity(remaining));
  const placedVolume = sumCargoVolumeM3(packed.placed);
  const usableCapacity = Math.max(EPS, usageCapacity(container, utilizationPercent));
  const fillPercent = usageUsedCapacity(container, packed.placed) / usableCapacity * 100;
  const meta = equipmentMeta(container);
  const placedRatio = placedQuantity / totalQuantity;
  const completesAll = placedQuantity >= totalQuantity;
  const underfillPenalty = completesAll ? Math.max(0, 60 - fillPercent) * 0.12 : Math.max(0, 48 - fillPercent) * 0.05;
  const specialPenalty = meta.equipmentClass === "FR" ? 4.2 : meta.equipmentClass === "RF" ? 3.2 : meta.equipmentClass === "45HQ" ? 0.9 : 0;
  const blockedPenalty = fitStatus === FIT_STATUS.BALANCE_BLOCKED ? 500 : 0;
  const fillReward = Math.min(fillPercent, 88) / 100 * 1.4;
  return blockedPenalty
    + meta.costFactor
    + specialPenalty
    + underfillPenalty
    - fillReward
    - placedRatio * 1.25
    - placedVolume / Math.max(EPS, meta.costFactor) * 0.02;
}

function mixedPlanCost(packedBoxes) {
  return packedBoxes.reduce((sum, box) => sum + equipmentMeta(box.container).costFactor, 0);
}

function mixedPlanSummary(packedBoxes) {
  const counts = new Map();
  packedBoxes.forEach((box) => {
    const name = box.container?.name || "箱型";
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return [...counts.entries()].map(([name, count]) => count > 1 ? `${name}×${count}` : name).join(" + ");
}

function pickMixedSeedContainer(containers) {
  return [...containers].sort((a, b) => {
    const metaA = equipmentMeta(a);
    const metaB = equipmentMeta(b);
    const classPenaltyA = metaA.equipmentClass === "FR" || metaA.equipmentClass === "RF" ? 1000 : 0;
    const classPenaltyB = metaB.equipmentClass === "FR" || metaB.equipmentClass === "RF" ? 1000 : 0;
    const scoreA = classPenaltyA - volumeM3(a);
    const scoreB = classPenaltyB - volumeM3(b);
    return scoreA - scoreB;
  })[0] || containers[0] || null;
}

function buildUnits(cargos, globalGapCm, container = null, total = null) {
  const units = [];
  const totalQuantity = total?.totalQuantity ?? cargos.reduce((sum, cargo) => sum + Math.max(0, Math.floor(Number(cargo.quantity || 0))), 0);
  const canGroup = Boolean(container) && totalQuantity >= GROUPING_MIN_TOTAL_UNITS;
  cargos.forEach((cargo, cargoIndex) => {
    const rule = TYPE_RULES[cargo.type] || TYPE_RULES.normal;
    const gap = globalGapCm + rule.extraGapCm;
    const cargoId = cargo.id || `cargo-${cargoIndex}`;
    const quantity = Math.max(0, Math.floor(Number(cargo.quantity || 0)));
    if (canGroup && quantity >= GROUPING_MIN_CARGO_QUANTITY) {
      units.push(...buildGroupedCargoUnits(cargo, cargoIndex, cargoId, rule, gap, globalGapCm, container, quantity));
      return;
    }

    for (let i = 0; i < quantity; i += 1) {
      units.push(makeCargoUnit(cargo, cargoIndex, cargoId, i, 1, rule, gap, globalGapCm));
    }
  });
  markHeavyUnits(units);
  return orderUnits(units, "support");
}

function markHeavyUnits(units) {
  const weights = units
    .map((unit) => Number(unit.weightKg || 0))
    .filter((weight) => weight > 0)
    .sort((a, b) => b - a);
  if (!weights.length) return units;
  const topCount = Math.max(1, Math.ceil(weights.length * HEAVY_TOP_FRACTION));
  const threshold = weights[Math.min(weights.length - 1, topCount - 1)];
  units.forEach((unit) => {
    unit.isHeavy = Number(unit.weightKg || 0) >= threshold - EPS;
  });
  return units;
}

function buildGroupedCargoUnits(cargo, cargoIndex, cargoId, rule, gap, globalGapCm, container, quantity) {
  const units = [];
  let remaining = quantity;
  let serial = 0;
  while (remaining > 0) {
    const layout = remaining > 1
      ? bestGroupLayout(cargo, rule, gap, container, Math.min(GROUPING_MAX_BLOCK_QUANTITY, remaining))
      : null;
    if (layout?.count > 1) {
      units.push(makeCargoUnit(cargo, cargoIndex, cargoId, serial, layout.count, rule, gap, globalGapCm, layout));
      remaining -= layout.count;
    } else {
      units.push(makeCargoUnit(cargo, cargoIndex, cargoId, serial, 1, rule, gap, globalGapCm));
      remaining -= 1;
    }
    serial += 1;
  }
  return units;
}

function bestGroupLayout(cargo, rule, gap, container, maxCount) {
  const itemLength = Number(cargo.lengthCm) + gap;
  const itemWidth = Number(cargo.widthCm) + gap;
  const itemHeight = Number(cargo.heightCm) + rule.extraGapCm;
  if (itemHeight > containerHeightLimit(container) + EPS) return null;

  let best = null;
  for (let count = maxCount; count >= 2; count -= 1) {
    for (let rows = 1; rows <= count; rows += 1) {
      if (count % rows !== 0) continue;
      const cols = count / rows;
      const lengthCm = itemLength * cols;
      const widthCm = itemWidth * rows;
      if (!flatBlockFits(container, lengthCm, widthCm, itemHeight, rule.rotatable)) continue;
      const score = Math.abs(lengthCm - widthCm) + Math.max(lengthCm, widthCm) * 0.02;
      if (!best || count > best.count || (count === best.count && score < best.score)) {
        best = { count, cols, rows, score };
      }
    }
    if (best?.count === count) break;
  }
  return best;
}

function flatBlockFits(container, lengthCm, widthCm, heightCm, rotatable) {
  const heightLimit = containerHeightLimit(container);
  const fits = lengthCm <= container.lengthCm + EPS && widthCm <= container.widthCm + EPS && heightCm <= heightLimit + EPS;
  const rotatedFits = rotatable && widthCm <= container.lengthCm + EPS && lengthCm <= container.widthCm + EPS && heightCm <= heightLimit + EPS;
  return fits || rotatedFits;
}

function makeCargoUnit(cargo, cargoIndex, cargoId, itemIndex, groupQuantity, rule, gap, globalGapCm, layout = null) {
  const cols = layout?.cols || 1;
  const rows = layout?.rows || 1;
  const baseLengthCm = Number(cargo.lengthCm) * cols;
  const baseWidthCm = Number(cargo.widthCm) * rows;
  const baseHeightCm = Number(cargo.heightCm);
  const unit = {
    unitKey: groupQuantity > 1 ? `${cargoId}-g${itemIndex}-x${groupQuantity}` : `${cargoId}-${itemIndex}`,
    cargoId,
    cargoIndex,
    itemIndex,
    name: cargoDisplayName(cargo),
    baseName: cargo.name,
    model: cargo.model || "",
    color: cargo.color || COLORS[cargoIndex % COLORS.length],
    type: cargo.type || "normal",
    baseLengthCm,
    baseWidthCm,
    baseHeightCm,
    lengthCm: (Number(cargo.lengthCm) + gap) * cols,
    widthCm: (Number(cargo.widthCm) + gap) * rows,
    heightCm: Number(cargo.heightCm) + rule.extraGapCm,
    x: 0,
    y: 0,
    z: 0,
    weightKg: Number(cargo.weightKg || 0) * groupQuantity,
    rotatable: rule.rotatable,
    nonStack: rule.nonStack,
    extraGapCm: rule.extraGapCm,
    globalGapCm,
    verticalGapCm: rule.extraGapCm,
    gapCm: gap,
    groupQuantity,
    groupCols: cols,
    groupRows: rows,
    packedLengthCm: (Number(cargo.lengthCm) + gap) * cols,
    packedWidthCm: (Number(cargo.widthCm) + gap) * rows,
    packedHeightCm: Number(cargo.heightCm) + rule.extraGapCm,
    volumeM3: Number(cargo.lengthCm) * Number(cargo.widthCm) * Number(cargo.heightCm) * groupQuantity / 1_000_000
  };
  unit.orientations = generateOrientations(unit);
  return unit;
}

function generateOrientations(unit, options = {}) {
  const base = [
    { lengthCm: unit.lengthCm, widthCm: unit.widthCm, heightCm: unit.heightCm, lengthAxis: "长", widthAxis: "宽", heightAxis: "高" }
  ];
  if (unit.groupQuantity > 1 && unit.rotatable) {
    base.push(
      { lengthCm: unit.widthCm, widthCm: unit.lengthCm, heightCm: unit.heightCm, lengthAxis: "宽", widthAxis: "长", heightAxis: "高" }
    );
  } else if (unit.rotatable) {
    base.push(
      { lengthCm: unit.widthCm, widthCm: unit.lengthCm, heightCm: unit.heightCm, lengthAxis: "宽", widthAxis: "长", heightAxis: "高" },
      { lengthCm: unit.lengthCm, widthCm: unit.heightCm, heightCm: unit.widthCm, lengthAxis: "长", widthAxis: "高", heightAxis: "宽" },
      { lengthCm: unit.heightCm, widthCm: unit.lengthCm, heightCm: unit.widthCm, lengthAxis: "高", widthAxis: "长", heightAxis: "宽" },
      { lengthCm: unit.widthCm, widthCm: unit.heightCm, heightCm: unit.lengthCm, lengthAxis: "宽", widthAxis: "高", heightAxis: "长" },
      { lengthCm: unit.heightCm, widthCm: unit.widthCm, heightCm: unit.lengthCm, lengthAxis: "高", widthAxis: "宽", heightAxis: "长" }
    );
  }

  const seen = new Set();
  const orientations = base.filter((dims) => {
    const key = `${round3(dims.lengthCm)}/${round3(dims.widthCm)}/${round3(dims.heightCm)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return orientations.sort((a, b) => {
    if (options.preferVertical || shouldPreferVertical(unit)) {
      const heightDiff = b.heightCm - a.heightCm;
      if (Math.abs(heightDiff) > EPS) return heightDiff;
    }
    const areaDiff = b.lengthCm * b.widthCm - a.lengthCm * a.widthCm;
    if (Math.abs(areaDiff) > EPS) return areaDiff;
    return a.heightCm - b.heightCm;
  });
}

function packContainer(container, units) {
  const { stackable, nonStack } = splitUnitsForFinalNonStackPass(units);
  const stackableContainer = container;
  const baseAttempts = [];
  const attempts = [];
  let rejectedByBalance = 0;
  for (const strategy of SEARCH_STRATEGIES) {
    traceDecision({
      phase: "strategy",
      level: "summary",
      text: `${container.name} · base strategy "${strategy.id}" started.`
    });
    const ordered = orderUnits(stackable, strategy.unitOrder);
    const stackableAttempt = packLayerLaff(stackableContainer, ordered, strategy);
    const attempt = finalizeWithDeferredNonStack(container, stackableAttempt, nonStack, strategy, rejectedByBalance);
    if (attempt.balanceValidation?.severity === "red") rejectedByBalance += 1;
    baseAttempts.push(stackableAttempt);
    attempts.push(attempt);
    traceDecision({
      phase: "strategy",
      level: "summary",
      text: `${container.name} · base strategy "${strategy.id}" placed ${sumUnitQuantity(attempt.placed)} pcs, remaining ${sumUnitQuantity(attempt.unplaced)} pcs, ${attempt.strategySummary?.layerCount || 0} layers, balance ${balanceDecisionText(attempt.balanceValidation)}.`
    });
    if (!attempt.unplaced.length && attempt.balanceValidation?.severity !== "red") break;
  }

  const baseBest = selectBestAttempt(container, baseAttempts);
  if (baseBest?.placed?.length) {
    const bestStrategy = strategyById(baseBest.strategyId);
    let gapSwapped = optimizeLowerGapSwaps(stackableContainer, baseBest, bestStrategy);
    gapSwapped = optimizeBlueSideRows(stackableContainer, gapSwapped, bestStrategy);
    if (gapSwapped !== baseBest) {
      const finalGapSwapped = finalizeWithDeferredNonStack(container, gapSwapped, nonStack, bestStrategy, rejectedByBalance);
      if (finalGapSwapped.balanceValidation?.severity === "red") rejectedByBalance += 1;
      attempts.push(finalGapSwapped);
      traceDecision({
        phase: "repair",
        level: "summary",
        text: `${container.name} - ${bestStrategy.id}: lower-gap swap moved ${gapSwapped.strategySummary?.lowerGapSwapCount || 0} blue pcs down and lifted ${gapSwapped.strategySummary?.lowerGapSwapLiftedCount || 0} late pcs.`
      });
    }
  }
  if (baseBest?.unplaced?.length) {
    const bestStrategy = strategyById(baseBest.strategyId);
    traceDecision({
      phase: "repair",
      level: "summary",
      text: `${container.name} · refine only the best base strategy "${bestStrategy.id}" with block downgrade and local backfill.`
    });
    const beforeRefine = sumUnitQuantity(baseBest.unplaced);
    let refined = enhanceWithBlockDowngrade(stackableContainer, baseBest, bestStrategy);
    if (refined.unplaced.length) {
      refined = repairWithLocalSearch(stackableContainer, refined, orderUnits(refined.unplaced.map(stripPlacement), bestStrategy.unitOrder), bestStrategy);
    }
    refined = optimizeLowerGapSwaps(stackableContainer, refined, bestStrategy);
    refined = optimizeBlueSideRows(stackableContainer, refined, bestStrategy);
    const finalRefined = finalizeWithDeferredNonStack(container, refined, nonStack, bestStrategy, rejectedByBalance);
    if (finalRefined.balanceValidation?.severity === "red") rejectedByBalance += 1;
    attempts.push(finalRefined);
    traceDecision({
      phase: "repair",
      level: "summary",
      text: `${container.name} · refined "${bestStrategy.id}": before ${beforeRefine} pcs stackable remaining, after ${sumUnitQuantity(finalRefined.unplaced)} pcs total remaining, block passes ${finalRefined.strategySummary?.blockDowngradePasses || 0}, refill passes ${finalRefined.strategySummary?.refillPasses || 0}.`
    });
  }

  const accepted = attempts.filter((attempt) => attempt.balanceValidation?.severity !== "red");
  if (accepted.length) return accepted.sort(comparePackAttempt(container))[0];

  const blocked = attempts
    .filter((attempt) => attempt.placed.length)
    .sort(comparePackAttempt(container))[0];
  if (blocked) {
    blocked.strategySummary = {
      ...blocked.strategySummary,
      balanceRejected: true,
      balanceRejectedCount: rejectedByBalance,
      complianceBlocked: true
    };
    return blocked;
  }

  const fallback = makePackedBox([], units, { id: "none", name: "balance rejected" }, {
    localSearchPasses: 0,
    repairedCount: 0,
    balanceRejectedCount: rejectedByBalance
  });
  fallback.balanceValidation = emptyWeightBalance(container);
  fallback.strategySummary.balanceRejectedCount = rejectedByBalance;
  return fallback;
}

function splitUnitsForFinalNonStackPass(units) {
  const stackable = [];
  const nonStack = [];
  for (const unit of units || []) {
    const clean = stripPlacement(unit);
    if (clean.nonStack) nonStack.push(clean);
    else stackable.push(clean);
  }
  return { stackable, nonStack };
}

function finalizeWithDeferredNonStack(container, stackableAttempt, deferredNonStack, strategy, rejectedByBalance = 0) {
  let placed = (stackableAttempt.placed || []).filter((unit) => !unit.nonStack).map(copyUnit);
  const stackableUnplaced = (stackableAttempt.unplaced || []).filter((unit) => !unit.nonStack).map(stripPlacement);
  let nonStackTopPlacedCount = 0;
  let nonStackUnplaced = [];

  if (deferredNonStack.length) {
    const nonStackResult = placeDeferredNonStackOnTop(container, placed, deferredNonStack, strategy);
    nonStackTopPlacedCount = nonStackResult.placedCount;
    nonStackUnplaced = nonStackResult.unplaced.map(stripPlacement);
    traceDecision({
      phase: "layer",
      level: "summary",
      text: `${container.name} - ${strategy.name} - global non-stack final pass: ${nonStackTopPlacedCount}/${sumUnitQuantity(deferredNonStack)} non-stack pcs placed after all stackable search/refill stages.`
    });
  }

  const valid = validateAllPlacements(container, placed);
  const attempt = makePackedBox(valid ? placed : stackableAttempt.placed.map(copyUnit), valid ? [...stackableUnplaced, ...nonStackUnplaced] : [
    ...stackableUnplaced,
    ...deferredNonStack.map(stripPlacement)
  ], {
    id: stackableAttempt.strategyId || strategy.id,
    name: stackableAttempt.strategyName || strategy.name
  }, {
    ...(stackableAttempt.strategySummary || {}),
    nonStackTopPlacedCount,
    finalNonStackPass: deferredNonStack.length ? 1 : 0,
    layerCount: countLayers(valid ? placed : stackableAttempt.placed)
  });

  return finalizeAttempt(container, attempt, strategy, rejectedByBalance);
}

function finalizeAttempt(container, attempt, strategy, rejectedByBalance = 0) {
  let next = centerPackedLayout(container, attempt, strategy);
  next = withBalanceValidation(container, next, rejectedByBalance);
  return next;
}

function selectBestAttempt(container, attempts) {
  const accepted = attempts.filter((attempt) => attempt.balanceValidation?.severity !== "red");
  const pool = accepted.length ? accepted : attempts.filter((attempt) => attempt.placed.length);
  return pool.sort(comparePackAttempt(container))[0] || attempts[0] || null;
}

function strategyById(strategyId) {
  return SEARCH_STRATEGIES.find((strategy) => strategy.id === strategyId) || SEARCH_STRATEGIES[0];
}

function packLayerLaff(container, units, strategy, fixedPlaced = []) {
  const placed = fixedPlaced.map(copyUnit);
  const unplaced = [];
  const originalActive = units.map(stripPlacement);
  const deferredNonStack = [];
  const active = [];
  for (const unit of originalActive) {
    const clean = copyUnit(unit);
    if (clean.nonStack) deferredNonStack.push(clean);
    else active.push(clean);
  }
  const stackableContainer = container;
  let nextLayerBottom = 0;
  let layerNo = countLayers(placed);

  while (active.length) {
    const seedIndex = pickLayerSeedIndex(active, stackableContainer, placed, strategy, { layerBottom: nextLayerBottom });
    if (seedIndex < 0) {
      unplaced.push(...active.splice(0));
      break;
    }

    const seed = active.splice(seedIndex, 1)[0];
    const seedPlacement = packExtremePoint(stackableContainer, placed, seed, strategy, { layerBottom: nextLayerBottom });
    if (!seedPlacement) {
      unplaced.push(seed);
      continue;
    }

    const placedSeed = applyPlacement(seed, seedPlacement);
    placed.push(placedSeed);
    const layerBottom = placedSeed.z;
    const layerTop = placedSeed.z + placedSeed.heightCm;
    layerNo += 1;
    let layerPlacedQuantity = unitQuantity(placedSeed);
    traceDecision({
      phase: "layer",
      level: "summary",
      text: `${container.name} · ${strategy.name} · 第 ${layerNo} 层选种子：${decisionUnitName(seed)} ${decisionDims(seedPlacement)}，底面积 ${round(seedPlacement.lengthCm * seedPlacement.widthCm)}cm²，放置 ${decisionPoint(seedPlacement)}，层高上限 z=${round(layerTop)}cm。`
    });

    let changed = true;
    while (changed) {
      changed = false;
      const layerCandidates = orderLayerCandidates(active, layerBottom, layerTop, strategy);
      for (const unit of layerCandidates) {
        const index = active.findIndex((item) => item.unitKey === unit.unitKey);
        if (index < 0) continue;
        const placement = packExtremePoint(stackableContainer, placed, unit, strategy, { layerBottom, layerTop });
        if (!placement) continue;
        active.splice(index, 1);
        placed.push(applyPlacement(unit, placement));
        layerPlacedQuantity += unitQuantity(unit);
        traceDecision({
          phase: "placement",
          level: "detail",
          text: `${container.name} · 第 ${layerNo} 层装入：${decisionUnitName(unit)} ${decisionDims(placement)} → ${decisionPoint(placement)}，不超过当前层高 ${round(layerTop - layerBottom)}cm。`
        });
        changed = true;
      }
    }

    const skippedByHeight = active.filter((unit) =>
      !unit.orientations.some((dims) => dims.heightCm <= layerTop - layerBottom + EPS)
    ).length;
    if (skippedByHeight) {
      traceDecision({
        phase: "layer",
        level: "summary",
        text: `${container.name} · 第 ${layerNo} 层跳过 ${skippedByHeight} 个较高搜索单元：高度超过本层 ${round(layerTop - layerBottom)}cm，保留到下一层继续作为候选。`
      });
    }
    traceDecision({
      phase: "layer",
      level: "summary",
      text: `${container.name} · 第 ${layerNo} 层完成：本层装入 ${layerPlacedQuantity} 件，累计 ${sumUnitQuantity(placed)} 件，剩余 ${sumUnitQuantity(active)} 件；下一层从 z=${round(layerTop)}cm 开始。`
    });
    nextLayerBottom = Math.max(nextLayerBottom, layerTop);
  }

  let nonStackTopPlacedCount = 0;
  if (deferredNonStack.length) {
    const nonStackResult = placeDeferredNonStackOnTop(container, placed, deferredNonStack, strategy);
    nonStackTopPlacedCount = nonStackResult.placedCount;
    unplaced.push(...nonStackResult.unplaced);
    traceDecision({
      phase: "layer",
      level: "summary",
      text: `${container.name} · ${strategy.name} · non-stack deferred: stackable cargo first, then ${nonStackTopPlacedCount}/${sumUnitQuantity(deferredNonStack)} non-stack pcs placed on top candidates.`
    });
  }

  const valid = validateAllPlacements(container, placed);
  return makePackedBox(valid ? placed : fixedPlaced.map(copyUnit), valid ? unplaced : originalActive, strategy, {
    localSearchPasses: 0,
    repairedCount: 0,
    fixedPlacedCount: fixedPlaced.length,
    layerCount: countLayers(placed),
    nonStackTopPlacedCount
  });
}

function placeDeferredNonStackOnTop(container, placed, units, strategy) {
  let pending = orderUnits(units.map(stripPlacement), strategy.unitOrder);
  let placedCount = 0;

  const runPass = (items) => {
    const next = [];
    for (const unit of orderUnits(items.map(stripPlacement), strategy.unitOrder)) {
      const placement = findTopExposedPlacement(container, placed, unit, strategy);
      if (placement) {
        placed.push(applyPlacement(unit, placement));
        placedCount += unitQuantity(unit);
      } else {
        next.push(unit);
      }
    }
    return next;
  };

  pending = runPass(pending);
  if (pending.some((unit) => unitQuantity(unit) > 2)) {
    pending = runPass(downgradeUnits(pending, 2, container));
  }
  if (pending.some((unit) => unitQuantity(unit) > 1)) {
    pending = runPass(downgradeUnits(pending, 1, container));
  }

  return { placedCount, unplaced: pending };
}

function findTopOnlyPlacement(container, placed, unit, strategy) {
  return findTopExposedPlacement(container, placed, unit, strategy);
}

function findTopExposedPlacement(container, placed, unit, strategy) {
  const layerBottoms = topCandidateLayerBottoms(placed);
  for (const layerBottom of layerBottoms) {
    const placement = packExtremePoint(container, placed, unit, strategy, { layerBottom, denseTop: true, exposedTop: true });
    if (!placement) continue;
    const candidate = applyPlacement(unit, placement);
    if (!hasAnyBoxInColumnAbove(candidate, placed)) return placement;
  }

  const directPlacement = packExtremePoint(container, placed, unit, strategy, { denseTop: true, exposedTop: true });
  if (directPlacement) return directPlacement;
  return null;
}

function topCandidateLayerBottoms(placed) {
  if (!placed.length) return [0];
  return uniqueSorted(placed.map((box) => box.z + box.heightCm), Number.NaN)
    .filter((value) => Number.isFinite(value) && value > EPS)
    .sort((a, b) => b - a)
    .slice(0, NON_STACK_TOP_LAYER_CANDIDATES);
}

function enhanceWithBlockDowngrade(container, attempt, strategy) {
  let current = cloneAttempt(attempt);
  let best = cloneAttempt(attempt);
  let downgradePasses = 0;
  let downgradePlacedCount = 0;
  let singleBackfillPlacedCount = 0;

  const runRound = (maxGroupSize, withSingleBackfill = false) => {
    if (!current.unplaced.length) return;
    const downgraded = downgradeUnits(current.unplaced, maxGroupSize, container);
    if (!downgraded.length) return;
    const beforePlaced = sumUnitQuantity(current.placed);
    let candidate = packLayerLaff(container, orderUnits(downgraded, strategy.unitOrder), strategy, current.placed);
    if (withSingleBackfill) {
      candidate = backfillSingleUnits(container, candidate, strategy);
    }
    const placedGain = sumUnitQuantity(candidate.placed) - beforePlaced;
    if (placedGain <= 0 || !validateAllPlacements(container, candidate.placed)) return;
    downgradePasses += 1;
    downgradePlacedCount += placedGain;
    singleBackfillPlacedCount += Number(candidate.strategySummary?.singleBackfillPlacedCount || 0);
    current = candidate;
    if (comparePackAttempt(container)(candidate, best) < 0) {
      best = cloneAttempt(candidate);
    }
  };

  runRound(2, false);
  runRound(1, true);

  if (downgradePlacedCount <= 0) return attempt;
  return makePackedBox(best.placed.map(copyUnit), best.unplaced.map(stripPlacement), {
    id: best.strategyId,
    name: best.strategyName
  }, {
    ...(best.strategySummary || {}),
    blockDowngradePasses: downgradePasses,
    blockDowngradePlacedCount: downgradePlacedCount,
    singleBackfillPlacedCount
  });
}

function downgradeUnits(units, maxGroupSize, container) {
  const result = [];
  let serial = 0;
  for (const unit of units) {
    const clean = stripPlacement(unit);
    const quantity = unitQuantity(clean);
    if (quantity <= maxGroupSize) {
      result.push(clean);
      continue;
    }
    let remaining = quantity;
    while (remaining > 0) {
      const count = Math.min(maxGroupSize, remaining);
      const derived = makeDerivedGroupUnit(clean, count, container, serial);
      if (derived) {
        result.push(derived);
      } else if (count > 1) {
        for (let i = 0; i < count; i += 1) {
          const single = makeDerivedGroupUnit(clean, 1, container, `${serial}-${i}`);
          if (single) result.push(single);
        }
      }
      remaining -= count;
      serial += 1;
    }
  }
  return markHeavyUnits(result);
}

function makeDerivedGroupUnit(source, count, container, serial) {
  const quantity = Math.max(1, Math.floor(Number(count || 1)));
  const layout = bestDerivedGroupLayout(source, quantity, container);
  if (!layout) return null;
  const serialNumber = Number.parseInt(String(serial), 10);
  const gap = Number(source.gapCm || 0);
  const rawLength = singleRawLengthCm(source);
  const rawWidth = singleRawWidthCm(source);
  const rawHeight = singleRawHeightCm(source);
  const heightCm = rawHeight + Number(source.verticalGapCm || source.extraGapCm || 0);
  const lengthCm = (rawLength + gap) * layout.cols;
  const widthCm = (rawWidth + gap) * layout.rows;
  const unit = {
    ...stripPlacement(source),
    unitKey: `${source.unitKey}-d${quantity}-${serial}`,
    parentUnitKey: source.parentUnitKey || source.unitKey,
    itemIndex: Number(source.itemIndex || 0) * 1000 + (Number.isFinite(serialNumber) ? serialNumber : 0),
    baseLengthCm: rawLength * layout.cols,
    baseWidthCm: rawWidth * layout.rows,
    baseHeightCm: rawHeight,
    lengthCm,
    widthCm,
    heightCm,
    packedLengthCm: lengthCm,
    packedWidthCm: widthCm,
    packedHeightCm: heightCm,
    weightKg: singleWeightKg(source) * quantity,
    volumeM3: singleVolumeM3(source) * quantity,
    groupQuantity: quantity,
    groupCols: layout.cols,
    groupRows: layout.rows
  };
  unit.orientations = generateOrientations(unit);
  return unit;
}

function bestDerivedGroupLayout(source, count, container) {
  const quantity = Math.max(1, Math.floor(Number(count || 1)));
  const gap = Number(source.gapCm || 0);
  const itemLength = singleRawLengthCm(source) + gap;
  const itemWidth = singleRawWidthCm(source) + gap;
  const itemHeight = singleRawHeightCm(source) + Number(source.verticalGapCm || source.extraGapCm || 0);
  if (itemHeight > containerHeightLimit(container) + EPS) return null;
  if (quantity <= 1) {
    return flatBlockFits(container, itemLength, itemWidth, itemHeight, source.rotatable)
      ? { count: 1, cols: 1, rows: 1, score: 0 }
      : null;
  }

  let best = null;
  for (let rows = 1; rows <= quantity; rows += 1) {
    if (quantity % rows !== 0) continue;
    const cols = quantity / rows;
    const lengthCm = itemLength * cols;
    const widthCm = itemWidth * rows;
    if (!flatBlockFits(container, lengthCm, widthCm, itemHeight, source.rotatable)) continue;
    const score = Math.abs(lengthCm - widthCm) + Math.max(lengthCm, widthCm) * 0.02;
    if (!best || score < best.score) best = { count: quantity, cols, rows, score };
  }
  return best;
}

function backfillSingleUnits(container, attempt, strategy) {
  if (!attempt.unplaced.some((unit) => unitQuantity(unit) <= 1)) return attempt;
  const placed = attempt.placed.map(copyUnit);
  const unplaced = [];
  let placedCount = 0;
  const ordered = orderUnits(attempt.unplaced.map(stripPlacement), strategy.unitOrder);
  const stackable = ordered.filter((unit) => !unit.nonStack);
  const nonStack = ordered.filter((unit) => unit.nonStack);
  for (const unit of stackable) {
    if (unitQuantity(unit) > 1) {
      unplaced.push(unit);
      continue;
    }
    const placement = packExtremePoint(container, placed, unit, strategy);
    if (placement) {
      placed.push(applyPlacement(unit, placement));
      placedCount += 1;
    } else {
      unplaced.push(unit);
    }
  }
  for (const unit of nonStack) {
    if (unitQuantity(unit) > 1) {
      unplaced.push(unit);
      continue;
    }
    const placement = findTopOnlyPlacement(container, placed, unit, strategy);
    if (placement) {
      placed.push(applyPlacement(unit, placement));
      placedCount += 1;
    } else {
      unplaced.push(unit);
    }
  }
  if (!placedCount || !validateAllPlacements(container, placed)) return attempt;
  return makePackedBox(placed, unplaced, {
    id: attempt.strategyId,
    name: attempt.strategyName
  }, {
    ...(attempt.strategySummary || {}),
    singleBackfillPlacedCount: Number(attempt.strategySummary?.singleBackfillPlacedCount || 0) + placedCount
  });
}

function packExtremePoint(container, placed, unit, strategy, options = {}) {
  let best = null;
  const orientations = generateOrientations(unit, { preferVertical: strategy.blueVertical });
  const supportRatio = supportRatioForUnit(container, unit, strategy, options);
  for (const dims of orientations) {
    if (!fitsContainerDims(container, dims)) continue;
    for (const point of extremePoints(container, placed, dims, options)) {
      const placement = { ...point, ...dims };
      const validation = validatePlacement(container, placed, unit, placement, supportRatio);
      if (!validation.valid) continue;
      if (options.exposedTop && hasAnyBoxInColumnAbove(placement, placed)) continue;
      const score = placementScore(placement, unit, container, strategy, placed);
      if (!best || score < best.score) best = { ...placement, score };
    }
  }
  return best;
}

function repairWithLocalSearch(container, attempt, originalUnits, strategy) {
  let best = cloneAttempt(attempt);
  const movableWindows = [4, 6, 9, 12, 16];

  for (let pass = 0; pass < LOCAL_SEARCH_PASSES && best.unplaced.length; pass += 1) {
    const windowSize = movableWindows[pass] || movableWindows[movableWindows.length - 1];
    const removed = chooseRemovalSet(best.placed, best.unplaced, windowSize, pass);
    const kept = best.placed.filter((unit) => !removed.has(unit.unitKey)).map(copyUnit);
    const retry = [
      ...best.unplaced.map(stripPlacement),
      ...best.placed.filter((unit) => removed.has(unit.unitKey)).map(stripPlacement)
    ];
    const orderedRetry = orderUnits(retry, pass % 2 ? "height" : strategy.unitOrder);
    const placed = kept.map(copyUnit);
    const unplaced = [];

    for (const unit of orderedRetry) {
      const placement = unit.nonStack
        ? findTopOnlyPlacement(container, placed, unit, strategy)
        : packExtremePoint(container, placed, unit, strategy);
      if (placement) placed.push(applyPlacement(unit, placement));
      else unplaced.push(unit);
    }

    const candidate = makePackedBox(placed, unplaced, strategy, {
      localSearchPasses: pass + 1,
      repairedCount: attempt.unplaced.length - unplaced.length,
      layerCount: countLayers(placed)
    });
    if (validateAllPlacements(container, candidate.placed) && comparePackAttempt(container)(candidate, best) < 0) {
      best = candidate;
    }
  }

  return best;
}

function optimizeLowerGapSwaps(container, attempt, strategy) {
  if (!attempt?.placed?.length) return attempt;
  const sourceAttempt = expandAttemptPlacementsForFineTuning(container, attempt);
  const placed = sourceAttempt.placed.map(copyUnit);
  const blueCandidates = lowerGapBlueCandidates(container, placed);
  if (!blueCandidates.length) return attempt;

  const lateCandidates = lowerGapLateCandidates(container, placed, blueCandidates);
  const maxBlue = Math.min(LOWER_GAP_SWAP_MAX_BLUE_MOVERS, blueCandidates.length);
  const maxLate = Math.min(LOWER_GAP_SWAP_MAX_LATE_MOVERS, lateCandidates.length);
  let best = cloneAttempt(sourceAttempt);

  for (let lateCount = 0; lateCount <= maxLate; lateCount += 1) {
    const blueLimit = Math.min(maxBlue, lateCount ? LOWER_GAP_SWAP_MAX_BLUE_MOVERS : 4);
    for (let blueCount = 1; blueCount <= blueLimit; blueCount += 1) {
      const candidate = buildLowerGapSwapAttempt(
        container,
        sourceAttempt,
        strategy,
        blueCandidates.slice(0, blueCount),
        lateCandidates.slice(0, lateCount)
      );
      if (candidate && isLowerGapSwapBetter(container, candidate, best)) {
        best = candidate;
      }
    }
  }

  return Number(best.strategySummary?.lowerGapSwapCount || 0) > Number(attempt.strategySummary?.lowerGapSwapCount || 0)
    ? best
    : attempt;
}

function expandAttemptPlacementsForFineTuning(container, attempt) {
  if (!attempt?.placed?.some((unit) => unitQuantity(unit) > 1)) return attempt;
  const placed = expandGroupedPlacements(attempt.placed).map((unit) => (
    isBlueLikeCargo(unit) && !unit.nonStack
      ? { ...unit, supportRatioOverride: unit.supportRatioOverride ?? lowerGapSwapSupportRatio(container, unit) }
      : unit
  ));
  return makePackedBox(placed, attempt.unplaced.map(stripPlacement), {
    id: attempt.strategyId,
    name: attempt.strategyName
  }, {
    ...(attempt.strategySummary || {}),
    layerCount: countLayers(attempt.placed)
  });
}

function lowerGapBlueCandidates(container, placed) {
  const top = maxTop(placed);
  const heightLimit = containerHeightLimit(container);
  const minTop = Math.max(top - 90, heightLimit * 0.45);
  return placed
    .filter((unit) =>
      !unit.nonStack
      && isBlueLikeCargo(unit)
      && unit.z + unit.heightCm >= minTop - EPS
      && !hasAnyBoxInColumnAbove(unit, placed)
    )
    .sort((a, b) => {
      const topDiff = (b.z + b.heightCm) - (a.z + a.heightCm);
      if (Math.abs(topDiff) > EPS) return topDiff;
      return unitVolumeCm3(a) - unitVolumeCm3(b);
    });
}

function lowerGapLateCandidates(container, placed, blueCandidates) {
  const highestBlueBottom = Math.max(...blueCandidates.map((unit) => Number(unit.z || 0)));
  const blueWeights = blueCandidates.map((unit) => Number(unit.weightKg || 0)).filter((weight) => weight > 0);
  const averageBlueWeight = blueWeights.length
    ? blueWeights.reduce((sum, weight) => sum + weight, 0) / blueWeights.length
    : Infinity;

  return placed
    .filter((unit) => {
      if (unit.nonStack || isBlueLikeCargo(unit)) return false;
      if (hasAnyBoxInColumnAbove(unit, placed)) return false;
      if (Number(unit.z || 0) >= highestBlueBottom - LOWER_GAP_SWAP_MIN_DROP_CM) return false;
      if (unit.isHeavy && Number(unit.weightKg || 0) > averageBlueWeight * 1.5) return false;
      if (unitQuantity(unit) > 2) return false;
      return fitsContainerDims(container, unit);
    })
    .sort((a, b) => {
      const zDiff = Number(b.z || 0) - Number(a.z || 0);
      if (Math.abs(zDiff) > EPS) return zDiff;
      return unitVolumeCm3(a) - unitVolumeCm3(b);
    });
}

function buildLowerGapSwapAttempt(container, attempt, strategy, blueMovers, lateMovers) {
  if (!blueMovers.length) return null;
  const originalByKey = new Map(attempt.placed.map((unit) => [unit.unitKey, unit]));
  const lateKeys = new Set(lateMovers.map((unit) => unit.unitKey));
  const removedKeys = new Set([
    ...blueMovers.map((unit) => unit.unitKey),
    ...lateMovers.map((unit) => unit.unitKey)
  ]);
  const placed = attempt.placed
    .filter((unit) => !removedKeys.has(unit.unitKey))
    .map(copyUnit);
  const delayed = [];
  let movedCount = 0;
  let movedDepthCm = 0;

  for (const unit of orderUnits(blueMovers.map(stripPlacement), "small-vertical")) {
    const original = originalByKey.get(unit.unitKey);
    const supportRatio = lowerGapSwapSupportRatio(container, unit);
    const placement = packExtremePoint(container, placed, unit, strategy, { supportRatio });
    if (placement && original && placement.z < Number(original.z || 0) - LOWER_GAP_SWAP_MIN_DROP_CM) {
      placed.push({ ...applyPlacement(unit, placement), supportRatioOverride: supportRatio });
      movedCount += unitQuantity(unit);
      movedDepthCm += (Number(original.z || 0) - placement.z) * unitQuantity(unit);
    } else {
      delayed.push(unit);
    }
  }

  if (!movedCount) return null;

  const unplaced = [];
  const retry = [
    ...orderUnits((attempt.unplaced || []).map(stripPlacement), strategy.unitOrder),
    ...orderUnits(delayed, strategy.unitOrder),
    ...orderUnits(lateMovers.map(stripPlacement), "height")
  ];

  for (const unit of retry) {
    const placement = lateKeys.has(unit.unitKey)
      ? findTopExposedPlacement(container, placed, unit, strategy) || packExtremePoint(container, placed, unit, strategy)
      : packExtremePoint(container, placed, unit, strategy);
    if (placement) {
      placed.push(applyPlacement(unit, placement));
    } else {
      unplaced.push(unit);
    }
  }

  const candidate = makePackedBox(placed, unplaced, {
    id: attempt.strategyId,
    name: attempt.strategyName
  }, {
    ...(attempt.strategySummary || {}),
    lowerGapSwapCount: Number(attempt.strategySummary?.lowerGapSwapCount || 0) + movedCount,
    lowerGapSwapLiftedCount: Number(attempt.strategySummary?.lowerGapSwapLiftedCount || 0) + sumUnitQuantity(lateMovers),
    lowerGapSwapDepthCm: Number(attempt.strategySummary?.lowerGapSwapDepthCm || 0) + movedDepthCm,
    layerCount: countLayers(placed)
  });

  if (!validateAllPlacements(container, candidate.placed)) return null;
  if (sumUnitQuantity(candidate.placed) < sumUnitQuantity(attempt.placed)) return null;
  if (sumUnitQuantity(candidate.unplaced) > sumUnitQuantity(attempt.unplaced || [])) return null;
  return candidate;
}

function isLowerGapSwapBetter(container, candidate, best) {
  const comparison = comparePackAttempt(container)(candidate, best);
  if (comparison < 0) return true;
  if (comparison > 0) return false;
  return Number(candidate.strategySummary?.lowerGapSwapDepthCm || 0) > Number(best.strategySummary?.lowerGapSwapDepthCm || 0) + EPS;
}

function isBlueLikeCargo(unit) {
  const text = `${unit.name || ""} ${unit.baseName || ""} ${unit.model || ""}`.toLowerCase();
  return String(unit.color || "").toLowerCase() === "#3b82f6" || /\bblue\b/.test(text);
}

function optimizeBlueSideRows(container, attempt, strategy) {
  if (!attempt?.placed?.length) return attempt;
  const sourceAttempt = expandAttemptPlacementsForFineTuning(container, attempt);
  let current = cloneAttempt(sourceAttempt);
  let movedTotal = 0;

  for (let pass = 0; pass < 6; pass += 1) {
    const candidate = buildBestBlueSideRowRepack(container, current, strategy);
    if (!candidate) break;
    movedTotal += candidate.movedCount;
    current = makePackedBox(candidate.placed, current.unplaced.map(stripPlacement), {
      id: current.strategyId,
      name: current.strategyName
    }, {
      ...(current.strategySummary || {}),
      blueSideRowRepackCount: Number(current.strategySummary?.blueSideRowRepackCount || 0) + candidate.movedCount,
      layerCount: countLayers(candidate.placed)
    });
  }

  return movedTotal ? current : attempt;
}

function buildBestBlueSideRowRepack(container, attempt, strategy) {
  let best = null;
  for (const row of blueSideRows(container, attempt.placed)) {
    const candidate = buildBlueSideRowCandidate(container, attempt.placed, row, strategy);
    if (!candidate) continue;
    if (!best || candidate.score > best.score + EPS) best = candidate;
  }
  return best;
}

function blueSideRows(container, placed) {
  const groups = new Map();
  for (const unit of placed) {
    if (!isBlueLikeCargo(unit) || unit.nonStack) continue;
    if (Number(unit.lengthCm || 0) <= Number(unit.widthCm || 0) + EPS) continue;
    if (Number(unit.y || 0) + Number(unit.lengthCm || 0) > Number(container.widthCm || 0) + EPS) continue;
    const key = [
      round3(unit.z),
      round3(unit.y),
      round3(unit.lengthCm),
      round3(unit.widthCm),
      round3(unit.heightCm)
    ].join("/");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unit);
  }

  return [...groups.values()]
    .map((units) => {
      const sample = units[0];
      const targetLength = Number(sample.widthCm || 0);
      const targetWidth = Number(sample.lengthCm || 0);
      const minX = Math.min(...units.map((unit) => Number(unit.x || 0)));
      const capacity = Math.floor((Number(container.lengthCm || 0) - minX + EPS) / Math.max(1, targetLength));
      return {
        units: [...units].sort((a, b) => Number(a.x || 0) - Number(b.x || 0)),
        z: Number(sample.z || 0),
        y: Number(sample.y || 0),
        height: Number(sample.heightCm || 0),
        targetLength,
        targetWidth,
        minX,
        capacity,
        extraSlots: capacity - units.length
      };
    })
    .filter((row) =>
      row.units.length >= 3
      && row.extraSlots > 0
      && row.y + row.targetWidth <= Number(container.widthCm || 0) + EPS
      && !hasBlueRowOverlapAfterRotate(row, placed)
    )
    .sort((a, b) => {
      if (b.extraSlots !== a.extraSlots) return b.extraSlots - a.extraSlots;
      if (Math.abs(a.z - b.z) > EPS) return a.z - b.z;
      return b.y - a.y;
    });
}

function hasBlueRowOverlapAfterRotate(row, placed) {
  return placed.some((unit) => {
    if (!isBlueLikeCargo(unit) || unit.nonStack) return false;
    if (row.units.some((rowUnit) => rowUnit.unitKey === unit.unitKey)) return false;
    if (Math.abs(Number(unit.z || 0) - row.z) > EPS) return false;
    if (Number(unit.y || 0) >= row.y + row.targetWidth - EPS) return false;
    if (Number(unit.y || 0) + Number(unit.widthCm || 0) <= row.y + EPS) return false;
    return true;
  });
}

function buildBlueSideRowCandidate(container, placed, row, strategy) {
  const rowKeys = new Set(row.units.map((unit) => unit.unitKey));
  const extras = placed
    .filter((unit) =>
      isBlueLikeCargo(unit)
      && !unit.nonStack
      && !rowKeys.has(unit.unitKey)
      && !hasAnyBoxInColumnAbove(unit, placed)
      && Number(unit.z || 0) > row.z + LOWER_GAP_SWAP_MIN_DROP_CM
      && orientationForDims(unit, row.targetLength, row.targetWidth, row.height)
    )
    .sort((a, b) => {
      const topDiff = (b.z + b.heightCm) - (a.z + a.heightCm);
      if (Math.abs(topDiff) > EPS) return topDiff;
      return Number(a.x || 0) - Number(b.x || 0);
    });
  const extraCandidates = extras.slice(0, row.extraSlots);
  if (!extraCandidates.length) return null;

  const moving = [...row.units, ...extraCandidates];
  const movingKeys = new Set(moving.map((unit) => unit.unitKey));
  const nextPlaced = placed
    .filter((unit) => !movingKeys.has(unit.unitKey))
    .map(copyUnit);
  const supportRatio = lowerGapSwapSupportRatio(container, row.units[0]);
  const moved = [];

  for (let index = 0; index < moving.length; index += 1) {
    const source = moving[index];
    const unit = stripPlacement(source);
    const orientation = orientationForDims(unit, row.targetLength, row.targetWidth, row.height);
    if (!orientation) return null;
    const placement = {
      ...orientation,
      x: round3(row.minX + index * row.targetLength),
      y: round3(row.y),
      z: round3(row.z)
    };
    const validation = validatePlacement(container, nextPlaced, unit, placement, supportRatio);
    if (!validation.valid) {
      if (index >= row.units.length) {
        nextPlaced.push(...moving.slice(index).map(copyUnit));
        break;
      }
      return null;
    }
    nextPlaced.push({ ...applyPlacement(unit, placement), supportRatioOverride: supportRatio });
    if (index >= row.units.length) moved.push(source);
  }

  if (!moved.length) return null;

  const finalValidation = validateAllPlacementsDetailed(container, nextPlaced);
  if (!finalValidation.valid) return null;
  const movedDepth = moved.reduce((sum, unit) => sum + (Number(unit.z || 0) - row.z) * unitQuantity(unit), 0);
  return {
    placed: nextPlaced,
    movedCount: sumUnitQuantity(moved),
    score: sumUnitQuantity(moved) * 100000 + movedDepth - row.z
  };
}

function orientationForDims(unit, lengthCm, widthCm, heightCm) {
  return generateOrientations(unit).find((dims) =>
    Math.abs(Number(dims.lengthCm || 0) - lengthCm) < EPS
    && Math.abs(Number(dims.widthCm || 0) - widthCm) < EPS
    && Math.abs(Number(dims.heightCm || 0) - heightCm) < EPS
  );
}

function lowerGapSwapSupportRatio(container, unit) {
  if (!isBlueLikeCargo(unit)) return supportRatioForUnit(container, unit);
  const ratio = supportRuleSettings(container).supportRatio;
  const overhangBasedSupport = 1 - clampNumber(ratio, 0, 1, DEFAULT_SUPPORT_RATIO);
  return clampNumber(Math.min(ratio, overhangBasedSupport), 0.1, 1, DEFAULT_SUPPORT_RATIO);
}

function validatePlacement(container, placed, unit, placement, supportRatio = DEFAULT_SUPPORT_RATIO) {
  if (!fitsContainerDims(container, placement)) return { valid: false, reason: "out-of-bounds" };
  if (placed.some((box) => intersects(placement, box))) return { valid: false, reason: "intersects" };
  if (!hasSupport(placement, placed, supportRatio)) return { valid: false, reason: "unsupported" };
  if (unit.nonStack && hasAnyBoxInColumnAbove(placement, placed)) return { valid: false, reason: "nonstack-under-load" };
  return { valid: true, reason: "" };
}

function validateAllPlacements(container, placed) {
  return validateAllPlacementsDetailed(container, placed).valid;
}

function validateAllPlacementsDetailed(container, placed) {
  for (let i = 0; i < placed.length; i += 1) {
    const current = placed[i];
    if (!fitsContainerDims(container, current)) return { valid: false, reason: "out-of-bounds", unit: current.unitKey };
    for (let j = i + 1; j < placed.length; j += 1) {
      if (intersects(current, placed[j])) return { valid: false, reason: "intersects", unit: current.unitKey, other: placed[j].unitKey };
    }
    const below = placed.filter((_, index) => index !== i);
    if (!hasSupport(current, below, supportRatioForUnit(container, current))) {
      return { valid: false, reason: "unsupported", unit: current.unitKey, z: current.z, x: current.x, y: current.y };
    }
    if (current.nonStack && hasAnyBoxInColumnAbove(current, below)) return { valid: false, reason: "nonstack-under-load", unit: current.unitKey };
  }
  return { valid: true };
}

function centerPackedLayout(container, attempt, strategy) {
  if (!attempt?.placed?.length) return attempt;
  if (isBalanceExempt(container, attempt.placed)) return attempt;
  const balance = calculateWeightBalance(container, attempt.placed);
  if (!balance.valid) return attempt;
  const bounds = placementBounds(attempt.placed);
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const shiftX = clamp(centerX - balance.center.xCm, -bounds.minX, Number(container.lengthCm || 0) - bounds.maxX);
  const shiftY = clamp(centerY - balance.center.yCm, -bounds.minY, Number(container.widthCm || 0) - bounds.maxY);
  if (Math.abs(shiftX) < EPS && Math.abs(shiftY) < EPS) return attempt;

  const shifted = attempt.placed.map((unit) => ({
    ...unit,
    x: round3(Number(unit.x || 0) + shiftX),
    y: round3(Number(unit.y || 0) + shiftY)
  }));
  if (!validateAllPlacements(container, shifted)) return attempt;

  return makePackedBox(shifted, attempt.unplaced.map(copyUnit), {
    id: attempt.strategyId || strategy.id,
    name: attempt.strategyName || strategy.name
  }, {
    ...(attempt.strategySummary || {}),
    centeredShiftX: shiftX,
    centeredShiftY: shiftY
  });
}

function placementBounds(placed) {
  return placed.reduce((bounds, unit) => ({
    minX: Math.min(bounds.minX, Number(unit.x || 0)),
    minY: Math.min(bounds.minY, Number(unit.y || 0)),
    maxX: Math.max(bounds.maxX, Number(unit.x || 0) + Number(unit.lengthCm || 0)),
    maxY: Math.max(bounds.maxY, Number(unit.y || 0) + Number(unit.widthCm || 0))
  }), { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickLayerSeedIndex(units, container, placed, strategy, options = {}) {
  let bestStackable = -1;
  let bestStackableScore = Infinity;
  let bestNonStack = -1;
  let bestNonStackScore = Infinity;
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    const placement = packExtremePoint(container, placed, unit, strategy, options);
    if (!placement) continue;
    const area = placement.lengthCm * placement.widthCm;
    const score = placement.z * 1_000_000 - area * 100 - placement.heightCm;
    if (unit.nonStack) {
      if (score < bestNonStackScore) {
        bestNonStack = i;
        bestNonStackScore = score;
      }
    } else if (score < bestStackableScore) {
      bestStackable = i;
      bestStackableScore = score;
    }
  }
  return bestStackable >= 0 ? bestStackable : bestNonStack;
}

function orderLayerCandidates(units, layerBottom, layerTop, strategy) {
  return [...units].sort((a, b) => {
    if (a.nonStack !== b.nonStack) return a.nonStack ? 1 : -1;
    if (layerTop == null || !Number.isFinite(Number(layerTop))) {
      return orderUnits([a, b], strategy.unitOrder)[0].unitKey === a.unitKey ? -1 : 1;
    }
    const aCanShare = a.orientations.some((dims) => dims.heightCm <= layerTop - layerBottom + EPS);
    const bCanShare = b.orientations.some((dims) => dims.heightCm <= layerTop - layerBottom + EPS);
    if (aCanShare !== bCanShare) return aCanShare ? -1 : 1;
    return orderUnits([a, b], strategy.unitOrder)[0].unitKey === a.unitKey ? -1 : 1;
  });
}

function extremePoints(container, placed, dims, options = {}) {
  const points = new Map();
  const heightLimit = containerHeightLimit(container);
  const layerBottom = Number(options.layerBottom);
  const hasLayerBottom = Number.isFinite(layerBottom);
  const layerTop = Number(options.layerTop);
  const hasLayerTop = Number.isFinite(layerTop);
  const add = (x, y, z) => {
    const point = { x: round3(x), y: round3(y), z: round3(z) };
    if (point.x < -EPS || point.y < -EPS || point.z < -EPS) return;
    if (point.x + dims.lengthCm > container.lengthCm + EPS) return;
    if (point.y + dims.widthCm > container.widthCm + EPS) return;
    if (point.z + dims.heightCm > heightLimit + EPS) return;
    if (hasLayerBottom && point.z < layerBottom - EPS) return;
    if (hasLayerTop && point.z + dims.heightCm > layerTop + EPS) return;
    points.set(`${point.x}/${point.y}/${point.z}`, point);
  };

  add(0, 0, 0);
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const xAnchors = [0, centerX - dims.lengthCm, centerX - dims.lengthCm / 2, centerX, container.lengthCm - dims.lengthCm];
  const yAnchors = [0, centerY - dims.widthCm, centerY - dims.widthCm / 2, centerY, container.widthCm - dims.widthCm];
  const zAnchors = uniqueSorted(placed.map((box) => box.z + box.heightCm), 0);
  for (const z of zAnchors) {
    for (const x of xAnchors) {
      for (const y of yAnchors) add(x, y, z);
    }
  }
  for (const box of placed) {
    add(box.x - dims.lengthCm, box.y, box.z);
    add(box.x, box.y - dims.widthCm, box.z);
    add(box.x + box.lengthCm, box.y, box.z);
    add(box.x, box.y + box.widthCm, box.z);
    add(box.x, box.y, box.z + box.heightCm);
    add(box.x + box.lengthCm, box.y + box.widthCm, box.z);
    add(box.x + box.lengthCm, box.y, box.z + box.heightCm);
    add(box.x, box.y + box.widthCm, box.z + box.heightCm);
    add(box.x + box.lengthCm, box.y + box.widthCm, box.z + box.heightCm);
  }

  const zs = uniqueSorted(placed.map((box) => box.z + box.heightCm), 0);
  const xs = uniqueSorted(placed.flatMap((box) => [box.x, box.x + box.lengthCm]), 0);
  const ys = uniqueSorted(placed.flatMap((box) => [box.y, box.y + box.widthCm]), 0);
  for (const z of zs) {
    for (const x of xs) add(x, 0, z);
    for (const y of ys) add(0, y, z);
  }
  if (options.denseTop) {
    for (const z of zs) {
      for (const x of xs) {
        for (const y of ys) add(x, y, z);
      }
    }
  }

  return [...points.values()].sort((a, b) => {
    if (Math.abs(a.z - b.z) > EPS) return a.z - b.z;
    if (Math.abs(a.y - b.y) > EPS) return a.y - b.y;
    return a.x - b.x;
  });
}

function hasSupport(placement, placed, supportRatio = DEFAULT_SUPPORT_RATIO) {
  if (placement.z <= EPS) return true;
  const requiredRatio = clampNumber(supportRatio, 0.1, 1, DEFAULT_SUPPORT_RATIO);
  const target = { x: placement.x, y: placement.y, lengthCm: placement.lengthCm, widthCm: placement.widthCm };
  const supports = placed
    .filter((box) => !box.nonStack && Math.abs(box.z + box.heightCm - placement.z) < EPS)
    .map((box) => overlapRect(target, { x: box.x, y: box.y, lengthCm: box.lengthCm, widthCm: box.widthCm }))
    .filter(Boolean);
  if (!supports.length) return false;
  return unionArea(supports) + EPS >= placement.lengthCm * placement.widthCm * requiredRatio;
}

function hasAnyBoxAbove(unit, placed) {
  const top = unit.z + unit.heightCm;
  return placed.some((box) =>
    Math.abs(box.z - top) < EPS
    && overlapRect(
      { x: unit.x, y: unit.y, lengthCm: unit.lengthCm, widthCm: unit.widthCm },
      { x: box.x, y: box.y, lengthCm: box.lengthCm, widthCm: box.widthCm }
    )
  );
}

function hasAnyBoxInColumnAbove(unit, placed) {
  const top = unit.z + unit.heightCm;
  return placed.some((box) =>
    box.z >= top - EPS
    && overlapRect(
      { x: unit.x, y: unit.y, lengthCm: unit.lengthCm, widthCm: unit.widthCm },
      { x: box.x, y: box.y, lengthCm: box.lengthCm, widthCm: box.widthCm }
    )
  );
}

function makePackedBox(placed, unplaced, strategy, stats) {
  return {
    placed,
    unplaced,
    strategyId: strategy.id,
    strategyName: strategy.name,
    strategySummary: {
      placedCount: sumUnitQuantity(placed),
      unplacedCount: sumUnitQuantity(unplaced),
      solverPlacedCount: placed.length,
      solverUnplacedCount: unplaced.length,
      occupiedVolumeM3: round(sumOccupiedVolumeM3(placed)),
      maxTopCm: round(maxTop(placed)),
      refillPlacedCount: Number(stats.repairedCount || 0),
      refillPasses: Number(stats.localSearchPasses || 0),
      blockDowngradePasses: Number(stats.blockDowngradePasses || 0),
      blockDowngradePlacedCount: Number(stats.blockDowngradePlacedCount || 0),
      singleBackfillPlacedCount: Number(stats.singleBackfillPlacedCount || 0),
      nonStackTopPlacedCount: Number(stats.nonStackTopPlacedCount || 0),
      blueSideRowRepackCount: Number(stats.blueSideRowRepackCount || 0),
      lowerGapSwapCount: Number(stats.lowerGapSwapCount || 0),
      lowerGapSwapLiftedCount: Number(stats.lowerGapSwapLiftedCount || 0),
      lowerGapSwapDepthCm: round(stats.lowerGapSwapDepthCm || 0),
      layerCount: Number(stats.layerCount || countLayers(placed)),
      balanceSeverity: stats.balanceValidation?.severity || "",
      balanceScore: round(stats.balanceValidation?.score || 0),
      balanceRejectedCount: Number(stats.balanceRejectedCount || 0)
    }
  };
}

function chooseRemovalSet(placed, unplaced, size, pass) {
  const unplacedCargoIds = new Set(unplaced.map((unit) => unit.cargoId));
  const ordered = [...placed].sort((a, b) => {
    const aRelated = unplacedCargoIds.has(a.cargoId) ? 0 : 1;
    const bRelated = unplacedCargoIds.has(b.cargoId) ? 0 : 1;
    if (aRelated !== bRelated) return aRelated - bRelated;
    if (pass % 2 === 0) return (b.z + b.heightCm) - (a.z + a.heightCm);
    return a.x - b.x || a.y - b.y || b.z - a.z;
  });
  return new Set(ordered.slice(0, size).map((unit) => unit.unitKey));
}

function orderUnits(units, strategyId) {
  return [...units].sort((a, b) => {
    if (a.nonStack !== b.nonStack) return a.nonStack ? 1 : -1;
    if (strategyId === "small-vertical") {
      const smallDiff = smallItemRank(a) - smallItemRank(b);
      if (smallDiff) return smallDiff;
    }
    if (strategyId === "height") {
      const heightDiff = tallestOrientation(b) - tallestOrientation(a);
      if (Math.abs(heightDiff) > EPS) return heightDiff;
    }
    if (strategyId === "footprint") {
      const areaDiff = maxFootprint(b) - maxFootprint(a);
      if (Math.abs(areaDiff) > EPS) return areaDiff;
      const volumeDiff = unitVolumeCm3(b) - unitVolumeCm3(a);
      if (Math.abs(volumeDiff) > EPS) return volumeDiff;
      const weightDiff = Number(b.weightKg || 0) - Number(a.weightKg || 0);
      if (Math.abs(weightDiff) > EPS) return weightDiff;
      if (a.cargoIndex !== b.cargoIndex) return a.cargoIndex - b.cargoIndex;
      return a.itemIndex - b.itemIndex;
    }
    const weightDiff = Number(b.weightKg || 0) - Number(a.weightKg || 0);
    if (Math.abs(weightDiff) > EPS) return weightDiff;
    const areaDiff = maxFootprint(b) - maxFootprint(a);
    if (Math.abs(areaDiff) > EPS) return areaDiff;
    const volumeDiff = unitVolumeCm3(b) - unitVolumeCm3(a);
    if (Math.abs(volumeDiff) > EPS) return volumeDiff;
    if (a.cargoIndex !== b.cargoIndex) return a.cargoIndex - b.cargoIndex;
    return a.itemIndex - b.itemIndex;
  });
}

function comparePackAttempt(container) {
  return (a, b) => {
    const balanceRankDiff = balanceSeverityRank(a.balanceValidation) - balanceSeverityRank(b.balanceValidation);
    if (balanceRankDiff) return balanceRankDiff;
    const balanceScoreDiff = Number(a.balanceValidation?.score || 0) - Number(b.balanceValidation?.score || 0);
    if (Math.abs(balanceScoreDiff) > EPS) return balanceScoreDiff;
    const occupiedDiff = sumOccupiedVolumeM3(b.placed) - sumOccupiedVolumeM3(a.placed);
    if (Math.abs(occupiedDiff) > EPS) return occupiedDiff;
    const rawVolumeDiff = sumCargoVolumeM3(b.placed) - sumCargoVolumeM3(a.placed);
    if (Math.abs(rawVolumeDiff) > EPS) return rawVolumeDiff;
    const aPlacedCount = sumUnitQuantity(a.placed);
    const bPlacedCount = sumUnitQuantity(b.placed);
    if (aPlacedCount !== bPlacedCount) return bPlacedCount - aPlacedCount;
    const supportDiff = supportSurfaceScore(b.placed, container) - supportSurfaceScore(a.placed, container);
    if (Math.abs(supportDiff) > EPS) return supportDiff;
    const topDiff = maxTop(a.placed) - maxTop(b.placed);
    if (Math.abs(topDiff) > EPS) return topDiff;
    return a.unplaced.length - b.unplaced.length;
  };
}

function withBalanceValidation(container, attempt, rejectedByBalance = 0) {
  const validation = validateWeightBalance(container, attempt.placed);
  attempt.balanceValidation = validation;
  attempt.strategySummary = {
    ...attempt.strategySummary,
    balanceSeverity: validation.severity,
    balanceScore: round(validation.score),
    balanceRejected: validation.severity === "red",
    balanceRejectedCount: rejectedByBalance
  };
  return attempt;
}

function projectedBalancePenalty(container, placed, unit, placement) {
  if (isProjectedBalanceExempt(container, placed, unit)) return 0;
  const candidate = {
    ...unit,
    x: placement.x,
    y: placement.y,
    z: placement.z,
    lengthCm: placement.lengthCm,
    widthCm: placement.widthCm,
    heightCm: placement.heightCm
  };
  const validation = validateWeightBalance(container, [...placed, candidate]);
  const rules = balanceRuleSettings(container);
  const isEarlySpread = placed.length < Math.min(3, BALANCE_ZONE_ORDER.length - 1);
  const severityPenalty = isEarlySpread ? 0 : validation.severity === "red" ? 3 : validation.severity === "yellow" ? 1 : 0;
  const weight = isEarlySpread ? EARLY_BALANCE_SCORE_WEIGHT : BALANCE_SCORE_WEIGHT;
  return (validation.score + severityPenalty * rules.redLimitPercent) * weight;
}

function validateWeightBalance(container, placed) {
  const balance = calculateWeightBalance(container, placed);
  if (!balance.valid) return balance;
  const rules = balanceRuleSettings(container);
  const lightLoadSearchMode = balance.totalWeightKg <= rules.skipBelowWeightKg + EPS;
  if (lightLoadSearchMode) {
    return {
      ...balance,
      severity: "exempt",
      score: 0,
      balanceExempt: true,
      message: `单箱总重 ${round(balance.totalWeightKg / 1000)}t 低于轻载不拦截阈值 ${round(rules.skipBelowWeightKg / 1000)}t，按业务设置跳过偏载拦截，优先装满。`,
      limits: {
        greenPercent: rules.greenLimitPercent,
        redPercent: rules.redLimitPercent,
        frontMaxPercent: rules.frontMaxPercent,
        rearMinPercent40FR: null,
        lateralOffsetLimitCm: rules.lateralOffsetLimitCm,
        skipBelowWeightKg: rules.skipBelowWeightKg
      },
      checks: {
        frontPercent: round(balance.loads.frontPercent),
        rearPercent: round(balance.loads.rearPercent),
        frontRearDiffPercent: round(Math.abs(balance.loads.frontPercent - balance.loads.rearPercent)),
        leftRightDiffPercent: round(Math.abs(balance.loads.leftPercent - balance.loads.rightPercent)),
        longitudinalOffsetPercent: round(Math.abs(balance.offset.longitudinalPercent)),
        lateralOffsetPercent: round(Math.abs(balance.offset.lateralPercent)),
        lateralOffsetCm: round(Math.abs(balance.offset.lateralCm)),
        requiresRearMinimum: false,
        lightLoadSearchMode: true
      }
    };
  }

  const frontRearDiffPercent = Math.abs(balance.loads.frontPercent - balance.loads.rearPercent);
  const leftRightDiffPercent = Math.abs(balance.loads.leftPercent - balance.loads.rightPercent);
  const longitudinalOffsetPercent = Math.abs(balance.offset.longitudinalPercent);
  const lateralOffsetPercent = Math.abs(balance.offset.lateralPercent);
  const lateralOffsetCm = Math.abs(balance.offset.lateralCm);
  const requiresRearMinimum = isFortyFootFlatRack(container);
  const frontMaxExcess = Math.max(0, balance.loads.frontPercent - rules.frontMaxPercent);
  const rearMinExcess = requiresRearMinimum ? Math.max(0, rules.rearMinPercent40FR - balance.loads.rearPercent) : 0;
  const frontRearExcess = Math.max(0, frontRearDiffPercent - rules.redLimitPercent);
  const leftRightExcess = Math.max(0, leftRightDiffPercent - rules.redLimitPercent);
  const longitudinalExcess = Math.max(0, longitudinalOffsetPercent - rules.redLimitPercent);
  const lateralPercentExcess = Math.max(0, lateralOffsetPercent - rules.redLimitPercent);
  const lateralCmExcess = Math.max(0, lateralOffsetCm - rules.lateralOffsetLimitCm);
  const red = frontMaxExcess > EPS
    || rearMinExcess > EPS
    || frontRearExcess > EPS
    || leftRightExcess > EPS
    || longitudinalExcess > EPS
    || lateralPercentExcess > EPS
    || lateralCmExcess > EPS;
  const warningScore = Math.max(
    frontRearDiffPercent,
    leftRightDiffPercent,
    longitudinalOffsetPercent,
    lateralOffsetPercent,
    lateralOffsetCm / rules.lateralOffsetLimitCm * rules.redLimitPercent
  );
  const yellow = !red && (
    warningScore > rules.greenLimitPercent + EPS
    || balance.loads.frontPercent > rules.frontMaxPercent - rules.greenLimitPercent
    || (requiresRearMinimum && balance.loads.rearPercent < rules.rearMinPercent40FR + rules.greenLimitPercent)
  );
  const hardExcessScore = frontMaxExcess + rearMinExcess + frontRearExcess + leftRightExcess
    + longitudinalExcess + lateralPercentExcess + lateralCmExcess / rules.lateralOffsetLimitCm * rules.redLimitPercent;

  return {
    ...balance,
    severity: red ? "red" : yellow ? "yellow" : "green",
    score: warningScore + hardExcessScore * 20,
    limits: {
      greenPercent: rules.greenLimitPercent,
      redPercent: rules.redLimitPercent,
      frontMaxPercent: rules.frontMaxPercent,
      rearMinPercent40FR: requiresRearMinimum ? rules.rearMinPercent40FR : null,
      lateralOffsetLimitCm: rules.lateralOffsetLimitCm,
      skipBelowWeightKg: rules.skipBelowWeightKg
    },
    checks: {
      frontPercent: round(balance.loads.frontPercent),
      rearPercent: round(balance.loads.rearPercent),
      frontRearDiffPercent: round(frontRearDiffPercent),
      leftRightDiffPercent: round(leftRightDiffPercent),
      longitudinalOffsetPercent: round(longitudinalOffsetPercent),
      lateralOffsetPercent: round(lateralOffsetPercent),
      lateralOffsetCm: round(lateralOffsetCm),
      requiresRearMinimum,
      lightLoadSearchMode
    }
  };
}

function calculateWeightBalance(container, placed) {
  const lengthCm = Number(container?.lengthCm || 0);
  const widthCm = Number(container?.widthCm || 0);
  const heightCm = Number(container?.heightCm || 0);
  const centerX = lengthCm / 2;
  const centerY = widthCm / 2;
  const centerZ = heightCm / 2;
  let totalWeightKg = 0;
  let weightedX = 0;
  let weightedY = 0;
  let weightedZ = 0;
  const loads = {
    frontLeftKg: 0,
    frontRightKg: 0,
    rearLeftKg: 0,
    rearRightKg: 0
  };

  for (const item of placed || []) {
    const weightKg = Math.max(0, Number(item.weightKg || 0));
    if (!weightKg) continue;
    const x = Number(item.x || 0);
    const y = Number(item.y || 0);
    const z = Number(item.z || 0);
    const itemLength = Math.max(0, Number(item.lengthCm || 0));
    const itemWidth = Math.max(0, Number(item.widthCm || 0));
    const itemHeight = Math.max(0, Number(item.heightCm || 0));
    totalWeightKg += weightKg;
    weightedX += (x + itemLength / 2) * weightKg;
    weightedY += (y + itemWidth / 2) * weightKg;
    weightedZ += (z + itemHeight / 2) * weightKg;
    addSplitLoads(loads, weightKg, x, y, itemLength, itemWidth, centerX, centerY);
  }

  if (!totalWeightKg) return emptyWeightBalance(container);

  const xCm = weightedX / totalWeightKg;
  const yCm = weightedY / totalWeightKg;
  const zCm = weightedZ / totalWeightKg;
  const frontKg = loads.frontLeftKg + loads.frontRightKg;
  const rearKg = loads.rearLeftKg + loads.rearRightKg;
  const leftKg = loads.frontLeftKg + loads.rearLeftKg;
  const rightKg = loads.frontRightKg + loads.rearRightKg;
  const offsetXCm = xCm - centerX;
  const offsetYCm = yCm - centerY;
  const offsetZCm = zCm - centerZ;

  return {
    valid: true,
    totalWeightKg,
    center: { xCm, yCm, zCm },
    geometricCenter: { xCm: centerX, yCm: centerY, zCm: centerZ },
    offset: {
      xCm: offsetXCm,
      yCm: offsetYCm,
      zCm: offsetZCm,
      longitudinalCm: offsetXCm,
      lateralCm: offsetYCm,
      horizontalCm: Math.hypot(offsetXCm, offsetYCm),
      horizontalPercent: Math.hypot(
        centerX ? offsetXCm / centerX : 0,
        centerY ? offsetYCm / centerY : 0
      ) * 100,
      xPercent: centerX ? offsetXCm / centerX * 100 : 0,
      yPercent: centerY ? offsetYCm / centerY * 100 : 0,
      zPercent: centerZ ? offsetZCm / centerZ * 100 : 0,
      longitudinalPercent: centerX ? offsetXCm / centerX * 100 : 0,
      lateralPercent: centerY ? offsetYCm / centerY * 100 : 0
    },
    loads: {
      frontKg,
      rearKg,
      leftKg,
      rightKg,
      frontPercent: frontKg / totalWeightKg * 100,
      rearPercent: rearKg / totalWeightKg * 100,
      leftPercent: leftKg / totalWeightKg * 100,
      rightPercent: rightKg / totalWeightKg * 100,
      ...loads,
      frontLeftPercent: loads.frontLeftKg / totalWeightKg * 100,
      frontRightPercent: loads.frontRightKg / totalWeightKg * 100,
      rearLeftPercent: loads.rearLeftKg / totalWeightKg * 100,
      rearRightPercent: loads.rearRightKg / totalWeightKg * 100
    }
  };
}

function addSplitLoads(loads, weightKg, x, y, lengthCm, widthCm, centerX, centerY) {
  const area = Math.max(EPS, lengthCm * widthCm);
  const frontLength = overlapLength(x, x + lengthCm, 0, centerX);
  const rearLength = overlapLength(x, x + lengthCm, centerX, centerX * 2);
  const leftWidth = overlapLength(y, y + widthCm, 0, centerY);
  const rightWidth = overlapLength(y, y + widthCm, centerY, centerY * 2);
  const portions = [
    ["frontLeftKg", frontLength * leftWidth],
    ["frontRightKg", frontLength * rightWidth],
    ["rearLeftKg", rearLength * leftWidth],
    ["rearRightKg", rearLength * rightWidth]
  ];
  const covered = portions.reduce((sum, [, value]) => sum + value, 0);
  if (covered <= EPS) {
    const front = x + lengthCm / 2 <= centerX ? "front" : "rear";
    const side = y + widthCm / 2 <= centerY ? "LeftKg" : "RightKg";
    loads[`${front}${side}`] += weightKg;
    return;
  }
  portions.forEach(([key, value]) => {
    loads[key] += weightKg * value / area;
  });
}

function overlapLength(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function emptyWeightBalance(container) {
  const centerX = Number(container?.lengthCm || 0) / 2;
  const centerY = Number(container?.widthCm || 0) / 2;
  const centerZ = Number(container?.heightCm || 0) / 2;
  return {
    valid: false,
    severity: "green",
    score: 0,
    totalWeightKg: 0,
    center: { xCm: centerX, yCm: centerY, zCm: centerZ },
    geometricCenter: { xCm: centerX, yCm: centerY, zCm: centerZ },
    offset: {
      xCm: 0,
      yCm: 0,
      zCm: 0,
      longitudinalCm: 0,
      lateralCm: 0,
      horizontalCm: 0,
      horizontalPercent: 0,
      xPercent: 0,
      yPercent: 0,
      zPercent: 0,
      longitudinalPercent: 0,
      lateralPercent: 0
    },
    loads: {
      frontKg: 0,
      rearKg: 0,
      leftKg: 0,
      rightKg: 0,
      frontPercent: 0,
      rearPercent: 0,
      leftPercent: 0,
      rightPercent: 0,
      frontLeftKg: 0,
      frontRightKg: 0,
      rearLeftKg: 0,
      rearRightKg: 0,
      frontLeftPercent: 0,
      frontRightPercent: 0,
      rearLeftPercent: 0,
      rearRightPercent: 0
    }
  };
}

function balanceSeverityRank(validation) {
  if (!validation?.valid) return 0;
  if (validation.severity === "green") return 0;
  if (validation.severity === "yellow") return 1;
  return 2;
}

function isFortyFootFlatRack(container) {
  const text = `${container?.name || ""} ${container?.id || ""}`.toLowerCase();
  return /40\s*fr|40fr|flat\s*rack|flatrack|flat|平板/.test(text);
}

function isHeightUnlimited(container) {
  return container?.ignoreHeightLimit === true;
}

function containerHeightLimit(container) {
  return isHeightUnlimited(container) ? Number.POSITIVE_INFINITY : Number(container?.heightCm || 0);
}

function placedWeightKg(placed = []) {
  return placed.reduce((sum, unit) => sum + Math.max(0, Number(unit.weightKg || 0)), 0);
}

function isProjectedBalanceExempt(container, placed = [], unit = null) {
  const rules = balanceRuleSettings(container);
  const projectedWeight = placedWeightKg(placed) + Math.max(0, Number(unit?.weightKg || 0));
  return projectedWeight <= rules.skipBelowWeightKg + EPS;
}

function isBalanceExempt(container, placed = []) {
  const rules = balanceRuleSettings(container);
  return placedWeightKg(placed) <= rules.skipBelowWeightKg + EPS;
}

function zoneSpreadPenalty(container, placed, placement, unit = null) {
  if (!placed.length || (unit?.isHeavy && placed.length < 3)) {
    return centerDistancePenalty(container, placement);
  }
  const zone = weakestBalanceZone(container, placed);
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const targetX = zone.startsWith("front")
    ? centerX - placement.lengthCm / 2
    : centerX + placement.lengthCm / 2;
  const targetY = zone.endsWith("Left")
    ? centerY - placement.widthCm / 2
    : centerY + placement.widthCm / 2;
  const unitCenterX = placement.x + placement.lengthCm / 2;
  const unitCenterY = placement.y + placement.widthCm / 2;
  return Math.abs(unitCenterX - targetX) + Math.abs(unitCenterY - targetY);
}

function centerDistancePenalty(container, placement) {
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const unitCenterX = placement.x + placement.lengthCm / 2;
  const unitCenterY = placement.y + placement.widthCm / 2;
  return Math.abs(unitCenterX - centerX) + Math.abs(unitCenterY - centerY);
}

function weakestBalanceZone(container, placed) {
  const balance = calculateWeightBalance(container, placed);
  if (!balance.valid) return BALANCE_ZONE_ORDER[0];
  const loads = {
    frontLeft: balance.loads.frontLeftKg,
    frontRight: balance.loads.frontRightKg,
    rearLeft: balance.loads.rearLeftKg,
    rearRight: balance.loads.rearRightKg
  };
  return BALANCE_ZONE_ORDER.reduce((best, zone) => (loads[zone] < loads[best] - EPS ? zone : best), BALANCE_ZONE_ORDER[0]);
}

function placementScore(placement, unit, container, strategy, placed = []) {
  const top = placement.z + placement.heightCm;
  const front = placement.x + placement.lengthCm;
  const right = placement.y + placement.widthCm;
  const area = placement.lengthCm * placement.widthCm;
  const supportBonus = unit.nonStack ? 0 : area * Math.max(0, 1 - top / Math.max(1, container.heightCm));
  const verticalPenalty = strategy.blueVertical && shouldPreferVertical(unit) ? -placement.heightCm * 100 : 0;
  const balanceExempt = isProjectedBalanceExempt(container, placed, unit);
  const balancePenalty = balanceExempt ? 0 : projectedBalancePenalty(container, placed, unit, placement);
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const unitCenterX = placement.x + placement.lengthCm / 2;
  const unitCenterY = placement.y + placement.widthCm / 2;
  const centerDistance = Math.abs(unitCenterX - centerX) + Math.abs(unitCenterY - centerY);
  const heavyCenterPenalty = balanceExempt ? 0 : unit.isHeavy ? centerDistance * HEAVY_CENTER_WEIGHT : centerDistance * 12;
  const spreadPenalty = balanceExempt ? 0 : zoneSpreadPenalty(container, placed, placement, unit) * (unit.isHeavy ? HEAVY_ZONE_WEIGHT : LIGHT_ZONE_WEIGHT);
  return top * 1_000_000 + balancePenalty + spreadPenalty + front * 1_000 + right + heavyCenterPenalty - supportBonus + verticalPenalty;
}

function supportSurfaceScore(placed, container) {
  return placed
    .filter((unit) => !unit.nonStack)
    .reduce((score, unit) => {
      const top = unit.z + unit.heightCm;
      const normalizedHeight = container.heightCm > 0 ? 1 - top / container.heightCm : 0;
      return score + unit.lengthCm * unit.widthCm * Math.max(0, normalizedHeight);
    }, 0);
}

function applyPlacement(unit, placement) {
  return {
    ...stripPlacement(unit),
    x: placement.x,
    y: placement.y,
    z: placement.z,
    lengthCm: placement.lengthCm,
    widthCm: placement.widthCm,
    heightCm: placement.heightCm,
    lengthAxis: placement.lengthAxis,
    widthAxis: placement.widthAxis,
    heightAxis: placement.heightAxis
  };
}

function stripPlacement(unit) {
  const copy = { ...unit, x: 0, y: 0, z: 0 };
  copy.lengthCm = Number(copy.packedLengthCm || (Number(copy.baseLengthCm) + Number(copy.gapCm || 0)));
  copy.widthCm = Number(copy.packedWidthCm || (Number(copy.baseWidthCm) + Number(copy.gapCm || 0)));
  copy.heightCm = Number(copy.packedHeightCm || (Number(copy.baseHeightCm) + Number(copy.verticalGapCm || 0)));
  copy.lengthAxis = "长";
  copy.widthAxis = "宽";
  copy.heightAxis = "高";
  copy.orientations = generateOrientations(copy);
  return copy;
}

function cloneAttempt(attempt) {
  return makePackedBox(
    attempt.placed.map(copyUnit),
    attempt.unplaced.map(copyUnit),
    { id: attempt.strategyId, name: attempt.strategyName },
    attempt.strategySummary || {}
  );
}

function fitsContainerDims(container, dims) {
  const heightLimit = containerHeightLimit(container);
  return dims.lengthCm <= container.lengthCm + EPS
    && dims.widthCm <= container.widthCm + EPS
    && dims.heightCm <= heightLimit + EPS
    && Number(dims.x || 0) >= -EPS
    && Number(dims.y || 0) >= -EPS
    && Number(dims.z || 0) >= -EPS
    && Number(dims.x || 0) + dims.lengthCm <= container.lengthCm + EPS
    && Number(dims.y || 0) + dims.widthCm <= container.widthCm + EPS
    && Number(dims.z || 0) + dims.heightCm <= heightLimit + EPS;
}

function intersects(a, b) {
  return a.x < b.x + b.lengthCm - EPS && a.x + a.lengthCm > b.x + EPS
    && a.y < b.y + b.widthCm - EPS && a.y + a.widthCm > b.y + EPS
    && a.z < b.z + b.heightCm - EPS && a.z + a.heightCm > b.z + EPS;
}

function overlapRect(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.lengthCm, b.x + b.lengthCm);
  const y2 = Math.min(a.y + a.widthCm, b.y + b.widthCm);
  if (x2 <= x1 + EPS || y2 <= y1 + EPS) return null;
  return { x: x1, y: y1, lengthCm: x2 - x1, widthCm: y2 - y1 };
}

function unionArea(rects) {
  const xs = uniqueSorted(rects.flatMap((rect) => [rect.x, rect.x + rect.lengthCm]), Number.NaN)
    .filter((value) => !Number.isNaN(value));
  let area = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x1 = xs[i];
    const x2 = xs[i + 1];
    const width = x2 - x1;
    if (width <= EPS) continue;
    const spans = rects
      .filter((rect) => rect.x < x2 - EPS && rect.x + rect.lengthCm > x1 + EPS)
      .map((rect) => [rect.y, rect.y + rect.widthCm])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let start = null;
    let end = 0;
    for (const span of spans) {
      if (start === null) {
        start = span[0];
        end = span[1];
      } else if (span[0] <= end + EPS) {
        end = Math.max(end, span[1]);
      } else {
        covered += end - start;
        start = span[0];
        end = span[1];
      }
    }
    if (start !== null) covered += end - start;
    area += width * covered;
  }
  return area;
}

function countLayers(placed) {
  return uniqueSorted(placed.map((unit) => unit.z), Number.NaN).filter((value) => !Number.isNaN(value)).length;
}

function maxFootprint(unit) {
  return Math.max(...generateOrientations(unit).map((dims) => dims.lengthCm * dims.widthCm));
}

function tallestOrientation(unit) {
  return Math.max(...generateOrientations(unit).map((dims) => dims.heightCm));
}

function smallItemRank(unit) {
  const isBlue = String(unit.color || "").toLowerCase() === "#3b82f6" || /蓝|blue/i.test(String(unit.name || ""));
  const volume = unitVolumeCm3(unit);
  return (isBlue ? 0 : 1000000000) + volume;
}

function shouldPreferVertical(unit) {
  const isBlue = String(unit.color || "").toLowerCase() === "#3b82f6" || /蓝|blue/i.test(String(unit.name || ""));
  const longest = Math.max(unit.lengthCm, unit.widthCm, unit.heightCm);
  const shortest = Math.min(unit.lengthCm, unit.widthCm, unit.heightCm);
  return isBlue || longest / Math.max(1, shortest) >= 1.8 || unitVolumeCm3(unit) < 120000;
}

function unitVolumeCm3(unit) {
  return Number(unit.lengthCm || 0) * Number(unit.widthCm || 0) * Number(unit.heightCm || 0);
}

function sumOccupiedVolumeM3(units) {
  return units.reduce((sum, unit) => sum + occupiedVolumeM3(unit), 0);
}

function sumCargoVolumeM3(units) {
  return units.reduce((sum, unit) => sum + cargoVolumeM3(unit), 0);
}

function cargoVolumeM3(unit) {
  const explicit = Number(unit?.volumeM3);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const quantity = unitQuantity(unit);
  const length = Number(unit?.baseLengthCm || unit?.lengthCm || 0);
  const width = Number(unit?.baseWidthCm || unit?.widthCm || 0);
  const height = Number(unit?.baseHeightCm || unit?.heightCm || 0);
  return length * width * height * quantity / 1_000_000;
}

function singleRawLengthCm(unit) {
  const cols = Math.max(1, Math.floor(Number(unit?.groupCols || 1)));
  const value = Number(unit?.baseLengthCm || 0) / cols;
  if (Number.isFinite(value) && value > 0) return value;
  return Math.max(0, Number(unit?.packedLengthCm || unit?.lengthCm || 0) / cols - Number(unit?.gapCm || 0));
}

function singleRawWidthCm(unit) {
  const rows = Math.max(1, Math.floor(Number(unit?.groupRows || 1)));
  const value = Number(unit?.baseWidthCm || 0) / rows;
  if (Number.isFinite(value) && value > 0) return value;
  return Math.max(0, Number(unit?.packedWidthCm || unit?.widthCm || 0) / rows - Number(unit?.gapCm || 0));
}

function singleRawHeightCm(unit) {
  const value = Number(unit?.baseHeightCm || 0);
  if (Number.isFinite(value) && value > 0) return value;
  return Math.max(0, Number(unit?.packedHeightCm || unit?.heightCm || 0) - Number(unit?.verticalGapCm || unit?.extraGapCm || 0));
}

function singleWeightKg(unit) {
  return Number(unit?.weightKg || 0) / unitQuantity(unit);
}

function singleVolumeM3(unit) {
  return cargoVolumeM3(unit) / unitQuantity(unit);
}

function usageMetricsForPackedBoxes(container, packedBoxes, utilizationPercent) {
  const boxes = Array.isArray(packedBoxes) ? packedBoxes : [];
  const firstBox = boxes[0] || { placed: [], container };
  const firstContainer = firstBox.container || container;
  const modes = new Set(boxes.map((box) => usageMode(box.container || container)));
  const mode = modes.size === 1 ? [...modes][0] : "mixed";
  const firstUsed = usageUsedCapacity(firstContainer, firstBox.placed || []);
  const firstCapacity = usageCapacity(firstContainer, utilizationPercent);
  const totals = boxes.reduce((acc, box) => {
    const boxContainer = box.container || container;
    acc.used += usageUsedCapacity(boxContainer, box.placed || []);
    acc.capacity += usageCapacity(boxContainer, utilizationPercent);
    if (usageMode(boxContainer) === "deck") {
      acc.deckUsed += placementDeckAreaM2(box.placed || []);
      acc.deckCapacity += deckAreaM2(boxContainer) * utilizationPercent / 100;
    }
    return acc;
  }, { used: 0, capacity: 0, deckUsed: 0, deckCapacity: 0 });

  return {
    mode,
    firstFillPercent: firstCapacity > 0 ? firstUsed / firstCapacity * 100 : 0,
    averageFillPercent: totals.capacity > 0 ? totals.used / totals.capacity * 100 : 0,
    firstDeckAreaPercent: deckAreaPercent(firstContainer, firstBox.placed || [], utilizationPercent),
    firstLengthPercent: lengthUtilizationPercent(firstContainer, firstBox.placed || []),
    averageDeckAreaPercent: totals.deckCapacity > 0 ? totals.deckUsed / totals.deckCapacity * 100 : 0
  };
}

function averageUsagePercentForBoxCount(container, packedBoxes, utilizationPercent, boxes, total) {
  const boxCount = Math.max(1, Number(boxes || 1));
  if (usageMode(container) === "volume") {
    const capacity = usageCapacity(container, utilizationPercent) * boxCount;
    return capacity > 0 ? Number(total?.totalRawVolumeM3 || 0) / capacity * 100 : 0;
  }
  const detailedUsed = (packedBoxes || []).reduce((sum, box) => sum + usageUsedCapacity(box.container || container, box.placed || []), 0);
  const detailedCapacity = (packedBoxes || []).reduce((sum, box) => sum + usageCapacity(box.container || container, utilizationPercent), 0);
  return detailedCapacity > 0 ? detailedUsed / detailedCapacity * 100 : 0;
}

function usageMode(container) {
  return isFlatRackUsage(container) ? "deck" : "volume";
}

function isFlatRackUsage(container = {}) {
  return isHeightUnlimited(container) || equipmentMeta(container).equipmentClass === "FR";
}

function usageCapacity(container, utilizationPercent) {
  if (isFlatRackUsage(container)) return deckAreaM2(container) * utilizationPercent / 100;
  return volumeM3(container) * utilizationPercent / 100;
}

function usageUsedCapacity(container, placed) {
  if (isFlatRackUsage(container)) return placementDeckAreaM2(placed);
  return sumCargoVolumeM3(placed);
}

function deckAreaM2(container) {
  return Number(container?.lengthCm || 0) * Number(container?.widthCm || 0) / 10_000;
}

function placementDeckAreaM2(placed) {
  const rects = (placed || []).map((unit) => ({
    x: Number(unit.x || 0),
    y: Number(unit.y || 0),
    lengthCm: Number(unit.lengthCm || 0),
    widthCm: Number(unit.widthCm || 0)
  })).filter((rect) => rect.lengthCm > EPS && rect.widthCm > EPS);
  return unionArea(rects) / 10_000;
}

function deckAreaPercent(container, placed, utilizationPercent) {
  const capacity = deckAreaM2(container) * utilizationPercent / 100;
  return capacity > 0 ? placementDeckAreaM2(placed) / capacity * 100 : 0;
}

function lengthUtilizationPercent(container, placed) {
  if (!isFlatRackUsage(container) || !placed?.length || Number(container?.lengthCm || 0) <= 0) return 0;
  const minX = Math.min(...placed.map((unit) => Number(unit.x || 0)));
  const maxX = Math.max(...placed.map((unit) => Number(unit.x || 0) + Number(unit.lengthCm || 0)));
  return Math.max(0, maxX - minX) / Number(container.lengthCm) * 100;
}

function maxTop(units) {
  return units.length ? Math.max(...units.map((unit) => Number(unit.z || 0) + Number(unit.heightCm || 0))) : 0;
}

function totals(cargos) {
  return cargos.reduce((acc, cargo) => {
    acc.totalQuantity += Math.max(0, Math.floor(Number(cargo.quantity || 0)));
    acc.totalRawVolumeM3 += Number(cargo.lengthCm) * Number(cargo.widthCm) * Number(cargo.heightCm) * Number(cargo.quantity || 0) / 1_000_000;
    acc.totalWeightKg += Number(cargo.weightKg || 0) * Number(cargo.quantity || 0);
    return acc;
  }, { totalQuantity: 0, totalRawVolumeM3: 0, totalWeightKg: 0 });
}

function cargoDisplayName(cargo) {
  const name = String(cargo.name || "").trim() || "未命名货物";
  const model = String(cargo.model || "").trim();
  return model ? `${name} ${model}` : name;
}

function compareEvaluation(a, b) {
  const scoreDiff = recommendationScoreValue(a) - recommendationScoreValue(b);
  if (Math.abs(scoreDiff) > EPS) return scoreDiff;
  const statusDiff = fitStatusRank(a.fitStatus) - fitStatusRank(b.fitStatus);
  if (statusDiff) return statusDiff;
  const costDiff = estimatedFreightCost(a) - estimatedFreightCost(b);
  if (Math.abs(costDiff) > EPS) return costDiff;
  const boxDiff = normalizedBoxCount(a) - normalizedBoxCount(b);
  if (boxDiff) return boxDiff;
  const targetDiff = Math.abs(recommendationFillPercent(a) - RECOMMENDATION_TARGET_FILL_PERCENT) - Math.abs(recommendationFillPercent(b) - RECOMMENDATION_TARGET_FILL_PERCENT);
  if (Math.abs(targetDiff) > EPS) return targetDiff;
  return volumeM3(a.container) - volumeM3(b.container);
}

function buildRecommendation(evaluation) {
  const meta = equipmentMeta(evaluation.container);
  const statusRank = fitStatusRank(evaluation.fitStatus);
  const boxes = normalizedBoxCount(evaluation);
  const cost = evaluation.isMixedPlan || evaluation.container?.mixedPlan
    ? Number(evaluation.container?.costFactor || 9999)
    : boxes >= 9999 ? 9999 : boxes * meta.costFactor;
  const fill = recommendationFillPercent(evaluation);
  const underusePenalty = Math.max(0, UTILIZATION_LOW_WARN_PERCENT - fill) * 42;
  const severeUnderusePenalty = Math.pow(Math.max(0, 45 - fill), 2) * 4;
  const tightPenalty = Math.max(0, fill - UTILIZATION_HIGH_WARN_PERCENT) * 8;
  const targetPenalty = Math.abs(fill - RECOMMENDATION_TARGET_FILL_PERCENT) * 5;
  const lowUseLargeBoxPenalty = fill < 60 && ["45HQ", "FR", "RF"].includes(meta.equipmentClass) ? (60 - fill) * 55 : 0;
  const specialEquipmentPenalty = meta.equipmentClass === "MIX" ? 0 : meta.equipmentClass === "FR" ? 4200 : meta.equipmentClass === "RF" ? 3200 : meta.equipmentClass === "45HQ" ? 180 : 0;
  const balancePenalty = evaluation.fitStatus === FIT_STATUS.BALANCE_BLOCKED
    ? 50000
    : evaluation.packedBoxes?.some((box) => box.balanceValidation?.severity === "yellow")
      ? 120
      : 0;
  const oversizePenalty = evaluation.fitStatus === FIT_STATUS.OVERSIZE ? 1000000 : 0;
  const statusPenalty = statusRank * 1000;
  const volumePenalty = volumeM3(evaluation.container) * 1.5;
  const score = oversizePenalty
    + balancePenalty
    + statusPenalty
    + cost * RECOMMENDATION_COST_WEIGHT
    + boxes * RECOMMENDATION_BOX_WEIGHT
    + specialEquipmentPenalty
    + lowUseLargeBoxPenalty
    + underusePenalty
    + severeUnderusePenalty
    + tightPenalty
    + targetPenalty
    + volumePenalty;

  return {
    score: round(score),
    costFactor: round(meta.costFactor),
    estimatedCost: round(cost),
    priceTier: meta.priceTier,
    equipmentClass: meta.equipmentClass,
    utilizationBand: utilizationBand(fill),
    averageFillPercent: round(fill),
    statusRank
  };
}

function recommendationScoreValue(evaluation) {
  const score = Number(evaluation?.recommendation?.score);
  return Number.isFinite(score) ? score : buildRecommendation(evaluation).score;
}

function recommendationFillPercent(evaluation) {
  const average = Number(evaluation?.averageFillPercent);
  if (Number.isFinite(average) && average > 0) return average;
  const first = Number(evaluation?.firstBoxFillPercent);
  return Number.isFinite(first) ? first : 0;
}

function fitStatusRank(status) {
  if (status === FIT_STATUS.FIT) return 0;
  if (status === FIT_STATUS.BALANCE_BLOCKED) return 1;
  return 2;
}

function normalizedBoxCount(evaluation) {
  const boxes = Number(evaluation?.boxes || 0);
  return boxes > 0 ? boxes : 9999;
}

function estimatedFreightCost(evaluation) {
  const recommendation = evaluation?.recommendation;
  if (Number.isFinite(Number(recommendation?.estimatedCost))) return Number(recommendation.estimatedCost);
  const meta = equipmentMeta(evaluation?.container);
  return normalizedBoxCount(evaluation) * meta.costFactor;
}

function equipmentMeta(container = {}) {
  const id = String(container.id || "").toLowerCase();
  const name = String(container.name || "").toLowerCase();
  const text = `${id} ${name}`;
  const explicitCost = Number(container.costFactor);
  let equipmentClass = String(container.equipmentClass || "").toUpperCase();
  if (!["GP", "HQ", "45HQ", "RF", "FR", "MIX"].includes(equipmentClass)) {
    equipmentClass = "GP";
    if (/fr|flat/.test(text) || /平板/.test(name)) equipmentClass = "FR";
    else if (/rf|reefer/.test(text) || /冷藏/.test(name)) equipmentClass = "RF";
    else if (/45/.test(text)) equipmentClass = "45HQ";
    else if (/hq|high/.test(text) || /高/.test(name)) equipmentClass = "HQ";
  }

  const inferredCosts = {
    "20gp": 1,
    "20hq": 1.08,
    "40gp": 1.55,
    "40hq": 1.68,
    "45hq": 2.05,
    "20rf": 1.65,
    "40rf": 2.45,
    "20fr": 2.15,
    "40fr": 3.2
  };
  const inferredByClass = equipmentClass === "MIX" ? 1 : equipmentClass === "FR" ? 2.6 : equipmentClass === "RF" ? 2 : equipmentClass === "45HQ" ? 2.05 : equipmentClass === "HQ" ? 1.45 : 1.25;
  const costFactor = Number.isFinite(explicitCost) && explicitCost > 0
    ? explicitCost
    : inferredCosts[id] || inferredByClass;
  const explicitTier = String(container.priceTier || "").trim();
  const priceTier = explicitTier || (
    costFactor <= 1.15
      ? "economy"
      : costFactor <= 1.75
        ? "standard"
        : costFactor <= 2.35
          ? "high"
          : "special"
  );

  return { costFactor, priceTier, equipmentClass };
}

function utilizationBand(fillPercent) {
  if (fillPercent <= 0) return "none";
  if (fillPercent < 45) return "low";
  if (fillPercent < 70) return "moderate";
  if (fillPercent <= UTILIZATION_HIGH_WARN_PERCENT) return "balanced";
  return "tight";
}

function buildTrace(container, units, total, multi, metrics) {
  const firstBox = multi.firstBox || { placed: [], unplaced: [] };
  const containerVolume = volumeM3(container);
  const rules = balanceRuleSettings(container);
  const supportRules = supportRuleSettings(container);
  const effectiveNonStackSupport = effectiveNonStackSupportRatio(container);
  return {
    worker: "frontend/src/workers/packingWorker.js",
    mode: "Browser WebWorker 本机计算",
    solver: "LAFF + Extreme Point + Local Search",
    pipeline: [
      "主线程把货物、箱型、计划可用率、货物间隙复制给 Web Worker",
      "Worker 对大批量同规格货物先按当前箱型组合成若干块，少量和余数仍保留单件 DTO 字段",
      "每个箱型独立运行多轮 LAFF 搜索，分别尝试大底面积、高度、承重优先、不可重压最后和蓝色/小件竖放策略",
      "每个 LAFF 层内使用 Extreme Point 候选点回填底部、顶部和侧边空隙",
      "候选落位必须满足边界、不相交、底面支撑和不可重压货物不承载上层货物",
      "首轮失败时执行局部搜索，移出一小组已摆货物与剩余货物重排，而不是立刻开启第二箱",
      "同一箱型选择已摆数量更多、占用体积更高、承重支撑面更好的方案",
      "所有箱型按合规状态、参考费用、箱数、利用率区间和特种箱惩罚进行综合推荐"
    ],
    strategies: SEARCH_STRATEGIES.map((strategy) => strategy.name),
    selectedStrategy: firstBox.strategyName || "",
    supportRatioPercent: round(supportRules.supportRatio * 100),
    nonStackSupportRatioPercent: round(effectiveNonStackSupport * 100),
    balanceRules: {
      frontRearAxis: "container length / X",
      leftRightAxis: "container width / Y",
      greenLimitPercent: rules.greenLimitPercent,
      redLimitPercent: rules.redLimitPercent,
      frontMaxPercent: rules.frontMaxPercent,
      rearMinPercent40FR: rules.rearMinPercent40FR,
      lateralOffsetLimitCm: rules.lateralOffsetLimitCm,
      skipBelowWeightKg: rules.skipBelowWeightKg,
      heightLimitIgnored: isHeightUnlimited(container),
      redAction: "reject current layout and retry another strategy"
    },
    parameters: {
      utilizationPercent: metrics.utilizationPercent,
      globalGapCm: metrics.globalGapCm,
      physicalUnitCount: total.totalQuantity,
      solverUnitCount: units.length,
      groupedBlockCount: units.filter((unit) => unit.groupQuantity > 1).length,
      groupedPhysicalUnits: units.reduce((sum, unit) => sum + Math.max(0, unitQuantity(unit) - 1), 0),
      cargoTypeCounts: countBy(units, "type")
    },
    formulas: [
      "单件原始体积(m3) = 长 x 宽 x 高 / 1,000,000",
      "计入间隙长/宽(cm) = 原始长/宽 + 全局货物间隙 + 类型额外间隙",
      "计入高度(cm) = 原始高度 + 类型额外高度余量",
      `Stackable support rule = lower stackable overlap area / current footprint >= ${round(supportRules.supportRatio * 100)}%`,
      `Non-stack support rule = lower stackable overlap area / current footprint >= ${round(effectiveNonStackSupport * 100)}%`,
      "不可重压货物可以放在可承重货物上方，但不能作为上层货物的支撑面"
    ],
    current: {
      containerName: container.name,
      containerVolumeM3: round(containerVolume),
      usableVolumeM3: round(metrics.usableVolume),
      totalRawVolumeM3: round(total.totalRawVolumeM3),
      totalWeightKg: round(total.totalWeightKg),
      firstBoxRawVolumeM3: round(metrics.firstPackedRawVolume),
      firstBoxOccupiedVolumeM3: round(metrics.firstPackedOccupiedVolume),
      firstBoxRemainingVolumeM3: round(Math.max(0, metrics.remainingVolume)),
      firstBoxFillPercent: round(metrics.fillPercent),
      firstBoxRawFillPercent: round(metrics.rawFillPercent),
      averageFillPercent: round(metrics.averageFillPercent || metrics.usage?.averageFillPercent || metrics.fillPercent),
      usageMode: metrics.usage?.mode || "volume",
      firstBoxDeckAreaPercent: round(metrics.usage?.firstDeckAreaPercent || 0),
      firstBoxLengthPercent: round(metrics.usage?.firstLengthPercent || 0),
      geometryBoxes: multi.boxes,
      weightBoxes: metrics.weightBoxes,
      finalBoxes: metrics.boxes,
      detailedBoxes: multi.packedBoxes.length,
      detailedBoxLimit: multi.detailedBoxLimit || MAX_DETAILED_BOXES,
      remainingUnitCountAfterDetailed: multi.remainingUnitCountAfterDetailed || 0
    },
    firstBox: {
      placedCount: sumUnitQuantity(firstBox.placed),
      unplacedCount: sumUnitQuantity(firstBox.unplaced),
      solverPlacedCount: firstBox.placed.length,
      solverUnplacedCount: firstBox.unplaced.length,
      maxTopCm: round(maxTop(firstBox.placed)),
      strategyId: firstBox.strategyId || "",
      strategyName: firstBox.strategyName || "",
      balanceValidation: firstBox.balanceValidation || validateWeightBalance(container, firstBox.placed)
    },
    boxStrategies: multi.packedBoxes.map((box, index) => ({
      boxIndex: index + 1,
      strategyName: box.strategyName || "",
      placedCount: sumUnitQuantity(box.placed),
      unplacedCount: sumUnitQuantity(box.unplaced),
      solverPlacedCount: box.placed.length,
      solverUnplacedCount: box.unplaced.length,
      occupiedVolumeM3: round(sumOccupiedVolumeM3(box.placed)),
      maxTopCm: round(maxTop(box.placed)),
      balanceSeverity: box.balanceValidation?.severity || "",
      balanceScore: round(box.balanceValidation?.score || 0),
      balanceChecks: box.balanceValidation?.checks || {}
    }))
  };
}

function expandGroupedPlacements(placed) {
  return placed.flatMap((unit) => expandGroupedPlacement(unit));
}

function expandGroupedPlacement(unit) {
  const quantity = unitQuantity(unit);
  if (quantity <= 1) return [copyUnit(unit)];

  const cols = Math.max(1, Math.floor(Number(unit.groupCols || quantity)));
  const rows = Math.max(1, Math.floor(Number(unit.groupRows || Math.ceil(quantity / cols))));
  const rawLength = singleRawLengthCm(unit);
  const rawWidth = singleRawWidthCm(unit);
  const rawHeight = singleRawHeightCm(unit);
  const gap = Number(unit.gapCm || 0);
  const verticalGap = Number(unit.verticalGapCm || unit.extraGapCm || 0);
  const stepLength = rawLength + gap;
  const stepWidth = rawWidth + gap;
  const pieceHeight = rawHeight + verticalGap;
  const normalBlockLength = stepLength * cols;
  const normalBlockWidth = stepWidth * rows;
  const rotated = Math.abs(Number(unit.lengthCm || 0) - normalBlockWidth) < EPS
    && Math.abs(Number(unit.widthCm || 0) - normalBlockLength) < EPS;
  const pieces = [];

  for (let i = 0; i < quantity; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const lengthCm = rotated ? stepWidth : stepLength;
    const widthCm = rotated ? stepLength : stepWidth;
    const x = Number(unit.x || 0) + (rotated ? row * stepWidth : col * stepLength);
    const y = Number(unit.y || 0) + (rotated ? col * stepLength : row * stepWidth);
    const piece = {
      ...copyUnit(unit),
      unitKey: `${unit.unitKey}-p${i + 1}`,
      parentUnitKey: unit.unitKey,
      itemIndex: Number(unit.itemIndex || 0) * 1000 + i,
      x: round3(x),
      y: round3(y),
      z: Number(unit.z || 0),
      baseLengthCm: rawLength,
      baseWidthCm: rawWidth,
      baseHeightCm: rawHeight,
      lengthCm,
      widthCm,
      heightCm: pieceHeight,
      packedLengthCm: lengthCm,
      packedWidthCm: widthCm,
      packedHeightCm: pieceHeight,
      weightKg: singleWeightKg(unit),
      volumeM3: singleVolumeM3(unit),
      groupQuantity: 1,
      groupCols: 1,
      groupRows: 1,
      lengthAxis: unit.lengthAxis,
      widthAxis: unit.widthAxis,
      heightAxis: unit.heightAxis
    };
    piece.orientations = generateOrientations(piece);
    pieces.push(piece);
  }

  return pieces;
}

function toPlacementDto(unit) {
  const xAxisBaseCm = axisBaseCm(unit, unit.lengthAxis);
  const yAxisBaseCm = axisBaseCm(unit, unit.widthAxis);
  const zAxisBaseCm = axisBaseCm(unit, unit.heightAxis);
  return {
    unitKey: unit.unitKey,
    cargoId: unit.cargoId,
    name: unit.name,
    baseName: unit.baseName || unit.name,
    model: unit.model || "",
    color: unit.color,
    type: unit.type,
    baseLengthCm: round(unit.baseLengthCm),
    baseWidthCm: round(unit.baseWidthCm),
    baseHeightCm: round(unit.baseHeightCm),
    lengthCm: round(unit.lengthCm),
    widthCm: round(unit.widthCm),
    heightCm: round(unit.heightCm),
    xAxis: unit.lengthAxis || "长",
    yAxis: unit.widthAxis || "宽",
    zAxis: unit.heightAxis || "高",
    xAxisBaseCm: round(xAxisBaseCm),
    yAxisBaseCm: round(yAxisBaseCm),
    zAxisBaseCm: round(zAxisBaseCm),
    bottomFace: `${unit.lengthAxis || "长"}×${unit.widthAxis || "宽"}`,
    heightAxis: unit.heightAxis || "高",
    bottomFaceDetail: `X向=${unit.lengthAxis || "长"}${round(xAxisBaseCm)}cm / Y向=${unit.widthAxis || "宽"}${round(yAxisBaseCm)}cm`,
    orientationLabel: `底面 X向${unit.lengthAxis || "长"}${round(xAxisBaseCm)}cm × Y向${unit.widthAxis || "宽"}${round(yAxisBaseCm)}cm / 高度Z向${unit.heightAxis || "高"}${round(zAxisBaseCm)}cm`,
    xCm: round(unit.x),
    yCm: round(unit.y),
    zCm: round(unit.z),
    weightKg: round(unit.weightKg),
    volumeM3: round(cargoVolumeM3(unit)),
    geometryVolumeM3: round(occupiedVolumeM3(unit)),
    groupQuantity: unitQuantity(unit),
    groupCols: Number(unit.groupCols || 1),
    groupRows: Number(unit.groupRows || 1),
    nonStack: unit.nonStack
  };
}

function axisBaseCm(unit, axis) {
  if (axis === "长") return unit.baseLengthCm;
  if (axis === "宽") return unit.baseWidthCm;
  if (axis === "高") return unit.baseHeightCm;
  return 0;
}

function volumeM3(container) {
  return Number(container.lengthCm) * Number(container.widthCm) * Number(container.heightCm) / 1_000_000;
}

function occupiedVolumeM3(unit) {
  return Number(unit.lengthCm) * Number(unit.widthCm) * Number(unit.heightCm) / 1_000_000;
}

function safeUtilizationPercent(value) {
  return Math.max(1, Math.min(100, Number(value || 90)));
}

function safeGlobalGapCm(value) {
  return Math.max(0, Number(value || 0));
}

function normalizeBalanceSettings(settings = {}) {
  const redLimitPercent = clampNumber(settings.redLimitPercent, 3, 12, BALANCE_RED_LIMIT_PERCENT);
  return {
    greenLimitPercent: Math.min(redLimitPercent, clampNumber(settings.greenLimitPercent, 1, 5, BALANCE_GREEN_LIMIT_PERCENT)),
    redLimitPercent,
    frontMaxPercent: clampNumber(settings.frontMaxPercent, 55, 70, FRONT_MAX_PERCENT),
    rearMinPercent40FR: clampNumber(settings.rearMinPercent40FR, 20, 45, REAR_MIN_PERCENT_40FR),
    lateralOffsetLimitCm: clampNumber(settings.lateralOffsetLimitCm, 4, 20, LATERAL_OFFSET_LIMIT_CM),
    skipBelowWeightKg: clampNumber(settings.skipBelowWeightKg, 0, 30000, BALANCE_SKIP_BELOW_WEIGHT_KG)
  };
}

function balanceRuleSettings(container = {}) {
  return normalizeBalanceSettings(container.balanceSettings || {});
}

function normalizeSupportSettings(settings = {}) {
  const raw = settings.supportSettings || settings || {};
  return {
    supportRatio: normalizeSupportRatioValue(
      raw.supportRatio,
      raw.supportRatioPercent ?? raw.supportPercent,
      0.5,
      1,
      DEFAULT_SUPPORT_RATIO
    ),
    nonStackSupportRatio: normalizeSupportRatioValue(
      raw.nonStackSupportRatio,
      raw.nonStackSupportRatioPercent ?? raw.nonStackSupportPercent,
      0.8,
      1,
      DEFAULT_NONSTACK_SUPPORT_RATIO
    )
  };
}

function normalizeSupportRatioValue(ratioValue, percentValue, min, max, fallback) {
  const percentNumber = Number(percentValue);
  if (Number.isFinite(percentNumber)) return clampNumber(percentNumber / 100, min, max, fallback);
  return clampNumber(ratioValue, min, max, fallback);
}

function supportRuleSettings(container = {}) {
  return normalizeSupportSettings(container.supportSettings || {});
}

function effectiveNonStackSupportRatio(container = {}) {
  const rules = supportRuleSettings(container);
  return Math.min(rules.nonStackSupportRatio, rules.supportRatio);
}

function supportRatioForUnit(container = {}, unit = {}, strategy = {}, options = {}) {
  if (Number.isFinite(Number(unit?.supportRatioOverride))) {
    return clampNumber(unit.supportRatioOverride, 0.1, 1, DEFAULT_SUPPORT_RATIO);
  }
  const optionRatio = unit?.nonStack
    ? options.nonStackSupportRatio ?? strategy.nonStackSupportRatio
    : options.supportRatio ?? strategy.supportRatio;
  if (Number.isFinite(Number(optionRatio))) {
    return unit?.nonStack
      ? clampNumber(optionRatio, 0.8, 1, DEFAULT_NONSTACK_SUPPORT_RATIO)
      : clampNumber(optionRatio, 0.5, 1, DEFAULT_SUPPORT_RATIO);
  }
  const rules = supportRuleSettings(container);
  return unit?.nonStack ? effectiveNonStackSupportRatio(container) : rules.supportRatio;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function uniqueSorted(values, first) {
  const set = new Set([round3(first), ...values.map(round3)]);
  return [...set].sort((a, b) => a - b);
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function decisionUnitName(unit) {
  const quantity = unitQuantity(unit);
  const group = quantity > 1 ? `组合${quantity}件` : "单件";
  return `[${unit?.name || "未命名货物"} · ${group} · ${round(unit?.weightKg || 0)}kg]`;
}

function decisionDims(item) {
  return `${round(item?.lengthCm)}×${round(item?.widthCm)}×${round(item?.heightCm)}cm`;
}

function decisionPoint(point) {
  return `(${round(point?.x)}, ${round(point?.y)}, ${round(point?.z)})`;
}

function balanceDecisionText(validation) {
  if (!validation?.valid) return "无重量数据";
  if (validation.balanceExempt || validation.severity === "exempt") return "轻载豁免";
  if (validation.severity === "green") return "绿色合规";
  if (validation.severity === "yellow") return "黄色预警";
  if (validation.severity === "red") return "红色拦截";
  return validation.severity || "未知";
}

function unitQuantity(unit) {
  return Math.max(1, Math.floor(Number(unit?.groupQuantity || 1)));
}

function sumUnitQuantity(units) {
  return units.reduce((sum, unit) => sum + unitQuantity(unit), 0);
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function round3(value) {
  return Number.isNaN(value) ? value : Math.round(Number(value || 0) * 1000) / 1000;
}

function copyUnit(unit) {
  return { ...unit, orientations: unit.orientations ? unit.orientations.map((item) => ({ ...item })) : undefined };
}
