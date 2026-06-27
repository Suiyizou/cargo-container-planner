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

export function cloneDefaultContainers() {
  return defaultContainers.map((item) => ({ ...item }));
}

export function mergeDefaultContainers(containers = []) {
  const existing = Array.isArray(containers) ? containers.filter(Boolean) : [];
  if (!existing.length) return cloneDefaultContainers();
  const defaultIds = new Set(defaultContainers.map((item) => item.id));
  if (!existing.some((item) => defaultIds.has(item.id))) return existing;
  const existingIds = new Set(existing.map((item) => item.id));
  const missingDefaults = defaultContainers
    .filter((item) => !existingIds.has(item.id))
    .map((item) => ({ ...item }));
  return [...existing, ...missingDefaults];
}
