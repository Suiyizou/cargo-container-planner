const fallbackContainers = [
  { id: "20gp", name: "20GP 普柜", lengthCm: 590, widthCm: 235, heightCm: 239, payloadKg: 28200 },
  { id: "20hq", name: "20HQ 高柜", lengthCm: 590, widthCm: 235, heightCm: 270, payloadKg: 27800 },
  { id: "40gp", name: "40GP 普柜", lengthCm: 1203, widthCm: 235, heightCm: 239, payloadKg: 26700 },
  { id: "40hq", name: "40HQ 高柜", lengthCm: 1203, widthCm: 235, heightCm: 270, payloadKg: 26500 },
  { id: "45hq", name: "45HQ 高柜", lengthCm: 1356, widthCm: 235, heightCm: 270, payloadKg: 28600 },
  { id: "20rf", name: "20RF 冷藏柜", lengthCm: 545, widthCm: 229, heightCm: 226, payloadKg: 27000 },
  { id: "40rf", name: "40RF 冷藏高柜", lengthCm: 1156, widthCm: 229, heightCm: 250, payloadKg: 29000 }
];

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    signal: controller.signal,
    ...options
  }).finally(() => window.clearTimeout(timeout));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchDefaultContainers() {
  try {
    const data = await requestJson("/api/containers/defaults");
    return data.map(localizeContainer);
  } catch {
    return fallbackContainers;
  }
}

export async function createPackingJob(payload) {
  return requestJson("/api/packing/jobs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function fetchPackingJob(id) {
  return requestJson(`/api/packing/jobs/${encodeURIComponent(id)}`);
}

function localizeContainer(container) {
  const names = {
    "20GP Standard": "20GP 普柜",
    "20HQ High Cube": "20HQ 高柜",
    "40GP Standard": "40GP 普柜",
    "40HQ High Cube": "40HQ 高柜",
    "45HQ High Cube": "45HQ 高柜",
    "20RF Reefer": "20RF 冷藏柜",
    "40RF Reefer High Cube": "40RF 冷藏高柜"
  };
  return { ...container, name: names[container.name] || container.name };
}
