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
const GROUPING_MAX_BLOCK_QUANTITY = 16;
const BALANCE_GREEN_LIMIT_PERCENT = 2.5;
const BALANCE_RED_LIMIT_PERCENT = 5;
const FRONT_MAX_PERCENT = 60;
const REAR_MIN_PERCENT_40FR = 30;
const LATERAL_OFFSET_LIMIT_CM = 8;
const HEAVY_TOP_FRACTION = 0.35;
const BALANCE_SCORE_WEIGHT = 250000;
const EARLY_BALANCE_SCORE_WEIGHT = 0;
const HEAVY_CENTER_WEIGHT = 900;
const HEAVY_ZONE_WEIGHT = 4200;
const LIGHT_ZONE_WEIGHT = 650;
const BALANCE_ZONE_ORDER = ["frontLeft", "rearRight", "frontRight", "rearLeft"];
const FIT_STATUS = {
  FIT: "fit",
  BALANCE_BLOCKED: "balance-blocked",
  OVERSIZE: "oversize"
};
const UTILIZATION_TARGET_PERCENT = 82;
const UTILIZATION_LOW_WARN_PERCENT = 55;
const UTILIZATION_HIGH_WARN_PERCENT = 92;

const SEARCH_STRATEGIES = [
  { id: "laff-footprint", name: "LAFF 大底面积优先", unitOrder: "footprint", pointOrder: "low-wide", blueVertical: false },
  { id: "laff-height", name: "LAFF 高度优先", unitOrder: "height", pointOrder: "low-wide", blueVertical: false },
  { id: "support-first", name: "普通承重货物优先", unitOrder: "support", pointOrder: "support", blueVertical: false },
  { id: "nonstack-last", name: "不可重压货物最后", unitOrder: "nonstack-last", pointOrder: "low-wide", blueVertical: false },
  { id: "blue-vertical", name: "蓝色/小件竖放支撑", unitOrder: "small-vertical", pointOrder: "support", blueVertical: true }
];

const workerScope = typeof self !== "undefined" ? self : null;
if (workerScope?.addEventListener) {
  workerScope.onmessage = (event) => {
    const { id, payload } = event.data || {};
    try {
      const result = calculate(payload || {});
      workerScope.postMessage({ id, type: "result", result });
    } catch (error) {
      workerScope.postMessage({ id, type: "error", message: error.message || "本机计算失败" });
    }
  };
}

