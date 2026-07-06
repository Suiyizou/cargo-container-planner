export const defaultContainers = [
  {
    id: "20gp",
    name: "20GP 普柜",
    lengthCm: 590,
    widthCm: 235.2,
    heightCm: 239.5,
    payloadKg: 28130,
    dimensionSource: "Hapag-Lloyd 20' Standard",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/20-standard.html",
    dimensionBasis: "Inside Dimension",
    dimensionNote: "公开规格为名义内尺寸，实际柜号可能因制造批次存在公差。",
    usagePriority: "common",
    visualKind: "dry",
    ignoreHeightLimit: false
  },
  {
    id: "20hq",
    name: "20HQ 高柜",
    lengthCm: 589.8,
    widthCm: 235.2,
    heightCm: 268.9,
    payloadKg: 28340,
    dimensionSource: "Triton 20ft High Cube Dry",
    dimensionSourceUrl: "https://www.tritoncontainer.com/products/20ft-high-cube-dry-containers",
    dimensionBasis: "Internal Dimensions",
    dimensionNote: "20HQ 不是最常见海运标配，订舱前请按实际设备确认。",
    usagePriority: "common",
    visualKind: "high-cube",
    ignoreHeightLimit: false
  },
  {
    id: "20fr",
    name: "20FR 平板柜",
    lengthCm: 563.8,
    widthCm: 243.8,
    heightCm: 223.3,
    payloadKg: 42100,
    dimensionSource: "Hapag-Lloyd 20' Flatrack",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/20-flatrack.html",
    dimensionBasis: "Inside Dimension / Min. Width",
    dimensionNote: "平板柜为开放设备；系统默认不按箱体高度硬拦截，来源地板宽 219.4cm，超宽超高需按船司 OOG 与绑扎方案复核。",
    usagePriority: "special",
    visualKind: "flat-rack",
    ignoreHeightLimit: true
  },
  {
    id: "40gp",
    name: "40GP 普柜",
    lengthCm: 1203.2,
    widthCm: 235.2,
    heightCm: 239.5,
    payloadKg: 28750,
    dimensionSource: "Hapag-Lloyd 40' Standard",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/40-standard.html",
    dimensionBasis: "Inside Dimension",
    dimensionNote: "公开规格为名义内尺寸，实际柜号可能因制造批次存在公差。",
    usagePriority: "common",
    visualKind: "dry",
    ignoreHeightLimit: false
  },
  {
    id: "40hq",
    name: "40HQ 高柜",
    lengthCm: 1203.2,
    widthCm: 235,
    heightCm: 270,
    payloadKg: 28600,
    dimensionSource: "Hapag-Lloyd 40' Standard High Cube",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/40-standard-high-cube.html",
    dimensionBasis: "Inside Dimension",
    dimensionNote: "公开规格为名义内尺寸，实际柜号可能因制造批次存在公差。",
    usagePriority: "common",
    visualKind: "high-cube",
    ignoreHeightLimit: false
  },
  {
    id: "40fr",
    name: "40FR 平板柜",
    lengthCm: 1165.2,
    widthCm: 234.7,
    heightCm: 226.5,
    payloadKg: 49100,
    dimensionSource: "Hapag-Lloyd 40' Flatrack High Cube",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/40-flatrack-high-cube.html",
    dimensionBasis: "Inside Dimension / Min. Width",
    dimensionNote: "平板柜为开放设备；系统默认不按箱体高度硬拦截，来源地板宽 224.5cm，超宽超高需按船司 OOG 与绑扎方案复核。",
    usagePriority: "special",
    visualKind: "flat-rack",
    ignoreHeightLimit: true
  },
  {
    id: "20rf",
    name: "20RF 冷藏柜",
    lengthCm: 545,
    widthCm: 228,
    heightCm: 215.9,
    payloadKg: 29140,
    dimensionSource: "Hapag-Lloyd 20' Reefer",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/20-reefer.html",
    dimensionBasis: "Inside Dimension",
    dimensionNote: "冷藏柜属于特殊设备；普通货和冷藏设备类货物优先尝试普柜/高柜，只有温控运输才建议选 RF。",
    usagePriority: "special",
    visualKind: "reefer",
    ignoreHeightLimit: false
  },
  {
    id: "40rf",
    name: "40RF 冷藏高柜",
    lengthCm: 1159.9,
    widthCm: 229,
    heightCm: 242.5,
    payloadKg: 29580,
    dimensionSource: "Hapag-Lloyd 40' Reefer High Cube",
    dimensionSourceUrl: "https://www.hapag-lloyd.com/en/services-information/cargo-fleet/container/40-reefer-high-cube.html",
    dimensionBasis: "Inside Dimension",
    dimensionNote: "冷藏柜属于特殊设备；普通货和冷藏设备类货物优先尝试普柜/高柜，只有温控运输才建议选 RF。",
    usagePriority: "special",
    visualKind: "reefer",
    ignoreHeightLimit: false
  }
];

