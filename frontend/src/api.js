import { yards } from "./stockyardLogic.js";

const API_BASE = import.meta.env.VITE_API_URL || "https://stockyard-00s6.onrender.com";

export async function getAuthHeaders() {
  const session = JSON.parse(localStorage.getItem("yardSession") || "null");
  if (!session) return {};
  const token = session.role === "admin" ? "mock-admin" : `mock-yard-${session.yardId}`;
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function apiFetch(endpoint, options = {}) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!response.ok) {
    let errMessage = "Server request failed. Please try again.";
    try {
      const body = await response.json();
      if (body.error && !body.error.toLowerCase().includes("failed query") && !body.error.toLowerCase().includes("select ") && !body.error.toLowerCase().includes("sql")) {
        errMessage = body.error;
      } else {
        errMessage = "Incorrect password or credentials. Please try again.";
      }
    } catch (e) {}
    throw new Error(errMessage);
  }
  return response.json();
}

export async function bulkSync(scans) {
  // Format scans to match API expected shape
  const formattedScans = scans.map(s => ({
    scan_type: s.type,
    client_scan_id: s.clientScanId,
    vin: s.vinRaw,
    yard_id: s.yardId,
    scanned_at: s.scannedAt,
    latitude: s.gps?.latitude,
    longitude: s.gps?.longitude,
    gps_accuracy_meters: s.gps?.accuracy,
    device_fingerprint: s.deviceId,
    damaged: s.damaged || false,
    damage_remark: s.damageRemark || undefined,
    damage_image: s.damageImage || undefined,
    ...(s.type === 'out' ? {
      out_remark: s.outRemark,
    } : {})
  }));

  return apiFetch("/api/scans/bulk-sync", {
    method: "POST",
    body: JSON.stringify({ scans: formattedScans }),
  });
}

export async function getVehicles() {
  const response = await apiFetch("/api/vehicles?limit=1000");
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

export async function getAdminDashboard() {
  return apiFetch("/api/admin/dashboard");
}

export async function resolveFlag(id) {
  return apiFetch(`/api/admin/flags/${id}/resolve`, {
    method: "PATCH"
  });
}

export async function adminOverrideVehicle(vin, status, reason, yardId) {
  return apiFetch(`/api/admin/vehicles/${vin}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason, yardId })
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
