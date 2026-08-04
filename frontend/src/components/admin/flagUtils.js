import { resolveFlag, formatYardLabel } from "../../stockyardLogic.js";
import { resolveFlag as apiResolveFlag, adminOverrideVehicle } from "../../api.js";
import { displayFlagMessage } from "./flagDisplay.js";

export { displayFlagMessage } from "./flagDisplay.js";

export const FLAG_PRIORITY = {
  yard_capacity_exceeded: 1,
  duplicate_yard_status: 2,
  unverified_in: 3,
  dwell_exceeded: 4,
  damage_reported: 5,
  photo_upload_failed: 6,
  invalid_vin: 7,
};

export function flagDecisionCopy(type) {
  switch (type) {
    case "duplicate_yard_status":
      return {
        help: "Still marked IN at a different site (codes can be shared). Confirm the new site if that is correct, or close the flag if already fixed.",
        resolveLabel: "Close flag only",
      };
    case "unverified_in":
      return {
        help: "Scanned OUT with no prior IN. Reconcile to create the missing IN, or close if no stock change is needed.",
        resolveLabel: "Close flag only",
      };
    case "dwell_exceeded":
      return {
        help: "Parked longer than 30 days. Review the vehicle, then close this alert when handled.",
        resolveLabel: "Mark reviewed",
      };
    case "invalid_vin":
      return {
        help: "VIN format looks invalid. Close after correcting the record or confirming the plate.",
        resolveLabel: "Mark reviewed",
      };
    case "yard_capacity_exceeded":
      return {
        help: "Yard is over configured capacity. Close after redistributing stock or accepting the overflow.",
        resolveLabel: "Acknowledge",
      };
    case "damage_reported":
      return {
        help: "Damage was logged on scan. Review evidence, then close when handled.",
        resolveLabel: "Mark handled",
      };
    default:
      return {
        help: "Review this exception, then close it when no further action is needed.",
        resolveLabel: "Mark resolved",
      };
  }
}

export function sortFlagsByPriority(flags) {
  return [...flags].sort((a, b) => {
    const pa = FLAG_PRIORITY[a.type] ?? 99;
    const pb = FLAG_PRIORITY[b.type] ?? 99;
    if (pa !== pb) return pa - pb;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
}

export function enrichFlag(flag, state) {
  const scan = state?.scans?.find((s) => s.id === flag.scanId) || state?.scans?.find((s) => s.vin === flag.vin);
  return {
    ...flag,
    damageRemark: flag.damageRemark || scan?.damageRemark || flag.message,
    damageImage: flag.damageImage || scan?.damageImage || null,
    model: state?.vehicles?.[flag.vin]?.model || "",
    displayMessage: displayFlagMessage(flag, state),
  };
}

export function resolveYardIdForFlag(flag, state) {
  return flag.yardId || state?.vehicles?.[flag.vin]?.currentYardId || null;
}

export function countFlagsByYard(activeFlags, state) {
  const counts = {};
  for (const flag of activeFlags) {
    const yardId = resolveYardIdForFlag(flag, state);
    if (yardId) counts[yardId] = (counts[yardId] || 0) + 1;
  }
  return counts;
}

export async function runFlagAction(action, flag, { state, setState, toast, onError }) {
  try {
    if (action === "confirm_in") {
      const yardLabel = formatYardLabel(resolveYardIdForFlag(flag, state));
      await apiResolveFlag(flag.id);
      setState(resolveFlag(state, flag.id));
      toast(`Confirmed IN at ${yardLabel} for ${flag.vin}.`);
      return;
    }
    if (action === "reconcile_in") {
      await adminOverrideVehicle(flag.vin, "in", "Admin reconciled missing IN record");
      await apiResolveFlag(flag.id);
      setState(resolveFlag(state, flag.id));
      toast(`Reconciled missing IN for ${flag.vin}.`);
      return;
    }
    if (action === "close") {
      await apiResolveFlag(flag.id);
      setState(resolveFlag(state, flag.id));
      const isDamage = flag.type === "damage_reported";
      toast(isDamage ? `Damage closed for ${flag.vin}.` : `Flag closed for ${flag.vin}.`);
    }
  } catch (err) {
    onError(err.message || "Action failed.");
  }
}
