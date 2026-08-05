import { VEHICLE_PAGE_SIZE, fetchAllVehiclePages } from "./vehiclePagination.js";

const API_BASE = import.meta.env.VITE_API_URL || "https://stockyard-api-xvaa.onrender.com";

const FETCH_TIMEOUT_MS = 12000;
/** Vehicle list can be thousands of rows; allow a longer budget than default API calls. */
const VEHICLE_FETCH_TIMEOUT_MS = 60000;

function isRetryableError(err, status) {
  // Timeouts/aborts must not retry — under multi-device load that amplifies DB pressure.
  if (err?.name === "AbortError") return false;
  if (status && status >= 400 && status < 500) return false;
  return true;
}

async function fetchWithRetry(url, options = {}, retries = 1) {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const { timeoutMs: _ignored, ...fetchOptions } = options;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        if (isRetryableError(err, res.status) && i < retries - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
          continue;
        }
        throw err;
      }
      return res;
    } catch (err) {
      clearTimeout(timeout);
      if (!isRetryableError(err, err.status) || i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}

export function isNetworkError(err) {
  if (!err) return false;
  if (err.offline) return true;
  if (err.name === "AbortError") return true;
  if (err.status && err.status >= 400 && err.status < 500) return false;
  return true;
}

export function parseBulkSyncResponse(response) {
  const results = response?.results || [];
  if (!results.length) {
    throw new Error("Server returned no sync results.");
  }
  const rejected = results.filter((r) => r.status === "rejected");
  if (rejected.length) {
    const err = new Error(rejected[0].error || "Scan rejected by server.");
    err.rejected = true;
    err.results = results;
    throw err;
  }
  return response;
}

export const AUTH_EXPIRED_EVENT = "yard-auth-expired";
export const SESSION_EXPIRED_MESSAGE = "Session expired. Please log in again.";

function clearStoredSession() {
  localStorage.removeItem("yardSession");
  localStorage.removeItem("cache:branches");
}

export function notifyAuthExpired() {
  clearStoredSession();
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

export function isAuthError(err) {
  if (!err) return false;
  // Only treat explicit session-expiry messages as auth errors.
  // Login also returns 401 for bad passwords — that must NOT kick the user
  // to "Session expired".
  const msg = String(err.message || "");
  return msg.includes("Session expired") || msg === SESSION_EXPIRED_MESSAGE;
}

export function humanizeApiError(err) {
  if (isAuthError(err)) return SESSION_EXPIRED_MESSAGE;
  if (err?.name === "AbortError" || /aborted/i.test(String(err?.message || ""))) {
    return "Server is taking too long. Please try again in a moment.";
  }
  if (err?.status === 401) {
    return err.message || "Incorrect password or credentials. Please try again.";
  }
  if (String(err?.message || "").startsWith("HTTP ")) {
    return "Server request failed. Please try again.";
  }
  return err?.message || "Something went wrong. Please try again.";
}

export async function getAuthHeaders() {
  const session = JSON.parse(localStorage.getItem("yardSession") || "null");
  if (!session) return {};
  const token = session.token || (import.meta.env.DEV
    ? session.role === "admin" ? "mock-admin"
      : session.role === "delivery_incharge" ? `mock-delivery-${session.branchId}`
      : `mock-yard-${session.yardId}`
    : null);
  if (!token) return {};
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function apiFetch(endpoint, options = {}) {
  const headers = await getAuthHeaders();
  try {
    const response = await fetchWithRetry(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
      cache: "no-store",
    });
    let errMessage = "Server request failed. Please try again.";
    try {
      const body = await response.json();
      return body;
    } catch (e) {
      throw new Error(errMessage);
    }
  } catch (err) {
    if (err.status === 401) {
      notifyAuthExpired();
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    throw err;
  }
}

const CACHE_TTL = 60 * 60 * 1000;

function getCached(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch { return null; }
}

function setCache(key, data) {
  localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
}

export async function getBranchesForLogin() {
  const res = await fetch(`${API_BASE}/api/branches/list`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load branches.");
  return res.json();
}

export async function getAdminBranches() {
  const cached = getCached("cache:branches");
  if (cached) return cached;
  const response = await apiFetch("/api/admin/branches");
  const data = Array.isArray(response) ? response : (response.data || response);
  if (data?.length) setCache("cache:branches", data);
  return data || [];
}

export async function bulkSync(scans) {
  const formattedScans = scans.map(s => ({
    scan_type: s.type,
    client_scan_id: s.clientScanId,
    vin: s.vinRaw,
    yard_id: s.yardId,
    scanned_at: s.scannedAt,
    device_fingerprint: s.deviceId,
    key_no: s.keyNo || undefined,
    damaged: s.damaged || false,
    damage_remark: s.damageRemark || undefined,
    damage_image: s.damageImage || undefined,
    drive_type: s.driveType || undefined,
    ...(s.entryMethod === "qr" || s.entryMethod === "manual" ? { entry_method: s.entryMethod } : {}),
    ...(s.type === 'in' && s.model ? { model: s.model } : {}),
    ...(s.type === 'out' ? {
      out_remark: s.outRemark,
      transfer_destination_yard_id: s.transferDestinationYardId || undefined,
      transfer_requested_by: s.transferRequestedBy || undefined,
    } : {})
  }));

  const response = await apiFetch("/api/scans/bulk-sync", {
    method: "POST",
    body: JSON.stringify({ scans: formattedScans }),
  });
  return parseBulkSyncResponse(response);
}

export async function getVehicles(params = {}) {
  const {
    limit = VEHICLE_PAGE_SIZE,
    yardId,
    status,
    model,
    // Explicit single-page fetch (tests / rare callers). Default: load every page.
    page: singlePage,
    allPages = singlePage == null,
  } = params;

  const buildUrl = (page) => {
    let url = `/api/vehicles?page=${page}&limit=${limit}`;
    if (yardId) url += `&yard_id=${encodeURIComponent(yardId)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    if (model) url += `&model=${encodeURIComponent(model)}`;
    return url;
  };

  const fetchPage = async (page) => {
    const response = await apiFetch(buildUrl(page), { timeoutMs: VEHICLE_FETCH_TIMEOUT_MS });
    return response.data || [];
  };

  // Yard-scoped stock views and admin/global sync must both be complete.
  // A single default page (formerly 300) left admin undercounting many yards.
  if (!allPages) {
    return fetchPage(singlePage || 1);
  }

  return fetchAllVehiclePages(fetchPage, { pageSize: limit });
}

export async function getFlags() {
  // Active exceptions only — resolved history is not needed for live sync.
  const response = await apiFetch("/api/admin/flags?resolved=false&limit=200");
  return response.data || [];
}

export async function getScans() {
  const response = await apiFetch("/api/scans?limit=200");
  return response.data || [];
}

export async function resolveFlag(id) {
  return apiFetch(`/api/admin/flags/${id}/resolve`, { method: "PATCH" });
}

export async function adminOverrideVehicle(vin, status, reason, yardId) {
  return apiFetch(`/api/admin/vehicles/${vin}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason, yardId })
  });
}

export async function adminUpdateVehicle(vin, fields) {
  return apiFetch(`/api/admin/vehicles/${encodeURIComponent(String(vin).toUpperCase())}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export async function deleteAdminVehicle(vin) {
  return apiFetch(`/api/admin/vehicles/${encodeURIComponent(String(vin).toUpperCase())}`, {
    method: "DELETE",
  });
}

export async function loginApi(username, password) {
  // Dedicated fetch so 401 bodies ("Incorrect password") are preserved.
  // fetchWithRetry throws generic "HTTP 401" and loses the server message.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let msg = "Incorrect password or credentials. Please try again.";
      try {
        const b = await res.json();
        if (
          b.error &&
          !b.error.toLowerCase().includes("failed query") &&
          !b.error.toLowerCase().includes("select ") &&
          !b.error.toLowerCase().includes("sql")
        ) {
          msg = b.error;
        }
      } catch {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res.json();
  } catch (err) {
    if (err?.name === "AbortError" || /aborted/i.test(String(err?.message || ""))) {
      throw Object.assign(new Error("Server is taking too long. Please try again in a moment."), {
        name: "AbortError",
      });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCredentialsApi() {
  return apiFetch("/api/admin/credentials");
}

export async function updateCredentialApi(username, password) {
  return apiFetch("/api/admin/credentials/update", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function uploadTransitListApi(vehicles) {
  return apiFetch("/api/vehicles/transit-list", {
    method: "POST",
    body: JSON.stringify({ vehicles }),
  });
}

/** Create-only stockyard import. Never mutates existing VINs. */
export async function adminImportVehicles(vehicles) {
  return apiFetch("/api/admin/import/vehicles", {
    method: "POST",
    body: JSON.stringify({ vehicles }),
  });
}

export async function getIncomingVehicles() {
  const response = await apiFetch("/api/vehicles/incoming");
  return response.data || [];
}

export async function receiveIncomingVehicle(vin, fields = {}) {
  return apiFetch(`/api/vehicles/receive/${encodeURIComponent(vin)}`, {
    method: "POST",
    body: JSON.stringify(fields),
  });
}

export async function createAdminBranch(name) {
  return apiFetch("/api/admin/branches", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateAdminBranch(id, data) {
  return apiFetch(`/api/admin/branches/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function assignBranchYards(id, yardIds) {
  return apiFetch(`/api/admin/branches/${id}/yards`, {
    method: "POST",
    body: JSON.stringify({ yard_ids: yardIds }),
  });
}

export async function getBranchStock(branchId) {
  return apiFetch(`/api/branches/${branchId}/stock`);
}

export async function getRequestTargetYards() {
  return apiFetch("/api/yards/request-targets");
}

export async function getYardStock(yardId) {
  return apiFetch(`/api/yards/${encodeURIComponent(yardId)}/stock`);
}

export async function getBranchOverview(branchId) {
  return apiFetch(`/api/branches/${branchId}/overview`);
}

export async function getRequisitions() {
  return apiFetch("/api/requisitions");
}

export async function createRequisition(sourceBranchId, vehicleId, destinationYardId) {
  return apiFetch("/api/requisitions", {
    method: "POST",
    body: JSON.stringify({
      source_branch_id: sourceBranchId,
      vehicle_id: vehicleId,
      destination_yard_id: destinationYardId,
    }),
  });
}

export async function approveRequisition(id) {
  return apiFetch(`/api/requisitions/${id}/approve`, { method: "POST" });
}

export async function rejectRequisition(id, reason = '') {
  return apiFetch(`/api/requisitions/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function getNotifications() {
  return apiFetch("/api/notifications");
}

export async function markNotificationRead(id) {
  return apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
}

export async function markAllNotificationsRead() {
  return apiFetch("/api/notifications/read-all", { method: "POST" });
}

export async function downloadExport(type, params = {}) {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE}/api/export/${type}${query ? `?${query}` : ""}`;
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) {
    throw new Error("Export failed. Please try again.");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `${type}-export-${new Date().toISOString().slice(0, 10)}.csv`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function getVehicleStatus(vin) {
  return apiFetch(`/api/vehicles/${encodeURIComponent(vin.toUpperCase())}`);
}

export async function deliverVehicles(vins) {
  return apiFetch("/api/vehicles/deliver", {
    method: "PATCH",
    body: JSON.stringify({ vins }),
  });
}
