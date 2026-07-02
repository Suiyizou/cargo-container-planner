import type { ContainerLike, PlacementLike, SceneCargo, SceneData, SceneLegendItem, SceneStats } from "./packingSceneTypes";

const FALLBACK_COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];

export function buildPackingSceneData(options: {
  container: ContainerLike | null;
  placements?: PlacementLike[];
  evaluation?: any;
}): SceneData {
  const container = normalizeContainer(options.container);
  const colorMap = new Map<string, string>();
  const cargos = (options.placements || []).map((placement, index) => normalizeCargo(placement, index, colorMap));
  const legend = buildLegend(cargos);
  const stats = buildStats(container, cargos, options.evaluation);
  const scale = container
    ? 12 / Math.max(1, Number(container.lengthCm || 0), Number(container.widthCm || 0), Number(container.heightCm || 0))
    : 1;

  return { container, cargos, legend, stats, scale };
}

export function formatWeight(value = 0) {
  const weight = Number(value || 0);
  if (weight >= 1000) return `${(weight / 1000).toFixed(2)} t`;
  return `${Math.round(weight)} kg`;
}

export function formatSigned(value = 0, digits = 1) {
  const rounded = Number(value || 0);
  const text = rounded.toFixed(digits);
  return rounded > 0 ? `+${text}` : text;
}

export function formatDimension(value = 0) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? `${number}` : number.toFixed(1);
}

function normalizeContainer(container: ContainerLike | null): ContainerLike | null {
  if (!container) return null;
  return {
    ...container,
    lengthCm: Number(container.lengthCm || 0),
    widthCm: Number(container.widthCm || 0),
    heightCm: Number(container.heightCm || 0),
    payloadKg: Number(container.payloadKg || 0)
  };
}

function normalizeCargo(placement: PlacementLike, index: number, colorMap: Map<string, string>): SceneCargo {
  const skuKey = String(placement.sku || placement.model || placement.cargoId || placement.name || `sku-${index}`);
  if (!colorMap.has(skuKey)) {
    colorMap.set(skuKey, placement.color || FALLBACK_COLORS[colorMap.size % FALLBACK_COLORS.length]);
  }
  const lengthCm = Number(placement.lengthCm || 0);
  const widthCm = Number(placement.widthCm || 0);
  const heightCm = Number(placement.heightCm || 0);
  const xCm = Number(placement.xCm || 0);
  const yCm = Number(placement.yCm || 0);
  const zCm = Number(placement.zCm || 0);
  const quantity = Math.max(1, Number(placement.groupQuantity || 1));
  const displayNo = placement.unitKey
    ? String(placement.unitKey).replace(/^unit-?/i, "")
    : String(index + 1).padStart(3, "0");

  return {
    ...placement,
    key: placement.unitKey || placement.id || `${skuKey}-${index}`,
    skuKey,
    skuLabel: placement.model ? `${placement.name} ${placement.model}` : placement.name || skuKey,
    displayNo,
    color: colorMap.get(skuKey) || placement.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    quantity,
    xCm,
    yCm,
    zCm,
    lengthCm,
    widthCm,
    heightCm,
    weightKg: Number(placement.weightKg || 0),
    center: {
      xCm: xCm + lengthCm / 2,
      yCm: yCm + widthCm / 2,
      zCm: zCm + heightCm / 2
    },
    volumeM3: lengthCm * widthCm * heightCm / 1_000_000
  };
}

function buildLegend(cargos: SceneCargo[]): SceneLegendItem[] {
  const map = new Map<string, SceneLegendItem>();
  cargos.forEach((cargo) => {
    const current = map.get(cargo.skuKey);
    if (current) {
      current.quantity += cargo.quantity;
      current.weightKg += Number(cargo.weightKg || 0);
      return;
    }
    map.set(cargo.skuKey, {
      key: cargo.skuKey,
      label: cargo.skuLabel,
      name: cargo.name,
      color: cargo.color,
      quantity: cargo.quantity,
      weightKg: Number(cargo.weightKg || 0)
    });
  });
  return [...map.values()];
}

function buildStats(container: ContainerLike | null, cargos: SceneCargo[], evaluation: any): SceneStats {
  const totalPieces = cargos.reduce((sum, cargo) => sum + cargo.quantity, 0);
  const totalVolumeM3 = cargos.reduce((sum, cargo) => sum + cargo.volumeM3, 0);
  const totalWeightKg = cargos.reduce((sum, cargo) => sum + Number(cargo.weightKg || 0), 0);
  const containerVolumeM3 = container
    ? Number(container.lengthCm || 0) * Number(container.widthCm || 0) * Number(container.heightCm || 0) / 1_000_000
    : 0;
  const utilizationPercent = Number.isFinite(Number(evaluation?.firstBoxFillPercent))
    ? Number(evaluation.firstBoxFillPercent)
    : containerVolumeM3 > 0 ? totalVolumeM3 / containerVolumeM3 * 100 : 0;

  return {
    totalPieces,
    totalVolumeM3,
    totalWeightKg,
    utilizationPercent,
    cargoCount: cargos.length,
    performanceMode: cargos.length > 100
  };
}
