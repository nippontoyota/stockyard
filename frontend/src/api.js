import { yards } from "./stockyardLogic.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

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
    let errMessage = response.statusText;
    try {
      const body = await response.json();
      errMessage = body.error || errMessage;
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
    scanned_at: s.scannedAt,
    latitude: s.gps?.latitude,
    longitude: s.gps?.longitude,
    gps_accuracy_meters: s.gps?.accuracy,
    device_fingerprint: s.deviceId,
    ...(s.type === 'out' ? {
      out_remark: s.outRemark,
      damaged: s.damaged,
      damage_remark: s.damageRemark || undefined,
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
  const response = await apiFetch("/api/admin/flags?resolved=false&limit=1000");
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
