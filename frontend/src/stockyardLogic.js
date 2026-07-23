export const STORAGE_KEY = "yardScanState";

export const yards = [
  ["CO01A-1", "CO01A", "Nettur Showroom, Cochin", 125, 9.9369, 76.3149, 250],
  ["CO01B-1", "CO01B", "Kalamasery, Cochin", 200, 10.0529, 76.3157, 250],
  ["CO01B-2", "CO01B", "Nippon Tower - 7th floor, Cochin", 80, 9.9667, 76.2999, 120],
  ["KY01A-1", "KY01A", "Showroom, Kayamkulam", 60, 9.1746, 76.5004, 250],
  ["KY01A-2", "KY01A", "Ramapuram East, Kayamkulam", 210, 9.185, 76.517, 300],
  ["KY01A-3", "KY01A", "Ramapuram West, Kayamkulam", 80, 9.184, 76.493, 300],
  ["KY01A-4", "KY01A", "Evoor Yard, Kayamkulam", 110, 9.1923, 76.482, 300],
  ["IR01A-1", "IR01A", "Showroom, Irinjalakuda", 30, 10.342, 76.211, 200],
  ["KL01A-1", "KL01A", "Showroom, Kollam", 55, 8.8932, 76.6141, 200],
  ["KL01B-1", "KL01B", "Thazhuthala, Kollam", 225, 8.8795, 76.645, 300],
  ["TI01A-1", "TI01A", "Peramangalam, Trissur", 175, 10.588, 76.172, 300],
  ["MV01A-1", "MV01A", "Muvattupuzha", 105, 9.9849, 76.5773, 250],
  ["PH01A-1", "PH01A", "Pathanamthitta", 70, 9.2648, 76.787, 250],
  ["TL01A-1", "TL01A", "Thiruvalla", 45, 9.3835, 76.5741, 250],
  ["TR01C-1", "TR01C", "Vallakkadavu, Trivandrum", 45, 8.482, 76.928, 200],
  ["TR01C-2", "TR01C", "Enchakkal, Trivandrum", 20, 8.4827, 76.919, 200],
  ["TR01A-1", "TR01A", "Showroom, Kazhakuttam, Trivandrum", 40, 8.568, 76.873, 200],
  ["TR01A-2", "TR01A", "Yard-1, Kazhakuttam, Trivandrum", 130, 8.571, 76.875, 250],
  ["TR01A-3", "TR01A", "Yard-2, Kazhakuttam, Trivandrum", 65, 8.573, 76.877, 250],
  ["TR01A-4", "TR01A", "Yard-3, Kazhakuttam, Trivandrum", 130, 8.575, 76.879, 250],
  ["KT01A-1", "KT01A", "Kottayam, behind the showroom", 300, 9.5916, 76.5222, 300],
].map(([id, code, name, capacity, latitude, longitude, gpsRadiusMeters]) => ({ id, code, name, capacity, latitude, longitude, gpsRadiusMeters }));

export function createInitialState(now = new Date().toISOString()) {
  const deviceId = localStorage.getItem("yardDeviceId") || crypto.randomUUID();
  localStorage.setItem("yardDeviceId", deviceId);
  const vehicles = {};
  const scans = [];
  const flags = [];
  return { deviceId, vehicles, scans, flags, queue: [] };
}

export function createClientScanId() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

