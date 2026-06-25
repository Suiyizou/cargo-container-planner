export const defaultContainers = [
  { id: "20gp", name: "20GP 普柜", lengthCm: 590, widthCm: 235, heightCm: 239, payloadKg: 28200 },
  { id: "20hq", name: "20HQ 高柜", lengthCm: 590, widthCm: 235, heightCm: 270, payloadKg: 27800 },
  { id: "40gp", name: "40GP 普柜", lengthCm: 1203, widthCm: 235, heightCm: 239, payloadKg: 26700 },
  { id: "40hq", name: "40HQ 高柜", lengthCm: 1203, widthCm: 235, heightCm: 270, payloadKg: 26500 },
  { id: "45hq", name: "45HQ 高柜", lengthCm: 1356, widthCm: 235, heightCm: 270, payloadKg: 28600 },
  { id: "20rf", name: "20RF 冷藏柜", lengthCm: 545, widthCm: 229, heightCm: 226, payloadKg: 27000 },
  { id: "40rf", name: "40RF 冷藏高柜", lengthCm: 1156, widthCm: 229, heightCm: 250, payloadKg: 29000 }
];

export function cloneDefaultContainers() {
  return defaultContainers.map((item) => ({ ...item }));
}
