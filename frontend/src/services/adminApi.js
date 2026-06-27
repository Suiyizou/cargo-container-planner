import { requestJson } from "./apiClient";
import {
  clearSession,
  getDeviceId,
  getDeviceName,
  saveSession,
  storedToken
} from "./authSession";

const configuredBase = import.meta.env.VITE_API_BASE_URL;

export function storedAdminToken() {
  return storedToken();
}

export function saveAdminToken(token) {
  if (token) saveSession({ token });
}

export function clearAdminToken() {
  clearSession();
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
  saveSession(response);
  return response;
}

export async function logoutAdmin() {
  await request("/auth/logout", { method: "POST" });
  clearSession();
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

export async function deleteEmployee(id) {
  return request(`/admin/employees/${id}`, { method: "DELETE" });
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

export async function fetchLlmSettings() {
  return request("/admin/settings/llm");
}

export async function updateLlmSettings(payload) {
  return request("/admin/settings/llm", { method: "PATCH", body: payload });
}

async function request(path, options = {}) {
  return requestJson(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body
  }, configuredBase);
}
