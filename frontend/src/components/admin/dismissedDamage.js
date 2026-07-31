import { detectModel, yards } from "../../stockyardLogic.js";

export function loadDismissedDamageScanIds() {
  try {
    const raw = localStorage.getItem("adminDismissedDamageScanIds");
    return new Set(JSON.parse(raw || "[]"));
  } catch {
    return new Set();
  }
}

export function dismissDamageScan(scanId) {
  const ids = loadDismissedDamageScanIds();
  ids.add(scanId);
  localStorage.setItem("adminDismissedDamageScanIds", JSON.stringify([...ids]));
  return ids;
}

export function getDamagedExtras(state, activeFlagsList, dismissedScanIds = loadDismissedDamageScanIds()) {
  const fromFlags = new Set(activeFlagsList.filter((f) => f.type === "damage_reported").map((f) => f.vin));
  if (!state?.scans) return [];
  return state.scans
    .filter((s) => s.damaged && !fromFlags.has(s.vin) && !dismissedScanIds.has(s.id || s.clientScanId))
    .map((scan) => {
      const vehicle = state?.vehicles?.[scan.vin];
      const yardObj = yards.find((y) => y.id === scan.yardId);
      return {
        id: scan.id || scan.clientScanId,
        vin: scan.vin,
        model: vehicle?.model || detectModel(scan.vin),
        yardName: yardObj?.name || scan.yardId || "Stockyard",
        damageRemark: scan.damageRemark || "Damage reported",
        damageImage: scan.damageImage || null,
        createdAt: scan.scannedAt || new Date().toISOString(),
      };
    });
}
