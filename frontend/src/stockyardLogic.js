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

export function decodeVinDetails(vinRaw) {
  const vin = String(vinRaw || "").toUpperCase().trim();
  if (!vin || vin.length < 5) {
    return {
      model: "Toyota Vehicle",
      variant: "Standard Spec",
      colour: "TKM Assembly",
    };
  }

  const wmi = vin.substring(0, 3);
  const char4 = vin.charAt(3);
  const char5 = vin.charAt(4);
  const char6 = vin.charAt(5);
  const char10 = vin.charAt(9);
  const char11 = vin.charAt(10);
  const vds = vin.substring(3, 6);

  // 1. Model Determination
  let make = "Toyota";
  let modelName = "";

  if (wmi === "JTH" || wmi === "JTJ" || vin.includes("LEXUS")) {
    make = "Lexus";
    if (char4 === "B" || vds === "BJ1" || vin.includes("ES300")) modelName = "ES 300h";
    else if (char4 === "H" || char4 === "R" || vds === "HZ1" || vin.includes("RX350")) modelName = "RX 350h";
    else if (char4 === "A" || char4 === "N" || vds === "AA1" || vin.includes("NX350")) modelName = "NX 350h";
    else if (char4 === "M" || char4 === "L" || vds === "AH1" || vin.includes("LM350")) modelName = "LM 350h";
    else if (char4 === "U" || vds === "URJ" || vds === "VJA" || vin.includes("LX600")) modelName = "LX 600";
    else modelName = "Luxury Vehicle";
  } else {
    make = "Toyota";
    if (char4 === "U" || vin.includes("HYRYDER")) modelName = "Urban Cruiser Hyryder";
    else if (char4 === "A" || char4 === "X" || char4 === "B" || char4 === "C" || vin.includes("INNOVA") || vin.includes("HYCROSS")) {
      if (char5 === "U" || char5 === "N" || char5 === "K" || vin.includes("CRYSTA")) modelName = "Innova Crysta";
      else modelName = "Innova Hycross";
    } else if (char4 === "D" || char4 === "E" || char4 === "F" || char4 === "G" || vin.includes("FORTUNER")) {
      if (char5 === "E" || char5 === "L" || vin.includes("LEGENDER")) modelName = "Fortuner Legender";
      else modelName = "Fortuner";
    } else if (char4 === "H" || vin.includes("HILUX") || vin.startsWith("JTMBA")) modelName = "Hilux";
    else if (char4 === "J" || vin.includes("RUMION")) modelName = "Rumion";
    else if (char4 === "K" || char4 === "T" || vin.includes("TAISOR")) modelName = "Urban Cruiser Taisor";
    else if (char4 === "S" || char4 === "Z" || char4 === "G" || vin.includes("GLANZA")) modelName = "Glanza";
    else if (char4 === "L" || vin.includes("CAMRY")) modelName = "Camry Hybrid";
    else if (char4 === "M" || char4 === "V" || vin.includes("VELLFIRE")) modelName = "Vellfire";
    else if (char4 === "R" || char4 === "W" || vin.includes("CRUISER") || vin.includes("LAND")) modelName = "Land Cruiser 300";
    else modelName = wmi === "MBJ" ? `TKM Series (${vds || "India"})` : `Series (${vds || "Spec"})`;
  }

  const fullModel = `${make} ${modelName}`;

  // 2. Year Decoding (10th character ISO 3779 standard)
  const yearMap = {
    P: "2023",
    R: "2024",
    S: "2025",
    T: "2026",
    V: "2027",
    W: "2028",
    X: "2029",
    Y: "2030",
    "1": "2031",
    "2": "2032",
    L: "2020",
    M: "2021",
    N: "2022",
  };
  const modelYear = yearMap[char10] ? `${yearMap[char10]} MY` : "2026 MY";

  // 3. Engine / Powertrain Spec Decoding (5th & 6th characters)
  let engineSpec = "";
  if (["Y", "H", "M", "X", "1"].includes(char5) || ["Y", "H", "M"].includes(char6)) {
    engineSpec = "1.5L / 2.0L NeoDrive Hybrid";
  } else if (["D", "G", "U", "N", "5"].includes(char5) || ["D", "G"].includes(char6)) {
    engineSpec = "2.8L / 2.4L GD Turbo Diesel";
  } else {
    engineSpec = "Dual VVT-i Petrol";
  }

  // 4. Plant Origin (11th character)
  let plantOrigin = "";
  if (["E", "K", "M", "0", "1", "2"].includes(char11)) {
    plantOrigin = "TKM Bidadi Plant";
  } else if (["A", "B", "C", "J", "U"].includes(char11)) {
    plantOrigin = "Toyota Japan CBU";
  } else if (["S", "G"].includes(char11)) {
    plantOrigin = "Alliance Gujarat";
  } else {
    plantOrigin = "TKM Factory";
  }

  return {
    model: fullModel,
    variant: `${engineSpec} · ${modelYear}`,
    colour: plantOrigin,
  };
}

export function detectModel(vin) {
  return decodeVinDetails(vin).model;
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

  const decoded = decodeVinDetails(vin);
  const vehicle = {
    vin,
    model: existing?.model && existing.model !== "Toyota Vehicle" ? existing.model : decoded.model,
    variant: existing?.variant && existing.variant !== "Standard" ? existing.variant : decoded.variant,
    colour: existing?.colour && existing.colour !== "Not set" ? existing.colour : decoded.colour,
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
