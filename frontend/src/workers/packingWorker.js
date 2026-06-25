const TYPE_RULES = {
  normal: { rotatable: true, nonStack: false, extraGapCm: 0 },
  upright: { rotatable: false, nonStack: false, extraGapCm: 1 },
  nonstack: { rotatable: true, nonStack: true, extraGapCm: 2 },
  pallet: { rotatable: false, nonStack: false, extraGapCm: 3 }
};

const COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];

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
  const units = expandUnits(request.cargos || [], safeGlobalGapCm(request.globalGapCm));
  const total = totals(request.cargos || []);
  const utilization = safeUtilizationPercent(request.utilizationPercent);
  const evaluations = (request.containers || [])
    .map((container) => evaluateContainer(container, units, total, utilization))
    .sort(compareEvaluation);
  return {
    bestContainerId: evaluations[0]?.container.id || null,
    evaluations
  };
}

function evaluateContainer(container, units, total, utilizationPercent) {
  const multi = packMultiple(container, units);
  const usableVolume = volumeM3(container) * utilizationPercent / 100;
  const firstPackedVolume = multi.firstBox.placed.reduce((sum, unit) => sum + unit.volumeM3, 0);
  const fillPercent = usableVolume > 0 ? firstPackedVolume / usableVolume * 100 : 0;
  const remainingVolume = usableVolume - firstPackedVolume;
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
    firstBoxRemainingVolumeM3: round(Math.max(0, remainingVolume)),
    packedBoxes: multi.packedBoxes.map((box, index) => ({
      index: index + 1,
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
  const maxBoxes = 30;

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
  }

  return {
    boxes: remaining.length ? -1 : boxes,
    firstBox,
    packedBoxes,
    fatalOversize: fatalOversize || remaining.length > 0
  };
}

function packSingle(container, units) {
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
      heightCm: placement.heightCm
    });
  }

  return { placed, unplaced };
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
    }
  }
  return best;
}

function candidatePositions(placed, container, dims) {
  const xs = uniqueSorted(placed.map((unit) => unit.x + unit.lengthCm), 0);
  const ys = uniqueSorted(placed.map((unit) => unit.y + unit.widthCm), 0);
  const zs = uniqueSorted(placed.map((unit) => unit.z + unit.heightCm), 0);
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
  return points;
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
  return unionArea(supports) >= dims.lengthCm * dims.widthCm * 0.985;
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

function orientations(unit) {
  const result = [{ lengthCm: unit.lengthCm, widthCm: unit.widthCm, heightCm: unit.heightCm }];
  if (unit.rotatable) {
    result.push(
      { lengthCm: unit.widthCm, widthCm: unit.lengthCm, heightCm: unit.heightCm },
      { lengthCm: unit.lengthCm, widthCm: unit.heightCm, heightCm: unit.widthCm },
      { lengthCm: unit.heightCm, widthCm: unit.lengthCm, heightCm: unit.widthCm },
      { lengthCm: unit.widthCm, widthCm: unit.heightCm, heightCm: unit.lengthCm },
      { lengthCm: unit.heightCm, widthCm: unit.widthCm, heightCm: unit.lengthCm }
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
        volumeM3: Number(cargo.lengthCm) * Number(cargo.widthCm) * Number(cargo.heightCm) / 1_000_000
      });
    }
  });
  units.sort((a, b) => b.lengthCm * b.widthCm * b.heightCm - a.lengthCm * a.widthCm * a.heightCm);
  return units;
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

function toPlacementDto(unit) {
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
    xCm: round(unit.x),
    yCm: round(unit.y),
    zCm: round(unit.z),
    weightKg: round(unit.weightKg),
    nonStack: unit.nonStack
  };
}

function volumeM3(container) {
  return Number(container.lengthCm) * Number(container.widthCm) * Number(container.heightCm) / 1_000_000;
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
