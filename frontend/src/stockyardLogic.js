// Static yard list (mirrors backend/src/lib/yardData.ts). Not fetched — avoids
// filtered /api/yards responses overwriting the login dropdown after logout.
import { YARD_DATA, YARD_REGIONS } from "./yardData.js";
import { CAR_MODELS, isCarModel } from "../../backend/src/shared/carModels.js";
import { DRIVE_TYPES, driveTypeLabel, isDriveType } from "../../backend/src/shared/driveTypes.js";

export { CAR_MODELS, isCarModel, DRIVE_TYPES, driveTypeLabel, isDriveType };

export let yards = [...YARD_DATA];
export let fallbackBranches = [];

/** Hardcoded yards stay authoritative — never overwrite from a filtered API response. */
export function setConfig(_newYards, newBranches) {
  if (newBranches?.length) fallbackBranches = newBranches;
}

/** Resolve a yard by unique site id only (codes are shared across sites). */
export function findYardById(yardId) {
  if (!yardId) return null;
  return yards.find((y) => y.id === yardId) || null;
}

/** Group yards by region for selects / assign UIs. */
export function yardsByRegion() {
  return YARD_REGIONS.map((region) => ({
    region,
    yards: yards.filter((y) => y.city === region),
  })).filter((g) => g.yards.length > 0);
}

export { YARD_REGIONS };

export function createInitialState(now = new Date().toISOString()) {
  const deviceId = localStorage.getItem("yardDeviceId") || crypto.randomUUID();
  localStorage.setItem("yardDeviceId", deviceId);
  const vehicles = {};
  const scans = [];
  const flags = [];
  const notifications = [];
  const requisitions = { incoming: [], outgoing: [] };
  return { deviceId, vehicles, scans, flags, notifications, requisitions };
}

export function findApprovedTransferReq(requisitions, vin) {
  const want = normalizeVin(vin);
  if (!want) return null;
  return requisitions?.incoming?.find(
    (r) => r.status === "approved" && normalizeVin(r.vehicle?.vin) === want
  ) ?? null;
}

export function requisitionDestinationYardId(req) {
  return req?.destination_yard_id || req?.destination_yard?.id || req?.requesting_branch?.yards?.[0]?.id || "";
}

/** DI login for OUT "Requested by" — never fall back to raw user id. */
export function requisitionRequesterLabel(req) {
  return req?.requested_by_username || "";
}

export function createClientScanId() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

export function createScan({ vin, type, yardId, outRemark = "", transferDestinationYardId = "", transferRequestedBy = "", keyNo = "", damaged = false, damageRemark = "", damageImage = "", driveType = "", model = "" }) {
  return {
    id: crypto.randomUUID(),
    clientScanId: createClientScanId(),
    vinRaw: vin,
    type,
    yardId,
    outRemark,
    transferDestinationYardId,
    transferRequestedBy,
    keyNo,
    damaged,
    damageRemark,
    damageImage,
    driveType,
    model,
    deviceId: localStorage.getItem("yardDeviceId") || "unknown-device",
    scannedAt: new Date().toISOString(),
  };
}

export function normalizeVin(value) {
  const text = String(value || "").toUpperCase();
  const vinMatch = text.match(/[A-HJ-NPR-Z0-9]{17}/);
  return vinMatch ? vinMatch[0] : text.replace(/[^A-Z0-9]/g, "").slice(0, 17);
}

export function isValidVin(vin) {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
}

