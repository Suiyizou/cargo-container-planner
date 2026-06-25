const TYPE_RULES = {
  normal: { rotatable: true, nonStack: false, extraGapCm: 0 },
  upright: { rotatable: false, nonStack: false, extraGapCm: 1 },
  nonstack: { rotatable: true, nonStack: true, extraGapCm: 2 },
  pallet: { rotatable: false, nonStack: false, extraGapCm: 3 }
};

const COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];
const MAX_EXHAUSTIVE_CANDIDATES = 1200;
const MAX_BOUNDED_CANDIDATES = 320;
const MAX_AXIS_VALUES = 8;
const MAX_Z_LEVELS = 6;
const SUPPORT_RATIO = 0.985;
const ORDER_STRATEGIES = [
  { id: "support-first", name: "承重优先：可堆放货物先铺底，不可重压货物后上层" },
  { id: "volume-desc", name: "体积优先：含间隙体积从大到小" },
  { id: "footprint-desc", name: "底面积优先：更大底面先形成支撑面" },
  { id: "height-desc", name: "高度优先：高件先定位" }
];

self.onmessage = (event) => {
  const { id, payload } = event.data || {};
  try {
    const result = calculate(payload);
    self.postMessage({ id, type: "result", result });
  } catch (error) {
    self.postMessage({ id, type: "error", message: error.message || "本机计算失败" });
  }
};

function calculate(request) {
  const globalGapCm = safeGlobalGapCm(request.globalGapCm);
  const units = expandUnits(request.cargos || [], globalGapCm);
  const total = totals(request.cargos || []);
  const utilization = safeUtilizationPercent(request.utilizationPercent);
  const evaluations = (request.containers || [])
    .map((container) => evaluateContainer(container, units, total, utilization, globalGapCm))
    .sort(compareEvaluation);
  return {
    bestContainerId: evaluations[0]?.container.id || null,
    evaluations
  };
}

