export const defaultContainers = [
  { id: "20gp", name: "20GP 普柜", lengthCm: 590, widthCm: 235, heightCm: 239, payloadKg: 28200 },
  { id: "20hq", name: "20HQ 高柜", lengthCm: 590, widthCm: 235, heightCm: 270, payloadKg: 27800 },
  // Flat racks are open equipment; widthCm/heightCm are OOG planning envelopes, not closed inner dimensions.
  { id: "20fr", name: "20FR 平板柜", lengthCm: 564, widthCm: 260, heightCm: 420, payloadKg: 42100 },
  { id: "40gp", name: "40GP 普柜", lengthCm: 1203, widthCm: 235, heightCm: 239, payloadKg: 26700 },
  { id: "40hq", name: "40HQ 高柜", lengthCm: 1203, widthCm: 235, heightCm: 270, payloadKg: 26500 },
  { id: "40fr", name: "40FR 平板柜", lengthCm: 1219, widthCm: 260, heightCm: 420, payloadKg: 49100 },
  { id: "45hq", name: "45HQ 高柜", lengthCm: 1356, widthCm: 235, heightCm: 270, payloadKg: 28600 },
  { id: "20rf", name: "20RF 冷藏柜", lengthCm: 545, widthCm: 229, heightCm: 226, payloadKg: 27000 },
  { id: "40rf", name: "40RF 冷藏高柜", lengthCm: 1156, widthCm: 229, heightCm: 250, payloadKg: 29000 }
];

const defaultContainerProfiles = {
  "20gp": { costFactor: 1, priceTier: "economy", equipmentClass: "GP" },
  "20hq": { costFactor: 1.08, priceTier: "economy", equipmentClass: "HQ" },
  "40gp": { costFactor: 1.55, priceTier: "standard", equipmentClass: "GP" },
  "40hq": { costFactor: 1.68, priceTier: "standard", equipmentClass: "HQ" },
  "45hq": { costFactor: 2.05, priceTier: "high", equipmentClass: "45HQ" },
  "20rf": { costFactor: 1.65, priceTier: "standard", equipmentClass: "RF" },
  "40rf": { costFactor: 2.45, priceTier: "special", equipmentClass: "RF" },
  "20fr": { costFactor: 2.15, priceTier: "high", equipmentClass: "FR" },
  "40fr": { costFactor: 3.2, priceTier: "special", equipmentClass: "FR" }
};

function withDefaultProfile(container) {
  const profile = defaultContainerProfiles[container?.id] || {};
  return {
    ...profile,
    ...container,
    costFactor: container?.costFactor ?? profile.costFactor,
    priceTier: container?.priceTier ?? profile.priceTier,
    equipmentClass: container?.equipmentClass ?? profile.equipmentClass
  };
}

export function cloneDefaultContainers() {
  return defaultContainers.map((item) => withDefaultProfile(item));
}

export function mergeDefaultContainers(containers = []) {
  const existing = Array.isArray(containers) ? containers.filter(Boolean) : [];
  if (!existing.length) return cloneDefaultContainers();
  const defaultIds = new Set(defaultContainers.map((item) => item.id));
  if (!existing.some((item) => defaultIds.has(item.id))) return existing;
  const existingWithProfiles = existing.map((item) => withDefaultProfile(item));
  const existingIds = new Set(existingWithProfiles.map((item) => item.id));
  const missingDefaults = defaultContainers
    .filter((item) => !existingIds.has(item.id))
    .map((item) => withDefaultProfile(item));
  return [...existingWithProfiles, ...missingDefaults];
}