export function applyScan(state, scan) {
  if (state.scans.some((item) => item.clientScanId === scan.clientScanId)) {
    return { state, accepted: true, message: "Duplicate sync ignored." };
  }
  const vin = normalizeVin(scan.vinRaw);
  const vinValid = isValidVin(vin);
  const existing = state.vehicles[vin];
  const yard = yards.find((item) => item.id === scan.yardId);
  if (scan.type === "in" && existing?.currentStatus === "in" && existing.currentYardId === scan.yardId) {
    return { state, accepted: false, message: "Vehicle is already IN at this yard." };
  }
  if (scan.type === "out" && existing?.currentStatus === "out") {
    return { state, accepted: false, message: "Vehicle is already marked OUT." };
  }

  const flags = [];
  const duplicateIn = scan.type === "in" && existing?.currentStatus === "in" && existing.currentYardId !== scan.yardId;

  if (!vinValid) flags.push(flag(vin, "invalid_vin", "VIN format needs admin review."));

  if (duplicateIn) flags.push(flag(vin, "duplicate_yard_status", duplicateMessage(existing.currentYardId, scan.yardId)));

  if (scan.type === "out" && !existing) flags.push(flag(vin, "unverified_in", "OUT scan has no prior IN record."));
  if (scan.damaged) flags.push(flag(vin, "damage_reported", scan.damageRemark || "Damage reported.", { damageRemark: scan.damageRemark, damageImage: scan.damageImage, scanType: scan.type, yardId: scan.yardId }));

  const nextModel =
    scan.type === "in" && scan.model
      ? scan.model
      : existing?.model || "";

  const vehicle = {
    vin,
    model: nextModel,
    vinValid,
    currentStatus: scan.type === "out" && scan.outRemark === "stockyard_transfer"
      ? "transit"
      : scan.type,
    currentYardId: scan.type === "in"
      ? scan.yardId
      : scan.type === "out" && scan.outRemark === "stockyard_transfer" && scan.transferDestinationYardId
        ? scan.transferDestinationYardId
        : existing?.currentYardId || scan.yardId,
    lastChangedAt: scan.scannedAt,
    keyNo: scan.keyNo || existing?.keyNo || "",
    driveType: scan.driveType || existing?.driveType || "",
  };
  const next = {
    ...state,
    vehicles: { ...state.vehicles, [vin]: vehicle },
    scans: [...state.scans, { ...scan, vin, keyNo: scan.keyNo || "", status: flags.length ? "flagged" : "accepted" }],
    flags: [...state.flags, ...flags],
  };
  return { state: next, accepted: true, message: flags.length ? "Scan accepted with admin flag." : "Scan accepted." };
}

function flag(vin, type, message, meta = {}) {
  return { id: crypto.randomUUID(), vin, type, message, resolved: false, createdAt: new Date().toISOString(), ...meta };
}

function duplicateMessage(currentYardId, scanYardId) {
  const currentYard = yards.find((item) => item.id === currentYardId);
  const scanYard = yards.find((item) => item.id === scanYardId);
  return `Vehicle was IN at ${currentYard?.code || currentYardId} (${currentYard?.name || "Unknown"}), now scanned IN at ${scanYard?.code || scanYardId} (${scanYard?.name || "Unknown"}) without prior OUT scan.`;
}

function groupCount(items, key) {
  return items.reduce((acc, item) => ({ ...acc, [item[key]]: (acc[item[key]] || 0) + 1 }), {});
}

export function dashboard(state, yardId = null) {
  const visibleYardIds = yardId ? [yardId] : yards.map((yard) => yard.id);
  const visibleYards = yards.filter((yard) => visibleYardIds.includes(yard.id));
  const allVehicles = Object.values(state.vehicles);
  const visibleVehicles = allVehicles.filter((vehicle) => !yardId || vehicle.currentYardId === yardId);
  const inVehicles = visibleVehicles.filter((vehicle) => vehicle.currentStatus === "in");
  const models = Object.entries(groupCount(inVehicles, "model")).map(([model, count]) => ({
    model,
    count,
    pct: inVehicles.length > 0 ? Math.round((count / inVehicles.length) * 100) : 0,
  }));

  const yardsData = visibleYards.map((yard) => {
    const count = inVehicles.filter((vehicle) => vehicle.currentYardId === yard.id).length;
    const utilization = Math.round((count / yard.capacity) * 100);
    return {
      ...yard,
      count,
      utilization,
      risk: utilization >= 90 ? "critical" : utilization >= 75 ? "heavy" : "normal",
    };
  });

  const now = Date.now();
  const dwellDays = inVehicles.map((vehicle) => Math.max(1, Math.ceil((now - Date.parse(vehicle.lastChangedAt || now)) / 86400000)));

  // Dwell histogram buckets
  const dwellDistribution = {
    "< 24h": 0,
    "1-3 days": 0,
    "4-7 days": 0,
    "8-14 days": 0,
    "> 14 days": 0,
  };

  inVehicles.forEach((v) => {
    const days = Math.max(0, (now - Date.parse(v.lastChangedAt || now)) / 86400000);
    if (days < 1) dwellDistribution["< 24h"]++;
    else if (days <= 3) dwellDistribution["1-3 days"]++;
    else if (days <= 7) dwellDistribution["4-7 days"]++;
    else if (days <= 14) dwellDistribution["8-14 days"]++;
    else dwellDistribution["> 14 days"]++;
  });

  // Open flags for this scope
  const openFlagItems = state.flags.filter((f) => {
    if (f.resolved) return false;
    if (!yardId) return true;
    return state.vehicles[f.vin]?.currentYardId === yardId;
  });

  const totalCapacity = visibleYards.reduce((sum, y) => sum + y.capacity, 0);
  const overallUtilization = totalCapacity > 0 ? Math.round((inVehicles.length / totalCapacity) * 100) : 0;
  const highRiskYards = yardsData.filter((y) => y.utilization >= 85).length;

  const dwellAlertFlags = openFlagItems.filter((f) => f.type === 'dwell_exceeded');

  return {
    currentStock: inVehicles.length,
    totalVehiclesTracked: visibleVehicles.length,
    totalCapacity,
    overallUtilization,
    highRiskYards,
    averageDwellDays: dwellDays.length ? Math.round(dwellDays.reduce((a, b) => a + b, 0) / dwellDays.length) : 0,
    dwellAlertCount: dwellAlertFlags.length,
    openFlags: openFlagItems.length,
    models,
    yards: yardsData,
    dwellDistribution,
  };
}