function evaluateContainer(container, units, total, utilizationPercent, globalGapCm) {
  const multi = packMultiple(container, units);
  const usableVolume = volumeM3(container) * utilizationPercent / 100;
  const firstPackedRawVolume = multi.firstBox.placed.reduce((sum, unit) => sum + unit.volumeM3, 0);
  const firstPackedOccupiedVolume = multi.firstBox.placed.reduce((sum, unit) => sum + occupiedVolumeM3(unit), 0);
  const fillPercent = usableVolume > 0 ? firstPackedOccupiedVolume / usableVolume * 100 : 0;
  const rawFillPercent = usableVolume > 0 ? firstPackedRawVolume / usableVolume * 100 : 0;
  const remainingVolume = usableVolume - firstPackedOccupiedVolume;
  const weightBoxes = container.payloadKg > 0 ? Math.ceil(total.totalWeightKg / container.payloadKg) : 0;
  const boxes = multi.fatalOversize ? -1 : Math.max(multi.boxes, weightBoxes);

  return {
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
}

function packMultiple(container, allUnits) {
  let remaining = allUnits.map(copyUnit);
  const packedBoxes = [];
  let firstBox = { placed: [], unplaced: remaining };
  let fatalOversize = false;
  let boxes = 0;
  let estimated = false;
  const maxBoxes = 100;
  const detailLimit = detailedBoxLimit(allUnits.length);

  while (remaining.length && boxes < maxBoxes) {
    const packed = packSingle(container, remaining);
    if (boxes === 0) firstBox = packed;
    if (!packed.placed.length) {
      fatalOversize = true;
      break;
    }
    packedBoxes.push(packed);
    const placedIds = new Set(packed.placed.map((unit) => unit.unitKey));
    remaining = remaining.filter((unit) => !placedIds.has(unit.unitKey));
    boxes += 1;
    if (remaining.length && boxes >= detailLimit) {
      const averagePlaced = Math.max(1, Math.round(packedBoxes.reduce((sum, box) => sum + box.placed.length, 0) / packedBoxes.length));
      boxes += Math.ceil(remaining.length / averagePlaced);
      estimated = true;
      remaining = [];
      break;
    }
  }

  return {
    boxes: remaining.length ? -1 : boxes,
    firstBox,
    packedBoxes,
    estimated,
    fatalOversize: fatalOversize || remaining.length > 0
  };
}

function detailedBoxLimit(totalUnits) {
  if (totalUnits > 180) return 1;
  if (totalUnits > 100) return 2;
  return 6;
}

function packSingle(container, units) {
  const attempts = ORDER_STRATEGIES.map((strategy) => packSingleWithOrder(container, orderUnits(units, strategy.id), strategy));
  return attempts.sort(comparePackAttempt(container))[0] || { placed: [], unplaced: units, strategyId: "none", strategyName: "无可行摆放" };
}

function packSingleWithOrder(container, units, strategy) {
  const placed = [];
  const unplaced = [];

  for (const unit of units) {
    const placement = findPlacement(unit, placed, container);
    if (!placement) {
      unplaced.push(unit);
      continue;
    }
    placed.push({
      ...unit,
      x: placement.x,
      y: placement.y,
      z: placement.z,
      lengthCm: placement.lengthCm,
      widthCm: placement.widthCm,
      heightCm: placement.heightCm,
      lengthAxis: placement.lengthAxis,
      widthAxis: placement.widthAxis,
      heightAxis: placement.heightAxis
    });
  }

  return {
    placed,
    unplaced,
    strategyId: strategy.id,
    strategyName: strategy.name,
    strategySummary: {
      placedCount: placed.length,
      unplacedCount: unplaced.length,
      occupiedVolumeM3: round(placed.reduce((sum, unit) => sum + occupiedVolumeM3(unit), 0)),
      maxTopCm: round(maxTop(placed))
    }
  };
}

function findPlacement(unit, placed, container) {
  let best = null;
  for (const dims of orientations(unit)) {
    if (dims.lengthCm > container.lengthCm || dims.widthCm > container.widthCm || dims.heightCm > container.heightCm) continue;
    for (const position of candidatePositions(placed, container, dims)) {
      if (!fitsAt(position, dims, placed, container)) continue;
      if (!hasSupport(position, dims, placed)) continue;
      const score = placementScore(position, dims, container);
      if (!best || score < best.score) best = { ...position, ...dims, score };
      break;
    }
  }
  return best;
}

function candidatePositions(placed, container, dims) {
  const xs = uniqueSorted(placed.map((unit) => unit.x + unit.lengthCm), 0);
  const ys = uniqueSorted(placed.map((unit) => unit.y + unit.widthCm), 0);
  const zs = uniqueSorted(placed.map((unit) => unit.z + unit.heightCm), 0);
  const possibleCount = xs.length * ys.length * zs.length;
  if (possibleCount > MAX_EXHAUSTIVE_CANDIDATES) {
    return boundedCandidatePositions(placed, container, dims, xs, ys, zs);
  }
  const points = [];
  for (const z of zs) {
    if (z + dims.heightCm > container.heightCm + 0.0001) continue;
    for (const y of ys) {
      if (y + dims.widthCm > container.widthCm + 0.0001) continue;
      for (const x of xs) {
        if (x + dims.lengthCm <= container.lengthCm + 0.0001) points.push({ x, y, z });
      }
    }
  }
  return points.sort((a, b) => placementScore(a, dims, container) - placementScore(b, dims, container));
}

function boundedCandidatePositions(placed, container, dims, xs, ys, zs) {
  const points = new Map();
  const add = (x, y, z) => {
    if (x < -0.0001 || y < -0.0001 || z < -0.0001) return;
    if (x + dims.lengthCm > container.lengthCm + 0.0001) return;
    if (y + dims.widthCm > container.widthCm + 0.0001) return;
    if (z + dims.heightCm > container.heightCm + 0.0001) return;
    const point = { x: round3(x), y: round3(y), z: round3(z) };
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
  }

  const limitedXs = xs.filter((x) => x + dims.lengthCm <= container.lengthCm + 0.0001).slice(0, MAX_AXIS_VALUES);
  const limitedYs = ys.filter((y) => y + dims.widthCm <= container.widthCm + 0.0001).slice(0, MAX_AXIS_VALUES);
  const limitedZs = zs.filter((z) => z + dims.heightCm <= container.heightCm + 0.0001).slice(0, MAX_Z_LEVELS);
  for (const z of limitedZs) {
    for (const y of limitedYs) {
      for (const x of limitedXs) add(x, y, z);
    }
  }

  return [...points.values()]
    .sort((a, b) => placementScore(a, dims, container) - placementScore(b, dims, container))
    .slice(0, MAX_BOUNDED_CANDIDATES);
}

function fitsAt(position, dims, placed, container) {
  if (position.x < 0 || position.y < 0 || position.z < 0) return false;
  if (position.x + dims.lengthCm > container.lengthCm + 0.0001) return false;
  if (position.y + dims.widthCm > container.widthCm + 0.0001) return false;
  if (position.z + dims.heightCm > container.heightCm + 0.0001) return false;
  const candidate = { ...position, ...dims };
  return !placed.some((box) => intersects(candidate, box));
}

function intersects(a, b) {
  return a.x < b.x + b.lengthCm - 0.0001 && a.x + a.lengthCm > b.x + 0.0001
    && a.y < b.y + b.widthCm - 0.0001 && a.y + a.widthCm > b.y + 0.0001
    && a.z < b.z + b.heightCm - 0.0001 && a.z + a.heightCm > b.z + 0.0001;
}

function hasSupport(position, dims, placed) {
  if (position.z <= 0.0001) return true;
  const target = { x: position.x, y: position.y, lengthCm: dims.lengthCm, widthCm: dims.widthCm };
  const supports = placed
    .filter((box) => !box.nonStack && Math.abs(box.z + box.heightCm - position.z) < 0.0001)
    .map((box) => overlapRect(target, { x: box.x, y: box.y, lengthCm: box.lengthCm, widthCm: box.widthCm }))
    .filter(Boolean);
  if (!supports.length) return false;
  return unionArea(supports) >= dims.lengthCm * dims.widthCm * SUPPORT_RATIO;
}

function overlapRect(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.lengthCm, b.x + b.lengthCm);
  const y2 = Math.min(a.y + a.widthCm, b.y + b.widthCm);
  if (x2 <= x1 || y2 <= y1) return null;
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
    if (width <= 0) continue;
    const spans = rects
      .filter((rect) => rect.x < x2 && rect.x + rect.lengthCm > x1)
      .map((rect) => [rect.y, rect.y + rect.widthCm])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let start = null;
    let end = 0;
    for (const span of spans) {
      if (start === null) {
        start = span[0];
        end = span[1];
      } else if (span[0] <= end) {
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

function placementScore(position, dims, container) {
  const top = position.z + dims.heightCm;
  const front = position.y + dims.widthCm;
  const right = position.x + dims.lengthCm;
  return top * 1_000_000 + front * 1_000 + right + (container.lengthCm - right) * 0.01;
}

function orderUnits(units, strategyId) {
  return [...units].sort((a, b) => {
    if (strategyId === "support-first" && a.nonStack !== b.nonStack) return a.nonStack ? 1 : -1;
    if (strategyId === "footprint-desc") {
      const areaDiff = unitFootprintCm2(b) - unitFootprintCm2(a);
      if (Math.abs(areaDiff) > 0.0001) return areaDiff;
    } else if (strategyId === "height-desc") {
      const heightDiff = b.heightCm - a.heightCm;
      if (Math.abs(heightDiff) > 0.0001) return heightDiff;
    }
    const volumeDiff = unitVolumeCm3(b) - unitVolumeCm3(a);
    if (Math.abs(volumeDiff) > 0.0001) return volumeDiff;
    const areaDiff = unitFootprintCm2(b) - unitFootprintCm2(a);
    if (Math.abs(areaDiff) > 0.0001) return areaDiff;
    if (a.cargoIndex !== b.cargoIndex) return a.cargoIndex - b.cargoIndex;
    return a.itemIndex - b.itemIndex;
  });
}

function comparePackAttempt(container) {
  return (a, b) => {
    if (a.placed.length !== b.placed.length) return b.placed.length - a.placed.length;
    const occupiedDiff = sumOccupiedVolumeM3(b.placed) - sumOccupiedVolumeM3(a.placed);
    if (Math.abs(occupiedDiff) > 0.0001) return occupiedDiff;
    const rawDiff = sumRawVolumeM3(b.placed) - sumRawVolumeM3(a.placed);
    if (Math.abs(rawDiff) > 0.0001) return rawDiff;
    const supportDiff = supportSurfaceScore(b.placed, container) - supportSurfaceScore(a.placed, container);
    if (Math.abs(supportDiff) > 0.0001) return supportDiff;
    return maxTop(a.placed) - maxTop(b.placed);
  };
}

function supportSurfaceScore(placed, container) {
  if (!placed.length) return 0;
  return placed
    .filter((unit) => !unit.nonStack)
    .reduce((score, unit) => {
      const top = unit.z + unit.heightCm;
      const normalizedHeight = container.heightCm > 0 ? 1 - top / container.heightCm : 0;
      return score + unit.lengthCm * unit.widthCm * Math.max(0, normalizedHeight);
    }, 0);
}

function unitVolumeCm3(unit) {
  return Number(unit.lengthCm || 0) * Number(unit.widthCm || 0) * Number(unit.heightCm || 0);
}

function unitFootprintCm2(unit) {
  return Number(unit.lengthCm || 0) * Number(unit.widthCm || 0);
}

function sumOccupiedVolumeM3(units) {
  return units.reduce((sum, unit) => sum + occupiedVolumeM3(unit), 0);
}

function sumRawVolumeM3(units) {
  return units.reduce((sum, unit) => sum + Number(unit.volumeM3 || 0), 0);
}

function maxTop(units) {
  return units.length ? Math.max(...units.map((unit) => Number(unit.z || 0) + Number(unit.heightCm || 0))) : 0;
}

function orientations(unit) {
  const result = [{
    lengthCm: unit.lengthCm,
    widthCm: unit.widthCm,
    heightCm: unit.heightCm,
    lengthAxis: "长",
    widthAxis: "宽",
    heightAxis: "高"
  }];
  if (unit.rotatable) {
    result.push(
      { lengthCm: unit.widthCm, widthCm: unit.lengthCm, heightCm: unit.heightCm, lengthAxis: "宽", widthAxis: "长", heightAxis: "高" },
      { lengthCm: unit.lengthCm, widthCm: unit.heightCm, heightCm: unit.widthCm, lengthAxis: "长", widthAxis: "高", heightAxis: "宽" },
      { lengthCm: unit.heightCm, widthCm: unit.lengthCm, heightCm: unit.widthCm, lengthAxis: "高", widthAxis: "长", heightAxis: "宽" },
      { lengthCm: unit.widthCm, widthCm: unit.heightCm, heightCm: unit.lengthCm, lengthAxis: "宽", widthAxis: "高", heightAxis: "长" },
      { lengthCm: unit.heightCm, widthCm: unit.widthCm, heightCm: unit.lengthCm, lengthAxis: "高", widthAxis: "宽", heightAxis: "长" }
    );
  }
  const seen = new Set();
  return result.filter((dims) => {
    const key = `${dims.lengthCm}/${dims.widthCm}/${dims.heightCm}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function expandUnits(cargos, globalGapCm) {
  const units = [];
  cargos.forEach((cargo, cargoIndex) => {
    const rule = TYPE_RULES[cargo.type] || TYPE_RULES.normal;
    const gap = globalGapCm + rule.extraGapCm;
    const cargoId = cargo.id || `cargo-${cargoIndex}`;
    for (let i = 0; i < Number(cargo.quantity || 0); i += 1) {
      units.push({
        unitKey: `${cargoId}-${i}`,
        cargoId,
        cargoIndex,
        itemIndex: i,
        name: cargo.name,
        color: cargo.color || COLORS[cargoIndex % COLORS.length],
        type: cargo.type || "normal",
        baseLengthCm: Number(cargo.lengthCm),
        baseWidthCm: Number(cargo.widthCm),
        baseHeightCm: Number(cargo.heightCm),
        lengthCm: Number(cargo.lengthCm) + gap,
        widthCm: Number(cargo.widthCm) + gap,
        heightCm: Number(cargo.heightCm) + gap,
        x: 0,
        y: 0,
        z: 0,
        weightKg: Number(cargo.weightKg || 0),
        rotatable: rule.rotatable,
        nonStack: rule.nonStack,
        extraGapCm: rule.extraGapCm,
        globalGapCm,
        gapCm: gap,
        volumeM3: Number(cargo.lengthCm) * Number(cargo.widthCm) * Number(cargo.heightCm) / 1_000_000
      });
    }
  });
  return orderUnits(units, "support-first");
}

function totals(cargos) {
  return cargos.reduce((acc, cargo) => {
    acc.totalRawVolumeM3 += Number(cargo.lengthCm) * Number(cargo.widthCm) * Number(cargo.heightCm) * Number(cargo.quantity || 0) / 1_000_000;
    acc.totalWeightKg += Number(cargo.weightKg || 0) * Number(cargo.quantity || 0);
    return acc;
  }, { totalRawVolumeM3: 0, totalWeightKg: 0 });
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
    pipeline: [
      "主线程把货物、箱型、计划可用率、货物间隙复制给 Web Worker",
      "Worker 将每类货物按数量展开为单件，并把全局间隙、类型额外间隙计入外廓尺寸",
      "每个箱型独立试算；每个货舱会尝试多种摆放顺序，而不是只按体积排序",
      "每件货物枚举允许的旋转方向，再扫描候选坐标，满足边界、不相交、支撑面后落位",
      "同一货舱选择已摆数量更多、占用体积更高、可承重支撑面更好的方案",
      "所有箱型按箱数更少、首箱占用更高、箱型体积更小排序推荐"
    ],
    strategies: ORDER_STRATEGIES.map((strategy) => strategy.name),
    selectedStrategy: firstBox.strategyName || "",
    supportRatioPercent: round(SUPPORT_RATIO * 100),
    parameters: {
      utilizationPercent: metrics.utilizationPercent,
      globalGapCm: metrics.globalGapCm,
      unitCount: units.length,
      cargoTypeCounts: countBy(units, "type")
    },
    formulas: [
      "单件原始体积(m³) = 长 × 宽 × 高 ÷ 1,000,000",
      "计入间隙尺寸(cm) = 原始尺寸 + 全局货物间隙 + 类型额外间隙",
      "单件占用体积(m³) = 计入间隙长 × 计入间隙宽 × 计入间隙高 ÷ 1,000,000",
      "箱体体积(m³) = 箱长 × 箱宽 × 箱高 ÷ 1,000,000",
      "计划可用体积(m³) = 箱体体积 × 计划可用率",
      "首箱空间占用率 = 首箱已摆放占用体积 ÷ 计划可用体积 × 100%",
      "重量箱数 = ceil(总重量 ÷ 箱型载重)",
      "推荐箱数 = max(几何装箱箱数, 重量箱数)",
      "上层支撑条件 = 下方可承重重叠面积 ÷ 当前底面积 ≥ 98.5%"
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

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function toPlacementDto(unit) {
  const xAxisBaseCm = axisBaseCm(unit, unit.lengthAxis);
  const yAxisBaseCm = axisBaseCm(unit, unit.widthAxis);
  const zAxisBaseCm = axisBaseCm(unit, unit.heightAxis);
  return {
    unitKey: unit.unitKey,
    cargoId: unit.cargoId,
    name: unit.name,
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

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function round3(value) {
  return Number.isNaN(value) ? value : Math.round(Number(value || 0) * 1000) / 1000;
}

function copyUnit(unit) {
  return { ...unit };
}
