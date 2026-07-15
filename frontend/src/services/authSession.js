const TOKEN_KEY = "cargo-planner-auth-token";
const USER_KEY = "cargo-planner-auth-user";
const EXPIRES_KEY = "cargo-planner-auth-expires-at";
const DEVICE_KEY = "cargo-planner-device-id";
const TOKEN_COOKIE_KEY = "cargo_planner_auth_token";

function syncTokenCookie(token, expiresAt = "") {
  try {
    const expires = expiresAt ? `; Expires=${new Date(expiresAt).toUTCString()}` : "";
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${TOKEN_COOKIE_KEY}=${token}; Path=/; SameSite=Lax${expires}${secure}`;
  } catch {
    // Desktop and hardened browser contexts may not expose cookies.
  }
}

function clearTokenCookie() {
  try {
    document.cookie = `${TOKEN_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    // Keep local session cleanup working when cookies are unavailable.
  }
}

export function storedToken() {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  if (token) syncTokenCookie(token, storedExpiresAt());
  return token;
}

export function storedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function storedExpiresAt() {
  return localStorage.getItem(EXPIRES_KEY) || "";
}

export function saveSession(response) {
  if (!response?.token) return;
  localStorage.setItem(TOKEN_KEY, response.token);
  localStorage.setItem(USER_KEY, JSON.stringify(response.user || null));
  if (response.expiresAt) localStorage.setItem(EXPIRES_KEY, response.expiresAt);
  syncTokenCookie(response.token, response.expiresAt);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  clearTokenCookie();
}

export function isSessionExpired() {
  const expiresAt = storedExpiresAt();
  return Boolean(expiresAt && Date.now() >= new Date(expiresAt).getTime());
}

export function authHeaders() {
  const token = storedToken();
  return token ? { "X-Auth-Token": token } : {};
}

export function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = `web-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}

export function getDeviceName() {
  const platform = navigator.platform || "Web";
  const browser = navigator.userAgentData?.brands?.[0]?.brand || navigator.userAgent.split(" ")[0] || "Browser";
  return `${platform} / ${browser}`;
}