export function createScan({ vin, type, yardId, gps, outRemark = "", damaged = false, damageRemark = "" }) {
  return {
    id: crypto.randomUUID(),
    clientScanId: createClientScanId(),
    vinRaw: vin,
    type,
    yardId,
    gps,
    outRemark,
    damaged,
    damageRemark,
    deviceId: localStorage.getItem("yardDeviceId") || "unknown-device",
    scannedAt: new Date().toISOString(),
    syncStatus: "queued",
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

export function detectModel(vin) {
  const text = String(vin || "").toUpperCase().trim();
  const vds = text.substring(3, 6);

  // Direct VDS code mapping for Toyota & Lexus India (TKM, CBU, Alliance models)
  const map = {
    MXA: "Innova Hycross",
    MXP: "Innova Hycross",
    KUN: "Innova Crysta",
    GUN: "Fortuner",
    GD6: "Hilux",
    NHP: "Urban Cruiser Hyryder",
    NSP: "Glanza",
    MSP: "Rumion",
    TAA: "Urban Cruiser Taisor",
    ASK: "Camry Hybrid",
    AGH: "Vellfire",
    AAH: "Vellfire",
    GRJ: "Land Cruiser 300",
    FJA: "Land Cruiser 300",
    ZSA: "Urban Cruiser",
    BJ1: "Lexus ES 300h",
    HZ1: "Lexus RX 350h",
    AA1: "Lexus NX 350h",
    AH1: "Lexus LM 350h",
    URJ: "Lexus LX 600",
    VJA: "Lexus LX 600",
  };

  // Lexus WMI checks
  if (text.startsWith("JTH")) return map[vds] ? map[vds] : "Lexus ES 300h";
  if (text.startsWith("JTJ")) return map[vds] ? map[vds] : "Lexus RX 350h";

  if (map[vds]) return map[vds];

  // Keyword and WMI/VDS pattern fallbacks
  if (text.includes("LEXUS") || text.includes("RX350") || text.includes("RX500")) return "Lexus RX 350h";
  if (text.includes("NX350") || text.includes("NX250")) return "Lexus NX 350h";
  if (text.includes("ES300")) return "Lexus ES 300h";
  if (text.includes("LM350")) return "Lexus LM 350h";
  if (text.includes("LX600") || text.includes("LX570")) return "Lexus LX 600";
  if (text.includes("HYCROSS")) return "Innova Hycross";
  if (text.includes("CRYSTA") || text.includes("INNOVA")) return "Innova Crysta";
  if (text.includes("FORTUNER") || text.includes("LEGENDER")) return "Fortuner";
  if (text.includes("HYRYDER")) return "Urban Cruiser Hyryder";
  if (text.includes("GLANZA")) return "Glanza";
  if (text.includes("HILUX") || text.startsWith("JTMBA")) return "Hilux";
  if (text.includes("RUMION")) return "Rumion";
  if (text.includes("TAISOR")) return "Urban Cruiser Taisor";
  if (text.includes("CAMRY")) return "Camry Hybrid";
  if (text.includes("VELLFIRE")) return "Vellfire";
  if (text.includes("CRUISER") || text.includes("LAND")) return "Land Cruiser 300";

  // Standard Toyota / Lexus India default fallbacks
  if (text.startsWith("JTH") || text.startsWith("JTJ")) return "Lexus Vehicle";
  return "Toyota Vehicle";
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
  if (gpsFlag(scan.gps, yard)) flags.push(flag(vin, "gps_outside_yard", "GPS missing or outside yard radius."));

  if (duplicateIn) flags.push(flag(vin, "duplicate_yard_status", duplicateMessage(existing.currentYardId, scan.yardId)));

  if (scan.type === "out" && !existing) flags.push(flag(vin, "unverified_in", "OUT scan has no prior IN record."));
  if (scan.type === "out" && scan.damaged) flags.push(flag(vin, "damage_reported", scan.damageRemark || "Damage reported."));

  const vehicle = {
    vin,
    model: existing?.model || detectModel(vin),
    variant: existing?.variant || "Standard",
    colour: existing?.colour || "Not set",
    vinValid,
    currentStatus: scan.type,
    currentYardId: scan.type === "in" ? scan.yardId : existing?.currentYardId || scan.yardId,
    lastChangedAt: scan.scannedAt,
  };
  const next = {
    ...state,
    vehicles: { ...state.vehicles, [vin]: vehicle },
    scans: [...state.scans, { ...scan, vin, status: flags.length ? "flagged" : "accepted" }],
    flags: [...state.flags, ...capacityFlags(state, scan, vin), ...flags],
    queue: scan.syncStatus === "queued" ? [...state.queue, scan.clientScanId] : state.queue,
  };
  return { state: next, accepted: true, message: flags.length ? "Scan accepted with admin flag." : "Scan accepted." };
}

function flag(vin, type, message) {
  return { id: crypto.randomUUID(), vin, type, message, resolved: false, createdAt: new Date().toISOString() };
}

function duplicateMessage(currentYardId, scanYardId) {
  const currentYard = yards.find((item) => item.id === currentYardId);
  const scanYard = yards.find((item) => item.id === scanYardId);
  return `Vehicle was IN at ${currentYard?.code || currentYardId} (${currentYard?.name || "Unknown"}), now scanned IN at ${scanYard?.code || scanYardId} (${scanYard?.name || "Unknown"}) without prior OUT scan.`;
}

function capacityFlags(state, scan, vin) {
  if (scan.type !== "in") return [];
  const yard = yards.find((item) => item.id === scan.yardId);
  const count = Object.values(state.vehicles).filter((vehicle) => vehicle.currentStatus === "in" && vehicle.currentYardId === scan.yardId).length;
  return count + 1 > yard.capacity ? [flag(vin, "yard_capacity_exceeded", `${yard.name} is above capacity.`)] : [];
}

function gpsFlag(gps, yard) {
  if (!gps?.latitude || !gps?.longitude || !yard) return true;
  return distanceMeters(gps.latitude, gps.longitude, yard.latitude, yard.longitude) > yard.gpsRadiusMeters;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  // Dwell by model
  const modelDwellMap = {};
  inVehicles.forEach((v) => {
    const m = v.model || "Unknown";
    const days = Math.max(1, Math.ceil((now - Date.parse(v.lastChangedAt || now)) / 86400000));
    if (!modelDwellMap[m]) modelDwellMap[m] = { totalDays: 0, count: 0 };
    modelDwellMap[m].totalDays += days;
    modelDwellMap[m].count += 1;
  });

  const dwellByModel = Object.entries(modelDwellMap).map(([model, data]) => ({
    model,
    avgDays: Math.round(data.totalDays / data.count),
    count: data.count,
  }));

  // Flag breakdown
  const openFlagItems = state.flags.filter((f) => {
    if (f.resolved) return false;
    if (!yardId) return true;
    return state.vehicles[f.vin]?.currentYardId === yardId;
  });
  const flagTypeCounts = {};
  openFlagItems.forEach((f) => {
    const type = f.type || "other";
    flagTypeCounts[type] = (flagTypeCounts[type] || 0) + 1;
  });

  const flagBreakdown = Object.entries(flagTypeCounts).map(([type, count]) => ({
    type,
    label: formatFlagLabel(type),
    count,
  }));

  const totalCapacity = visibleYards.reduce((sum, y) => sum + y.capacity, 0);
  const overallUtilization = totalCapacity > 0 ? Math.round((inVehicles.length / totalCapacity) * 100) : 0;
  const highRiskYards = yardsData.filter((y) => y.utilization >= 85).length;

  return {
    currentStock: inVehicles.length,
    totalVehiclesTracked: visibleVehicles.length,
    totalCapacity,
    overallUtilization,
    highRiskYards,
    averageDwellDays: dwellDays.length ? Math.round(dwellDays.reduce((a, b) => a + b, 0) / dwellDays.length) : 0,
    openFlags: openFlagItems.length,
    models,
    yards: yardsData,
    dwellDistribution,
    dwellByModel,
    flagBreakdown,
  };
}

function formatFlagLabel(type) {
  const map = {
    damage_reported: "Damage Reported",
    gps_outside_yard: "GPS Radius Violation",
    unverified_in: "Unverified OUT",
    yard_capacity_exceeded: "Capacity Exceeded",
    duplicate_yard_status: "Duplicate Status",
    invalid_vin: "Invalid VIN Format",
    manual_admin_override: "Admin Override",
  };
  return map[type] || type.replace(/_/g, " ");
}

function groupCount(items, key) {
  return items.reduce((acc, item) => ({ ...acc, [item[key]]: (acc[item[key]] || 0) + 1 }), {});
}

export function resolveFlag(state, id) {
  return { ...state, flags: state.flags.map((flagItem) => flagItem.id === id ? { ...flagItem, resolved: true, resolvedAt: new Date().toISOString() } : flagItem) };
}

export function updateVehicleAdmin(state, { vin, yardId, status, reason }) {
  const normalized = normalizeVin(vin);
  const existing = state.vehicles[normalized] || { vin: normalized, model: detectModel(normalized), vinValid: isValidVin(normalized) };
  return {
    ...state,
    vehicles: {
      ...state.vehicles,
      [normalized]: { ...existing, currentStatus: status, currentYardId: status === "in" ? yardId : existing.currentYardId, lastChangedAt: new Date().toISOString(), overrideReason: reason },
    },
    flags: [...state.flags, flag(normalized, "manual_admin_override", reason)],
  };
}

export function parseDeliveredVins(text) {
  return [...new Set(String(text || "").split(/\s|,|;|\t|\n|\r/).map(normalizeVin).filter(isValidVin))];
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
