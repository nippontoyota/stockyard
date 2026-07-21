import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const apiUrl = import.meta.env.VITE_API_URL || "";

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  // Get custom claims or user metadata to determine role/yardId
  const { data: userDetails, error: meError } = await apiFetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${data.session.access_token}` },
  });
  if (meError) throw meError;
  return { ...data.session, userDetails };
}

export async function logout() {
  await supabase.auth.signOut();
}

async function apiFetch(endpoint, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("No session");

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${session.access_token}`,
    ...options.headers,
  };

  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch {}
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

export const yards = [
  { id: "CO01A-1", code: "CO01A", name: "Nettur Showroom, Cochin", capacity: 125, latitude: 9.9369, longitude: 76.3149, gpsRadiusMeters: 250 },
  { id: "CO01B-1", code: "CO01B", name: "Kalamasery, Cochin", capacity: 200, latitude: 10.0529, longitude: 76.3157, gpsRadiusMeters: 250 },
  { id: "CO01B-2", code: "CO01B", name: "Nippon Tower - 7th floor, Cochin", capacity: 80, latitude: 9.9667, longitude: 76.2999, gpsRadiusMeters: 120 },
  { id: "KY01A-1", code: "KY01A", name: "Showroom, Kayamkulam", capacity: 60, latitude: 9.1746, longitude: 76.5004, gpsRadiusMeters: 250 },
  { id: "KY01A-2", code: "KY01A", name: "Ramapuram East, Kayamkulam", capacity: 210, latitude: 9.185, longitude: 76.517, gpsRadiusMeters: 300 },
  { id: "KY01A-3", code: "KY01A", name: "Ramapuram West, Kayamkulam", capacity: 80, latitude: 9.184, longitude: 76.493, gpsRadiusMeters: 300 },
  { id: "KY01A-4", code: "KY01A", name: "Evoor Yard, Kayamkulam", capacity: 110, latitude: 9.1923, longitude: 76.482, gpsRadiusMeters: 300 },
  { id: "IR01A-1", code: "IR01A", name: "Showroom, Irinjalakuda", capacity: 30, latitude: 10.342, longitude: 76.211, gpsRadiusMeters: 200 },
  { id: "KL01A-1", code: "KL01A", name: "Showroom, Kollam", capacity: 55, latitude: 8.8932, longitude: 76.6141, gpsRadiusMeters: 200 },
  { id: "KL01B-1", code: "KL01B", name: "Thazhuthala, Kollam", capacity: 225, latitude: 8.8795, longitude: 76.645, gpsRadiusMeters: 300 },
  { id: "TI01A-1", code: "TI01A", name: "Peramangalam, Trissur", capacity: 175, latitude: 10.588, longitude: 76.172, gpsRadiusMeters: 300 },
  { id: "MV01A-1", code: "MV01A", name: "Muvattupuzha", capacity: 105, latitude: 9.9849, longitude: 76.5773, gpsRadiusMeters: 250 },
  { id: "PH01A-1", code: "PH01A", name: "Pathanamthitta", capacity: 70, latitude: 9.2648, longitude: 76.787, gpsRadiusMeters: 250 },
  { id: "TL01A-1", code: "TL01A", name: "Thiruvalla", capacity: 45, latitude: 9.3835, longitude: 76.5741, gpsRadiusMeters: 250 },
  { id: "TR01C-1", code: "TR01C", name: "Vallakkadavu, Trivandrum", capacity: 45, latitude: 8.482, longitude: 76.928, gpsRadiusMeters: 200 },
  { id: "TR01C-2", code: "TR01C", name: "Enchakkal, Trivandrum", capacity: 20, latitude: 8.4827, longitude: 76.919, gpsRadiusMeters: 200 },
  { id: "TR01A-1", code: "TR01A", name: "Showroom, Kazhakuttam, Trivandrum", capacity: 40, latitude: 8.568, longitude: 76.873, gpsRadiusMeters: 200 },
  { id: "TR01A-2", code: "TR01A", name: "Yard-1, Kazhakuttam, Trivandrum", capacity: 130, latitude: 8.571, longitude: 76.875, gpsRadiusMeters: 250 },
  { id: "TR01A-3", code: "TR01A", name: "Yard-2, Kazhakuttam, Trivandrum", capacity: 65, latitude: 8.573, longitude: 76.877, gpsRadiusMeters: 250 },
  { id: "TR01A-4", code: "TR01A", name: "Yard-3, Kazhakuttam, Trivandrum", capacity: 130, latitude: 8.575, longitude: 76.879, gpsRadiusMeters: 250 },
  { id: "KT01A-1", code: "KT01A", name: "Kottayam, behind the showroom", capacity: 300, latitude: 9.5916, longitude: 76.5222, gpsRadiusMeters: 300 },
];

export function getDeviceId() {
  let deviceId = localStorage.getItem("yardDeviceId");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("yardDeviceId", deviceId);
  }
  return deviceId;
}

export function createClientScanId() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

export function createScanPayload({ vin, type, gps, outRemark, damaged, damageRemark }) {
  return {
    client_scan_id: createClientScanId(),
    vin: vin.toUpperCase(),
    scan_type: type, // used for bulk sync schema
    scanned_at: new Date().toISOString(),
    latitude: gps?.latitude,
    longitude: gps?.longitude,
    gps_accuracy_meters: gps?.accuracy,
    device_fingerprint: getDeviceId(),
    out_remark: outRemark || undefined,
    damaged: damaged || false,
    damage_remark: damageRemark || undefined,
  };
}

export async function scanIn(payload) {
  return apiFetch("/api/scans/in", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function scanOut(payload) {
  return apiFetch("/api/scans/out", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function bulkSync(scans) {
  return apiFetch("/api/scans/bulk-sync", {
    method: "POST",
    body: JSON.stringify({ scans }),
  });
}

export async function fetchStock(query = "") {
  return apiFetch(`/api/vehicles?limit=100&model=${query}`);
}

export async function fetchDashboard() {
  return apiFetch("/api/admin/dashboard");
}

export async function fetchFlags() {
  return apiFetch("/api/admin/flags?resolved=false");
}

export async function resolveFlag(id) {
  return apiFetch(`/api/admin/flags/${id}/resolve`, { method: "PATCH" });
}

export async function adminOverride(vin, payload) {
  return apiFetch(`/api/admin/vehicles/${vin}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export const QUEUE_KEY = "yardOfflineQueue";

export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToQueue(scan) {
  const queue = getQueue();
  queue.push(scan);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue() {
  localStorage.setItem(QUEUE_KEY, JSON.stringify([]));
}
