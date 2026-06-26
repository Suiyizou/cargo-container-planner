import { requestJson } from "./apiClient";

const configuredBase = import.meta.env.VITE_API_BASE_URL;
const TOKEN_KEY = "cargo-planner-admin-token";
const DEVICE_KEY = "cargo-planner-device-id";

export function storedAdminToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function saveAdminToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function loginAdmin(username, password) {
  const response = await request("/auth/login", {
    method: "POST",
    body: {
      username,
      password,
      deviceId: getDeviceId(),
      deviceName: getDeviceName()
    }
  });
  saveAdminToken(response.token);
  return response;
}

export async function logoutAdmin() {
  await request("/auth/logout", { method: "POST" });
  clearAdminToken();
}

export async function fetchAdminMe() {
  return request("/auth/me");
}

export async function fetchEmployees() {
  return request("/admin/employees");
}

export async function createEmployee(payload) {
  return request("/admin/employees", { method: "POST", body: payload });
}

export async function updateEmployee(id, payload) {
  return request(`/admin/employees/${id}`, { method: "PATCH", body: payload });
}

export async function fetchDevices() {
  return request("/admin/devices");
}

export async function kickDevice(id) {
  return request(`/admin/devices/${id}/kick`, { method: "POST" });
}

export async function fetchMonitoring() {
  return request("/admin/monitoring");
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = storedAdminToken();
  if (token) headers["X-Auth-Token"] = token;

  return requestJson(path, {
    method: options.method || "GET",
    headers,
    body: options.body
  }, configuredBase);
}

function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = `web-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}

function getDeviceName() {
  const platform = navigator.platform || "Web";
  const browser = navigator.userAgentData?.brands?.[0]?.brand || navigator.userAgent.split(" ")[0] || "Browser";
  return `${platform} / ${browser}`;
}
