const TYPE_RULES = {
  normal: { rotatable: true, nonStack: false, extraGapCm: 0 },
  upright: { rotatable: false, nonStack: false, extraGapCm: 1 },
  nonstack: { rotatable: true, nonStack: true, extraGapCm: 2 },
  pallet: { rotatable: false, nonStack: false, extraGapCm: 3 }
};

const COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];
const EPS = 0.0001;
const SUPPORT_RATIO = 0.985;
const MAX_DETAILED_BOXES = 6;
const LOCAL_SEARCH_PASSES = 5;

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
  const units = buildUnits(request.cargos || [], globalGapCm);
  const total = totals(request.cargos || []);
  const utilization = safeUtilizationPercent(request.utilizationPercent);
  const evaluations = [];
  let reusableOneBox = null;

  for (const container of request.containers || []) {
    const evaluation = reusableOneBox && canReuseOneBox(reusableOneBox, container, total)
      ? evaluateContainerFromReusable(container, units, total, utilization, globalGapCm, reusableOneBox)
      : evaluateContainer(container, units, total, utilization, globalGapCm);

    if (canSeedReusableOneBox(evaluation)) {
      reusableOneBox = {
        container: evaluation.container,
        firstBox: evaluation._sourceFirstBox
      };
    }
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
  const boxes = multi.fatalOversize ? -1 : Math.max(multi.boxes, weightBoxes);

  const evaluation = {
    container,
    feasible: !multi.fatalOversize && boxes > 0,
    fatalOversize: multi.fatalOversize,
    boxes,
    totalUnits: units.length,
    usableVolumeM3: round(usableVolume),
    totalRawVolumeM3: round(total.totalRawVolumeM3),
    totalWeightKg: round(total.totalWeightKg),
    firstBoxFillPercent: round(fillPercent),
    firstBoxRawFillPercent: round(rawFillPercent),
    firstBoxOccupiedVolumeM3: round(firstPackedOccupiedVolume),
    firstBoxRemainingVolumeM3: round(Math.max(0, remainingVolume)),
    estimatedBoxes: multi.estimated,
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
    packedBoxes: multi.packedBoxes.map((box, index) => ({
      index: index + 1,
      strategyId: box.strategyId,
      strategyName: box.strategyName,
      strategySummary: box.strategySummary,
      placed: box.placed.map(toPlacementDto),
      unplacedUnitKeys: box.unplaced.map((unit) => unit.unitKey)
    }))
  };
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

  for (let boxIndex = 0; remaining.length && boxIndex < MAX_DETAILED_BOXES; boxIndex += 1) {
    const packed = packContainer(container, remaining);
    if (boxIndex === 0) firstBox = packed;
    if (!packed.placed.length) {
      fatalOversize = true;
      break;
    }
    packedBoxes.push(packed);
    const placedIds = new Set(packed.placed.map((unit) => unit.unitKey));
    remaining = remaining.filter((unit) => !placedIds.has(unit.unitKey));
  }

  let boxes = packedBoxes.length;
  if (remaining.length && packedBoxes.length) {
    const averagePlaced = Math.max(1, Math.round(packedBoxes.reduce((sum, box) => sum + box.placed.length, 0) / packedBoxes.length));
    boxes += Math.ceil(remaining.length / averagePlaced);
    estimated = true;
    remaining = [];
  }

  return {
    boxes: remaining.length ? -1 : boxes,
    firstBox,
    packedBoxes,
    estimated,
    fatalOversize: fatalOversize || remaining.length > 0
  };
}

function buildUnits(cargos, globalGapCm) {
  const units = [];
  cargos.forEach((cargo, cargoIndex) => {
    const rule = TYPE_RULES[cargo.type] || TYPE_RULES.normal;
    const gap = globalGapCm + rule.extraGapCm;
    const cargoId = cargo.id || `cargo-${cargoIndex}`;
    for (let i = 0; i < Number(cargo.quantity || 0); i += 1) {
      const unit = {
        unitKey: `${cargoId}-${i}`,
        cargoId,
        cargoIndex,
        itemIndex: i,
        name: cargoDisplayName(cargo),
        baseName: cargo.name,
        model: cargo.model || "",
        color: cargo.color || COLORS[cargoIndex % COLORS.length],
        type: cargo.type || "normal",
        baseLengthCm: Number(cargo.lengthCm),
        baseWidthCm: Number(cargo.widthCm),
        baseHeightCm: Number(cargo.heightCm),
        lengthCm: Number(cargo.lengthCm) + gap,
        widthCm: Number(cargo.widthCm) + gap,
        heightCm: Number(cargo.heightCm) + rule.extraGapCm,
        x: 0,
        y: 0,
        z: 0,
        weightKg: Number(cargo.weightKg || 0),
        rotatable: rule.rotatable,
        nonStack: rule.nonStack,
        extraGapCm: rule.extraGapCm,
        globalGapCm,
        verticalGapCm: rule.extraGapCm,
        gapCm: gap,
        volumeM3: Number(cargo.lengthCm) * Number(cargo.widthCm) * Number(cargo.heightCm) / 1_000_000
      };
      unit.orientations = generateOrientations(unit);
      units.push(unit);
    }
  });
  return orderUnits(units, "support");
}

