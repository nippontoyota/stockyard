const API_BASE = import.meta.env.VITE_API_URL || "https://stockyard-00s6.onrender.com";

// §2.2 — Retry with exponential backoff
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}

export async function getAuthHeaders() {
  const session = JSON.parse(localStorage.getItem("yardSession") || "null");
  if (!session) return {};
  const token = session.token || (session.role === "admin" ? "mock-admin"
    : session.role === "delivery_incharge" ? `mock-delivery-${session.branchId}`
    : `mock-yard-${session.yardId}`);
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function apiFetch(endpoint, options = {}) {
  const headers = await getAuthHeaders();
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
}

// §A3 — Dynamic yards/branches with localStorage cache
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

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
    ...(s.type === 'out' ? {
      out_remark: s.outRemark,
      transfer_destination_yard_id: s.transferDestinationYardId || undefined,
      transfer_requested_by: s.transferRequestedBy || undefined,
    } : {})
  }));

  return apiFetch("/api/scans/bulk-sync", {
    method: "POST",
    body: JSON.stringify({ scans: formattedScans }),
  });
}

// §1.3 — Paginated vehicle list
export async function getVehicles(params = {}) {
  const { page = 1, limit = 1000, yardId, status, model } = params;
  let url = `/api/vehicles?page=${page}&limit=${limit}`;
  if (yardId) url += `&yard_id=${yardId}`;
  if (status) url += `&status=${status}`;
  if (model) url += `&model=${encodeURIComponent(model)}`;
  const response = await apiFetch(url);
  return response.data || [];
}

export async function getFlags() {
  const response = await apiFetch("/api/admin/flags?limit=1000");
  return response.data || [];
}

export async function getScans() {
  const response = await apiFetch("/api/scans?limit=1000");
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
  return apiFetch(`/api/admin/vehicles/${vin}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export async function loginApi(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let msg = "Incorrect password or credentials. Please try again.";
    try {
      const b = await res.json();
      if (b.error && !b.error.toLowerCase().includes("failed query") && !b.error.toLowerCase().includes("select ") && !b.error.toLowerCase().includes("sql")) {
        msg = b.error;
      }
    } catch {}
    throw new Error(msg);
  }
  return res.json();
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

// --- Branches & Requisitions ---

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

export async function getRequisitions() {
  return apiFetch("/api/requisitions");
}

export async function createRequisition(sourceBranchId, vehicleId) {
  return apiFetch("/api/requisitions", {
    method: "POST",
    body: JSON.stringify({ source_branch_id: sourceBranchId, vehicle_id: vehicleId }),
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

// --- Notifications ---

export async function getNotifications() {
  return apiFetch("/api/notifications");
}

export async function markNotificationRead(id) {
  return apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
}

export async function markAllNotificationsRead() {
  return apiFetch("/api/notifications/read-all", { method: "POST" });
}

// --- §4.4 Data Export ---

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
