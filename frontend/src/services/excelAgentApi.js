const configuredBase = import.meta.env.VITE_API_BASE_URL;
const API_BASE = (configuredBase || "/api").replace(/\/$/, "");

export async function createExcelCleaningTask(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", "agent");
  return request("/excel-cleaning/tasks", {
    method: "POST",
    body: formData
  });
}

export function fetchExcelCleaningTasks() {
  return request("/excel-cleaning/tasks");
}

export function fetchExcelCleaningTask(id) {
  return request(`/excel-cleaning/tasks/${id}`);
}

export async function downloadCleanedExcel(id, fileName = "cleaned-cargos.xlsx") {
  const response = await fetch(`${API_BASE}/excel-cleaning/tasks/${id}/cleaned-excel`);
  if (!response.ok) {
    const message = await readError(response);
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function request(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || `API ${response.status}`);
  }
  return data;
}

async function readError(response) {
  const text = await response.text();
  if (!text) return `API ${response.status}`;
  try {
    return JSON.parse(text)?.message || text;
  } catch {
    return text;
  }
}