function generateOrientations(unit, options = {}) {
  const base = [
    { lengthCm: unit.lengthCm, widthCm: unit.widthCm, heightCm: unit.heightCm, lengthAxis: "长", widthAxis: "宽", heightAxis: "高" }
  ];
  if (unit.rotatable) {
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
  for (const strategy of SEARCH_STRATEGIES) {
    const ordered = orderUnits(units, strategy.unitOrder);
    let attempt = packLayerLaff(container, ordered, strategy);
    if (attempt.unplaced.length) {
      attempt = repairWithLocalSearch(container, attempt, ordered, strategy);
    }
    attempts.push(attempt);
    if (!attempt.unplaced.length) break;
  }

  return attempts.sort(comparePackAttempt(container))[0]
    || makePackedBox([], units, { id: "none", name: "无可行摆放" }, { localSearchPasses: 0, repairedCount: 0 });
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
      const score = placementScore(placement, unit, container, strategy);
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
  for (const box of placed) {
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
      placedCount: placed.length,
      unplacedCount: unplaced.length,
      occupiedVolumeM3: round(sumOccupiedVolumeM3(placed)),
      maxTopCm: round(maxTop(placed)),
      refillPlacedCount: Number(stats.repairedCount || 0),
      refillPasses: Number(stats.localSearchPasses || 0),
      layerCount: Number(stats.layerCount || countLayers(placed))
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
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    const occupiedDiff = sumOccupiedVolumeM3(b.placed) - sumOccupiedVolumeM3(a.placed);
    if (Math.abs(occupiedDiff) > EPS) return occupiedDiff;
    const supportDiff = supportSurfaceScore(b.placed, container) - supportSurfaceScore(a.placed, container);
    if (Math.abs(supportDiff) > EPS) return supportDiff;
    const topDiff = maxTop(a.placed) - maxTop(b.placed);
    if (Math.abs(topDiff) > EPS) return topDiff;
    return a.unplaced.length - b.unplaced.length;
  };
}

function placementScore(placement, unit, container, strategy) {
  const top = placement.z + placement.heightCm;
  const front = placement.y + placement.widthCm;
  const right = placement.x + placement.lengthCm;
  const area = placement.lengthCm * placement.widthCm;
  const supportBonus = unit.nonStack ? 0 : area * Math.max(0, 1 - top / Math.max(1, container.heightCm));
  const verticalPenalty = strategy.blueVertical && shouldPreferVertical(unit) ? -placement.heightCm * 100 : 0;
  return top * 1_000_000 + front * 1_000 + right - supportBonus + verticalPenalty;
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
  copy.lengthCm = Number(copy.baseLengthCm) + Number(copy.gapCm || 0);
  copy.widthCm = Number(copy.baseWidthCm) + Number(copy.gapCm || 0);
  copy.heightCm = Number(copy.baseHeightCm) + Number(copy.verticalGapCm || 0);
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
    acc.totalRawVolumeM3 += Number(cargo.lengthCm) * Number(cargo.widthCm) * Number(cargo.heightCm) * Number(cargo.quantity || 0) / 1_000_000;
    acc.totalWeightKg += Number(cargo.weightKg || 0) * Number(cargo.quantity || 0);
    return acc;
  }, { totalRawVolumeM3: 0, totalWeightKg: 0 });
}

function cargoDisplayName(cargo) {
  const name = String(cargo.name || "").trim() || "未命名货物";
  const model = String(cargo.model || "").trim();
  return model ? `${name} ${model}` : name;
}

function compareEvaluation(a, b) {
  if (a.fatalOversize !== b.fatalOversize) return a.fatalOversize ? 1 : -1;
  if (a.boxes !== b.boxes) return a.boxes - b.boxes;
  if (b.firstBoxFillPercent !== a.firstBoxFillPercent) return b.firstBoxFillPercent - a.firstBoxFillPercent;
  return volumeM3(a.container) - volumeM3(b.container);
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
      "Worker 将每类货物按数量展开为单件，保留前端展示需要的 DTO 字段",
      "每个箱型独立运行多轮 LAFF 搜索，分别尝试大底面积、高度、承重优先、不可重压最后和蓝色/小件竖放策略",
      "每个 LAFF 层内使用 Extreme Point 候选点回填底部、顶部和侧边空隙",
      "候选落位必须满足边界、不相交、底面支撑和不可重压货物不承载上层货物",
      "首轮失败时执行局部搜索，移出一小组已摆货物与剩余货物重排，而不是立刻开启第二箱",
      "同一箱型选择已摆数量更多、占用体积更高、承重支撑面更好的方案",
      "所有箱型按箱数更少、首箱占用更高、箱型体积更小排序推荐"
    ],
    strategies: SEARCH_STRATEGIES.map((strategy) => strategy.name),
    selectedStrategy: firstBox.strategyName || "",
    supportRatioPercent: round(SUPPORT_RATIO * 100),
    parameters: {
      utilizationPercent: metrics.utilizationPercent,
      globalGapCm: metrics.globalGapCm,
      unitCount: units.length,
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
      finalBoxes: metrics.boxes
    },
    firstBox: {
      placedCount: firstBox.placed.length,
      unplacedCount: firstBox.unplaced.length,
      maxTopCm: round(maxTop(firstBox.placed)),
      strategyId: firstBox.strategyId || "",
      strategyName: firstBox.strategyName || ""
    },
    boxStrategies: multi.packedBoxes.map((box, index) => ({
      boxIndex: index + 1,
      strategyName: box.strategyName || "",
      placedCount: box.placed.length,
      unplacedCount: box.unplaced.length,
      occupiedVolumeM3: round(sumOccupiedVolumeM3(box.placed)),
      maxTopCm: round(maxTop(box.placed))
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

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function round3(value) {
  return Number.isNaN(value) ? value : Math.round(Number(value || 0) * 1000) / 1000;
}

function copyUnit(unit) {
  return { ...unit, orientations: unit.orientations ? unit.orientations.map((item) => ({ ...item })) : undefined };
}