export function flagLabel(type) {
  return {
    damage_reported: "Damage Reported",
    unverified_in: "OUT Without IN",
    yard_capacity_exceeded: "Capacity Exceeded",
    duplicate_yard_status: "Duplicate Yard IN",
    invalid_vin: "Invalid VIN",
    manual_admin_override: "Admin Override",
    dwell_exceeded: "Dwell Time Exceeded",
  }[type] || String(type || "Flag").replace(/_/g, " ");
}

export function resolveFlag(state, id) {
  return { ...state, flags: state.flags.map((flagItem) => flagItem.id === id ? { ...flagItem, resolved: true, resolvedAt: new Date().toISOString() } : flagItem) };
}

export function resolveFlagsByVin(state, vin) {
  const normalized = normalizeVin(vin);
  return {
    ...state,
    flags: state.flags.map((f) =>
      f.vin === normalized && !f.resolved
        ? { ...f, resolved: true, resolvedAt: new Date().toISOString() }
        : f
    ),
  };
}

export function updateVehicleAdmin(state, { vin, yardId, status, reason }) {
  const normalized = normalizeVin(vin);
  const existing = state.vehicles[normalized] || { vin: normalized, model: "", vinValid: isValidVin(normalized) };
  return {
    ...state,
    vehicles: {
      ...state.vehicles,
      [normalized]: { ...existing, currentStatus: status, currentYardId: status === "in" ? yardId : existing.currentYardId, lastChangedAt: new Date().toISOString(), overrideReason: reason },
    },
    flags: [...state.flags, flag(normalized, "manual_admin_override", reason)],
  };
}

export function updateVehicleDetails(state, vin, patch) {
  const normalized = normalizeVin(vin);
  const existing = state.vehicles[normalized];
  if (!existing) return state;
  return {
    ...state,
    vehicles: {
      ...state.vehicles,
      [normalized]: {
        ...existing,
        ...patch,
        lastChangedAt: patch.lastChangedAt || new Date().toISOString(),
      },
    },
  };
}

/** Re-key a vehicle after admin VIN typo correction. Remaps client flags/scans vin fields. */
export function renameVehicleVin(state, oldVin, newVin, patch = {}) {
  const from = normalizeVin(oldVin);
  const to = normalizeVin(newVin);
  if (!from || !to) return state;
  if (from === to) return updateVehicleDetails(state, from, patch);

  const existing = state.vehicles[from];
  if (!existing) return state;

  const vehicles = { ...state.vehicles };
  delete vehicles[from];
  vehicles[to] = {
    ...existing,
    ...patch,
    vin: to,
    vinValid: patch.vinValid !== undefined ? patch.vinValid : true,
    lastChangedAt: patch.lastChangedAt || new Date().toISOString(),
  };

  return {
    ...state,
    vehicles,
    flags: (state.flags || []).map((f) => (f.vin === from ? { ...f, vin: to } : f)),
    scans: (state.scans || []).map((s) => (s.vin === from ? { ...s, vin: to } : s)),
  };
}

export function parseDeliveredVins(text) {
  return [...new Set(String(text || "").split(/\s|,|;|\t|\n|\r/).map(normalizeVin).filter(isValidVin))];
}

export function removeVehicleFromState(state, vin) {
  const normalized = normalizeVin(vin);
  const vehicles = { ...state.vehicles };
  delete vehicles[normalized];
  return {
    ...state,
    vehicles,
    flags: (state.flags || []).filter((f) => f.vin !== normalized),
    scans: (state.scans || []).filter((s) => s.vin !== normalized),
  };
}

export function removeDeliveredVehicles(state, vins) {
  const deliveredVins = new Set(vins.map(normalizeVin).filter(isValidVin));
  const vehicles = Object.fromEntries(Object.entries(state.vehicles).filter(([vin]) => !deliveredVins.has(vin)));
  const delivered = [
    ...(state.delivered || []),
    ...[...deliveredVins].map((vin) => ({ vin, deliveredAt: new Date().toISOString() })),
  ];
  return { ...state, vehicles, delivered };
}
