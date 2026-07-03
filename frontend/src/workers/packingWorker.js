const TYPE_RULES = {
  normal: { rotatable: true, nonStack: false, extraGapCm: 0 },
  upright: { rotatable: false, nonStack: false, extraGapCm: 1 },
  nonstack: { rotatable: true, nonStack: true, extraGapCm: 2 },
  pallet: { rotatable: false, nonStack: false, extraGapCm: 3 }
};

const COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];
const EPS = 0.0001;
const SUPPORT_RATIO = 0.985;
const MAX_DETAILED_BOXES = 24;
const LOCAL_SEARCH_PASSES = 5;
const GROUPING_MIN_TOTAL_UNITS = 120;
const GROUPING_MIN_CARGO_QUANTITY = 24;
const GROUPING_MAX_BLOCK_QUANTITY = 4;
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
      const result = calculate(payload || {});
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
  const maxEntries = Math.min(600, Math.max(40, Math.floor(Number(options?.maxEntries || 240))));
  const batchSize = Math.min(40, Math.max(6, Math.floor(Number(options?.batchSize || 12))));
  const buffer = [];
  let emitted = 0;
  let dropped = 0;

  return {
    log(entry) {
      if (!enabled || !entry?.text) return;
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

export function calculate(request = {}) {
  const globalGapCm = safeGlobalGapCm(request.globalGapCm);
  const cargos = request.cargos || [];
  const total = totals(request.cargos || []);
  const utilization = safeUtilizationPercent(request.utilizationPercent);
  const balanceSettings = normalizeBalanceSettings(request.balanceSettings);
  const evaluations = [];
  traceDecision({
    phase: "start",
    level: "summary",
    text: `开始本机装箱：${cargos.length} 类货物 / ${total.totalQuantity} 件，评估 ${(request.containers || []).length} 个箱型；轻载阈值 ${round(balanceSettings.skipBelowWeightKg / 1000)}t。`
  });

  for (const container of request.containers || []) {
    const runtimeContainer = { ...container, balanceSettings };
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
    traceDecision({
      phase: "container",
      level: "summary",
      text: `${container.name} · 计算完成：${evaluation.fitStatus === FIT_STATUS.FIT ? "可装" : evaluation.fitStatus === FIT_STATUS.BALANCE_BLOCKED ? "偏载拦截" : "不可装"}，${evaluation.boxes > 0 ? `${evaluation.boxes} 箱` : "未形成完整方案"}，首箱利用率 ${round(evaluation.firstBoxFillPercent)}%，平均利用率 ${round(evaluation.averageFillPercent)}%。`
    });
  }

  const mixedEvaluation = safeBuildMixedContainerEvaluation(request.containers || [], cargos, total, utilization, globalGapCm, balanceSettings);
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
      return {
        index: index + 1,
        container: box.container ? { ...box.container } : undefined,
        strategyId: box.strategyId,
        strategyName: box.strategyName,
        strategySummary: box.strategySummary,
        balanceValidation,
        placed: box.placed.map(toPlacementDto),
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
    const placedIds = new Set(packed.placed.map((unit) => unit.unitKey));
    remaining = remaining.filter((unit) => !placedIds.has(unit.unitKey));
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

function safeBuildMixedContainerEvaluation(containers, cargos, total, utilizationPercent, globalGapCm, balanceSettings) {
  try {
    return buildMixedContainerEvaluation(containers, cargos, total, utilizationPercent, globalGapCm, balanceSettings);
  } catch (error) {
    return null;
  }
}

function buildMixedContainerEvaluation(containers, cargos, total, utilizationPercent, globalGapCm, balanceSettings) {
  if (!Array.isArray(containers) || containers.length < 2 || !total.totalQuantity) return null;
  const runtimeContainers = containers.map((container) => ({ ...container, balanceSettings }));
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

    const placedIds = new Set(selected.packed.placed.map((unit) => unit.unitKey));
    const selectedBox = {
      ...selected.packed,
      container: { ...selected.container, balanceSettings: undefined }
    };
    packedBoxes.push(selectedBox);
    if (selected.fitStatus === FIT_STATUS.BALANCE_BLOCKED) balanceBlocked = true;
    remaining = remaining.filter((unit) => !placedIds.has(unit.unitKey));
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
  const attempts = [];
  let rejectedByBalance = 0;
  for (const strategy of SEARCH_STRATEGIES) {
    traceDecision({
      phase: "strategy",
      level: "summary",
      text: `${container.name} · 尝试策略「${strategy.name}」：按 ${strategy.unitOrder === "footprint" ? "底面积/体积" : strategy.unitOrder === "height" ? "高度" : strategy.unitOrder === "support" ? "可承重与重量" : "规则"} 排序。`
    });
    const ordered = orderUnits(units, strategy.unitOrder);
    let attempt = packLayerLaff(container, ordered, strategy);
    if (attempt.unplaced.length) {
      const beforeRepair = sumUnitQuantity(attempt.unplaced);
      attempt = repairWithLocalSearch(container, attempt, ordered, strategy);
      traceDecision({
        phase: "repair",
        level: "summary",
        text: `${container.name} · 策略「${strategy.name}」进入局部搜索：原剩余 ${beforeRepair} 件，回填后剩余 ${sumUnitQuantity(attempt.unplaced)} 件，执行 ${attempt.strategySummary?.refillPasses || 0} 轮。`
      });
    }
    attempt = centerPackedLayout(container, attempt, strategy);
    attempt = withBalanceValidation(container, attempt, rejectedByBalance);
    if (attempt.balanceValidation?.severity === "red") rejectedByBalance += 1;
    attempts.push(attempt);
    traceDecision({
      phase: "strategy",
      level: "summary",
      text: `${container.name} · 策略「${strategy.name}」结果：装入 ${sumUnitQuantity(attempt.placed)} 件，剩余 ${sumUnitQuantity(attempt.unplaced)} 件，${attempt.strategySummary?.layerCount || 0} 层，偏载 ${balanceDecisionText(attempt.balanceValidation)}。`
    });
    if (!attempt.unplaced.length && attempt.balanceValidation?.severity !== "red") break;
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

function packLayerLaff(container, units, strategy) {
  const placed = [];
  const unplaced = [];
  const active = units.map(copyUnit);
  let nextLayerBottom = 0;
  let layerNo = 0;

  while (active.length) {
    const seedIndex = pickLayerSeedIndex(active, container, placed, strategy, { layerBottom: nextLayerBottom });
    if (seedIndex < 0) {
      unplaced.push(...active.splice(0));
      break;
    }

    const seed = active.splice(seedIndex, 1)[0];
    const seedPlacement = packExtremePoint(container, placed, seed, strategy, { layerBottom: nextLayerBottom });
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
        const placement = packExtremePoint(container, placed, unit, strategy, { layerBottom, layerTop });
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

  const valid = validateAllPlacements(container, placed);
  return makePackedBox(valid ? placed : [], valid ? unplaced : units, strategy, {
    localSearchPasses: 0,
    repairedCount: 0,
    layerCount: countLayers(placed)
  });
}

function packExtremePoint(container, placed, unit, strategy, options = {}) {
  let best = null;
  const orientations = generateOrientations(unit, { preferVertical: strategy.blueVertical });
  for (const dims of orientations) {
    if (!fitsContainerDims(container, dims)) continue;
    for (const point of extremePoints(container, placed, dims, options)) {
      const placement = { ...point, ...dims };
      const validation = validatePlacement(container, placed, unit, placement);
      if (!validation.valid) continue;
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
      const placement = packExtremePoint(container, placed, unit, strategy);
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

function validatePlacement(container, placed, unit, placement) {
  if (!fitsContainerDims(container, placement)) return { valid: false, reason: "out-of-bounds" };
  if (placed.some((box) => intersects(placement, box))) return { valid: false, reason: "intersects" };
  if (!hasSupport(placement, placed)) return { valid: false, reason: "unsupported" };
  if (unit.nonStack && hasAnyBoxAbove(placement, placed)) return { valid: false, reason: "nonstack-under-load" };
  return { valid: true, reason: "" };
}

function validateAllPlacements(container, placed) {
  for (let i = 0; i < placed.length; i += 1) {
    const current = placed[i];
    if (!fitsContainerDims(container, current)) return false;
    for (let j = i + 1; j < placed.length; j += 1) {
      if (intersects(current, placed[j])) return false;
    }
    const below = placed.filter((_, index) => index !== i);
    if (!hasSupport(current, below)) return false;
    if (current.nonStack && hasAnyBoxAbove(current, below)) return false;
  }
  return true;
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
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    const placement = packExtremePoint(container, placed, unit, strategy, options);
    if (!placement) continue;
    const area = placement.lengthCm * placement.widthCm;
    const score = placement.z * 1_000_000 - area * 100 - placement.heightCm;
    if (score < bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
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

  return [...points.values()].sort((a, b) => {
    if (Math.abs(a.z - b.z) > EPS) return a.z - b.z;
    if (Math.abs(a.y - b.y) > EPS) return a.y - b.y;
    return a.x - b.x;
  });
}

function hasSupport(placement, placed) {
  if (placement.z <= EPS) return true;
  const target = { x: placement.x, y: placement.y, lengthCm: placement.lengthCm, widthCm: placement.widthCm };
  const supports = placed
    .filter((box) => !box.nonStack && Math.abs(box.z + box.heightCm - placement.z) < EPS)
    .map((box) => overlapRect(target, { x: box.x, y: box.y, lengthCm: box.lengthCm, widthCm: box.widthCm }))
    .filter(Boolean);
  if (!supports.length) return false;
  return unionArea(supports) >= placement.lengthCm * placement.widthCm * SUPPORT_RATIO;
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
    if ((strategyId === "support" || strategyId === "nonstack-last") && a.nonStack !== b.nonStack) return a.nonStack ? 1 : -1;
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
    supportRatioPercent: round(SUPPORT_RATIO * 100),
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
      "上层支撑条件 = 下方可承重重叠面积 / 当前底面积 >= 98.5%",
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