export function calculate(request = {}) {
  const globalGapCm = safeGlobalGapCm(request.globalGapCm);
  const cargos = request.cargos || [];
  const total = totals(request.cargos || []);
  const utilization = safeUtilizationPercent(request.utilizationPercent);
  const evaluations = [];

  for (const container of request.containers || []) {
    const units = buildUnits(cargos, globalGapCm, container, total);
    const evaluation = evaluateContainer(container, units, total, utilization, globalGapCm);
    evaluations.push(evaluation);
  }

  evaluations.sort(compareEvaluation);
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
  const firstPackedRawVolume = multi.firstBox.placed.reduce((sum, unit) => sum + unit.volumeM3, 0);
  const firstPackedOccupiedVolume = multi.firstBox.placed.reduce((sum, unit) => sum + occupiedVolumeM3(unit), 0);
  const fillPercent = usableVolume > 0 ? firstPackedOccupiedVolume / usableVolume * 100 : 0;
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
    firstBoxFillPercent: round(fillPercent),
    firstBoxRawFillPercent: round(rawFillPercent),
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
      remainingVolume,
      weightBoxes,
      boxes
    }),
    packedBoxes: multi.packedBoxes.map((box, index) => {
      const balanceValidation = packedBoxBalances[index] || validateWeightBalance(container, box.placed);
      return {
        index: index + 1,
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
    && unit.z + unit.heightCm <= container.heightCm + EPS
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
  if (itemHeight > container.heightCm + EPS) return null;

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
  const fits = lengthCm <= container.lengthCm + EPS && widthCm <= container.widthCm + EPS && heightCm <= container.heightCm + EPS;
  const rotatedFits = rotatable && widthCm <= container.lengthCm + EPS && lengthCm <= container.widthCm + EPS && heightCm <= container.heightCm + EPS;
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
    const ordered = orderUnits(units, strategy.unitOrder);
    let attempt = packLayerLaff(container, ordered, strategy);
    if (attempt.unplaced.length) {
      attempt = repairWithLocalSearch(container, attempt, ordered, strategy);
    }
    attempt = withBalanceValidation(container, attempt, rejectedByBalance);
    if (attempt.balanceValidation?.severity === "red") rejectedByBalance += 1;
    attempts.push(attempt);
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

  while (active.length) {
    const seedIndex = pickLayerSeedIndex(active, container, placed, strategy);
    if (seedIndex < 0) {
      unplaced.push(...active.splice(0));
      break;
    }

    const seed = active.splice(seedIndex, 1)[0];
    const seedPlacement = packExtremePoint(container, placed, seed, strategy);
    if (!seedPlacement) {
      unplaced.push(seed);
      continue;
    }

    const placedSeed = applyPlacement(seed, seedPlacement);
    placed.push(placedSeed);

    const layerTop = placedSeed.z + placedSeed.heightCm;
    let changed = true;
    while (changed) {
      changed = false;
      const layerCandidates = orderLayerCandidates(active, placedSeed.z, layerTop, strategy);
      for (const unit of layerCandidates) {
        const index = active.findIndex((item) => item.unitKey === unit.unitKey);
        if (index < 0) continue;
        const placement = packExtremePoint(container, placed, unit, strategy, { layerTop });
        if (!placement) continue;
        active.splice(index, 1);
        placed.push(applyPlacement(unit, placement));
        changed = true;
      }
    }
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

function pickLayerSeedIndex(units, container, placed, strategy) {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    const placement = packExtremePoint(container, placed, unit, strategy);
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
    const aCanShare = a.orientations.some((dims) => dims.heightCm <= layerTop - layerBottom + EPS);
    const bCanShare = b.orientations.some((dims) => dims.heightCm <= layerTop - layerBottom + EPS);
    if (aCanShare !== bCanShare) return aCanShare ? -1 : 1;
    return orderUnits([a, b], strategy.unitOrder)[0].unitKey === a.unitKey ? -1 : 1;
  });
}

function extremePoints(container, placed, dims, options = {}) {
  const points = new Map();
  const add = (x, y, z) => {
    const point = { x: round3(x), y: round3(y), z: round3(z) };
    if (point.x < -EPS || point.y < -EPS || point.z < -EPS) return;
    if (point.x + dims.lengthCm > container.lengthCm + EPS) return;
    if (point.y + dims.widthCm > container.widthCm + EPS) return;
    if (point.z + dims.heightCm > container.heightCm + EPS) return;
    if (options.layerTop && point.z + dims.heightCm > options.layerTop + EPS) return;
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
    const aPlacedCount = sumUnitQuantity(a.placed);
    const bPlacedCount = sumUnitQuantity(b.placed);
    if (aPlacedCount !== bPlacedCount) return bPlacedCount - aPlacedCount;
    const occupiedDiff = sumOccupiedVolumeM3(b.placed) - sumOccupiedVolumeM3(a.placed);
    if (Math.abs(occupiedDiff) > EPS) return occupiedDiff;
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
  const isEarlySpread = placed.length < Math.min(3, BALANCE_ZONE_ORDER.length - 1);
  const severityPenalty = isEarlySpread ? 0 : validation.severity === "red" ? 3 : validation.severity === "yellow" ? 1 : 0;
  const weight = isEarlySpread ? EARLY_BALANCE_SCORE_WEIGHT : BALANCE_SCORE_WEIGHT;
  return (validation.score + severityPenalty * BALANCE_RED_LIMIT_PERCENT) * weight;
}

function validateWeightBalance(container, placed) {
  const balance = calculateWeightBalance(container, placed);
  if (!balance.valid) return balance;

  const frontRearDiffPercent = Math.abs(balance.loads.frontPercent - balance.loads.rearPercent);
  const leftRightDiffPercent = Math.abs(balance.loads.leftPercent - balance.loads.rightPercent);
  const longitudinalOffsetPercent = Math.abs(balance.offset.longitudinalPercent);
  const lateralOffsetPercent = Math.abs(balance.offset.lateralPercent);
  const lateralOffsetCm = Math.abs(balance.offset.lateralCm);
  const requiresRearMinimum = isFortyFootFlatRack(container);
  const frontMaxExcess = Math.max(0, balance.loads.frontPercent - FRONT_MAX_PERCENT);
  const rearMinExcess = requiresRearMinimum ? Math.max(0, REAR_MIN_PERCENT_40FR - balance.loads.rearPercent) : 0;
  const frontRearExcess = Math.max(0, frontRearDiffPercent - BALANCE_RED_LIMIT_PERCENT);
  const leftRightExcess = Math.max(0, leftRightDiffPercent - BALANCE_RED_LIMIT_PERCENT);
  const longitudinalExcess = Math.max(0, longitudinalOffsetPercent - BALANCE_RED_LIMIT_PERCENT);
  const lateralPercentExcess = Math.max(0, lateralOffsetPercent - BALANCE_RED_LIMIT_PERCENT);
  const lateralCmExcess = Math.max(0, lateralOffsetCm - LATERAL_OFFSET_LIMIT_CM);
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
    lateralOffsetCm / LATERAL_OFFSET_LIMIT_CM * BALANCE_RED_LIMIT_PERCENT
  );
  const yellow = !red && (
    warningScore > BALANCE_GREEN_LIMIT_PERCENT + EPS
    || balance.loads.frontPercent > FRONT_MAX_PERCENT - BALANCE_GREEN_LIMIT_PERCENT
    || (requiresRearMinimum && balance.loads.rearPercent < REAR_MIN_PERCENT_40FR + BALANCE_GREEN_LIMIT_PERCENT)
  );
  const hardExcessScore = frontMaxExcess + rearMinExcess + frontRearExcess + leftRightExcess
    + longitudinalExcess + lateralPercentExcess + lateralCmExcess / LATERAL_OFFSET_LIMIT_CM * BALANCE_RED_LIMIT_PERCENT;

  return {
    ...balance,
    severity: red ? "red" : yellow ? "yellow" : "green",
    score: warningScore + hardExcessScore * 20,
    limits: {
      greenPercent: BALANCE_GREEN_LIMIT_PERCENT,
      redPercent: BALANCE_RED_LIMIT_PERCENT,
      frontMaxPercent: FRONT_MAX_PERCENT,
      rearMinPercent40FR: requiresRearMinimum ? REAR_MIN_PERCENT_40FR : null,
      lateralOffsetLimitCm: LATERAL_OFFSET_LIMIT_CM
    },
    checks: {
      frontPercent: round(balance.loads.frontPercent),
      rearPercent: round(balance.loads.rearPercent),
      frontRearDiffPercent: round(frontRearDiffPercent),
      leftRightDiffPercent: round(leftRightDiffPercent),
      longitudinalOffsetPercent: round(longitudinalOffsetPercent),
      lateralOffsetPercent: round(lateralOffsetPercent),
      lateralOffsetCm: round(lateralOffsetCm),
      requiresRearMinimum
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

function zoneSpreadPenalty(container, placed, placement) {
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
  const front = placement.y + placement.widthCm;
  const right = placement.x + placement.lengthCm;
  const area = placement.lengthCm * placement.widthCm;
  const supportBonus = unit.nonStack ? 0 : area * Math.max(0, 1 - top / Math.max(1, container.heightCm));
  const verticalPenalty = strategy.blueVertical && shouldPreferVertical(unit) ? -placement.heightCm * 100 : 0;
  const balancePenalty = projectedBalancePenalty(container, placed, unit, placement);
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const unitCenterX = placement.x + placement.lengthCm / 2;
  const unitCenterY = placement.y + placement.widthCm / 2;
  const centerDistance = Math.abs(unitCenterX - centerX) + Math.abs(unitCenterY - centerY);
  const heavyCenterPenalty = unit.isHeavy ? centerDistance * HEAVY_CENTER_WEIGHT : centerDistance * 12;
  const spreadPenalty = zoneSpreadPenalty(container, placed, placement) * (unit.isHeavy ? HEAVY_ZONE_WEIGHT : LIGHT_ZONE_WEIGHT);
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
  return dims.lengthCm <= container.lengthCm + EPS
    && dims.widthCm <= container.widthCm + EPS
    && dims.heightCm <= container.heightCm + EPS
    && Number(dims.x || 0) >= -EPS
    && Number(dims.y || 0) >= -EPS
    && Number(dims.z || 0) >= -EPS
    && Number(dims.x || 0) + dims.lengthCm <= container.lengthCm + EPS
    && Number(dims.y || 0) + dims.widthCm <= container.widthCm + EPS
    && Number(dims.z || 0) + dims.heightCm <= container.heightCm + EPS;
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
  const targetDiff = Math.abs(a.firstBoxFillPercent - UTILIZATION_TARGET_PERCENT) - Math.abs(b.firstBoxFillPercent - UTILIZATION_TARGET_PERCENT);
  if (Math.abs(targetDiff) > EPS) return targetDiff;
  return volumeM3(a.container) - volumeM3(b.container);
}

function buildRecommendation(evaluation) {
  const meta = equipmentMeta(evaluation.container);
  const statusRank = fitStatusRank(evaluation.fitStatus);
  const boxes = normalizedBoxCount(evaluation);
  const cost = boxes >= 9999 ? 9999 : boxes * meta.costFactor;
  const fill = Number(evaluation.firstBoxFillPercent || 0);
  const underusePenalty = Math.max(0, UTILIZATION_LOW_WARN_PERCENT - fill) * 4;
  const tightPenalty = Math.max(0, fill - UTILIZATION_HIGH_WARN_PERCENT) * 2;
  const targetPenalty = Math.abs(fill - UTILIZATION_TARGET_PERCENT) * 0.8;
  const specialEquipmentPenalty = meta.equipmentClass === "FR" ? 260 : meta.equipmentClass === "RF" ? 160 : meta.equipmentClass === "45HQ" ? 60 : 0;
  const balancePenalty = evaluation.fitStatus === FIT_STATUS.BALANCE_BLOCKED
    ? 50000
    : evaluation.packedBoxes?.some((box) => box.balanceValidation?.severity === "yellow")
      ? 120
      : 0;
  const oversizePenalty = evaluation.fitStatus === FIT_STATUS.OVERSIZE ? 1000000 : 0;
  const statusPenalty = statusRank * 1000;
  const volumePenalty = volumeM3(evaluation.container) * 2;
  const score = oversizePenalty
    + balancePenalty
    + statusPenalty
    + cost * 1000
    + specialEquipmentPenalty
    + underusePenalty
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
    statusRank
  };
}

function recommendationScoreValue(evaluation) {
  const score = Number(evaluation?.recommendation?.score);
  return Number.isFinite(score) ? score : buildRecommendation(evaluation).score;
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
  let equipmentClass = "GP";
  if (/fr|flat/.test(text) || /平板/.test(name)) equipmentClass = "FR";
  else if (/rf|reefer/.test(text) || /冷藏/.test(name)) equipmentClass = "RF";
  else if (/45/.test(text)) equipmentClass = "45HQ";
  else if (/hq|high/.test(text) || /高/.test(name)) equipmentClass = "HQ";

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
  const inferredByClass = equipmentClass === "FR" ? 2.6 : equipmentClass === "RF" ? 2 : equipmentClass === "45HQ" ? 2.05 : equipmentClass === "HQ" ? 1.45 : 1.25;
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
      greenLimitPercent: BALANCE_GREEN_LIMIT_PERCENT,
      redLimitPercent: BALANCE_RED_LIMIT_PERCENT,
      frontMaxPercent: FRONT_MAX_PERCENT,
      rearMinPercent40FR: REAR_MIN_PERCENT_40FR,
      lateralOffsetLimitCm: LATERAL_OFFSET_LIMIT_CM,
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