const defaultContainerProfiles = {
  "20gp": { costFactor: 1, referencePrice: 1000, priceTier: "economy", equipmentClass: "GP" },
  "20hq": { costFactor: 1.08, referencePrice: 1080, priceTier: "economy", equipmentClass: "HQ" },
  "40gp": { costFactor: 1.55, referencePrice: 1550, priceTier: "standard", equipmentClass: "GP" },
  "40hq": { costFactor: 1.68, referencePrice: 1680, priceTier: "standard", equipmentClass: "HQ" },
  "20rf": { costFactor: 1.65, referencePrice: 1650, priceTier: "standard", equipmentClass: "RF" },
  "40rf": { costFactor: 2.45, referencePrice: 2450, priceTier: "special", equipmentClass: "RF" },
  "20fr": { costFactor: 2.15, referencePrice: 2150, priceTier: "high", equipmentClass: "FR" },
  "40fr": { costFactor: 3.2, referencePrice: 3200, priceTier: "special", equipmentClass: "FR" }
};

const defaultContainerById = new Map(defaultContainers.map((item) => [item.id, item]));
const removedDefaultContainerIds = new Set(["45hq"]);
const defaultDimensionFields = [
  "name",
  "lengthCm",
  "widthCm",
  "heightCm",
  "payloadKg",
  "dimensionSource",
  "dimensionSourceUrl",
  "dimensionBasis",
  "dimensionNote",
  "usagePriority",
  "visualKind",
  "ignoreHeightLimit"
];

function withDefaultProfile(container, options = {}) {
  const defaultContainer = defaultContainerById.get(container?.id);
  const profile = defaultContainerProfiles[container?.id] || {};
  const next = {
    ...profile,
    ...container,
    costFactor: container?.costFactor ?? profile.costFactor,
    referencePrice: container?.referencePrice ?? profile.referencePrice,
    priceTier: container?.priceTier ?? profile.priceTier,
    equipmentClass: container?.equipmentClass ?? profile.equipmentClass
  };
  if (defaultContainer && options.refreshDefaultDimensions && !container?.dimensionEdited) {
    defaultDimensionFields.forEach((field) => {
      next[field] = defaultContainer[field];
    });
  }
  return next;
}

export function cloneDefaultContainers() {
  return defaultContainers.map((item) => withDefaultProfile(item));
}

export function mergeDefaultContainers(containers = []) {
  const existing = Array.isArray(containers)
    ? containers.filter((item) => item && !removedDefaultContainerIds.has(item.id))
    : [];
  if (!existing.length) return cloneDefaultContainers();
  const defaultIds = new Set(defaultContainers.map((item) => item.id));
  if (!existing.some((item) => defaultIds.has(item.id))) return existing;
  const existingWithProfiles = existing.map((item) => withDefaultProfile(item, { refreshDefaultDimensions: true }));
  const existingIds = new Set(existingWithProfiles.map((item) => item.id));
  const missingDefaults = defaultContainers
    .filter((item) => !existingIds.has(item.id))
    .map((item) => withDefaultProfile(item));
  return [...existingWithProfiles, ...missingDefaults];
}

export function isDefaultContainerId(id) {
  return defaultContainerById.has(id);
}

export function defaultContainerForId(id) {
  const container = defaultContainerById.get(id);
  return container ? withDefaultProfile(container) : null;
}

export function restoreDefaultContainer(container) {
  const restored = defaultContainerForId(container?.id);
  return restored || container;
}
