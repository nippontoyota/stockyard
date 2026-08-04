import { formatYardLabel, findYardById, yards } from "../../stockyardLogic.js";

function labelFromCodeOrId(token) {
  const raw = String(token || "").trim();
  if (!raw) return "Unknown";
  if (raw.includes(" · ")) return raw;
  const byId = findYardById(raw);
  if (byId) return formatYardLabel(byId);
  const byCode = yards.filter((y) => y.code === raw);
  if (byCode.length === 1) return formatYardLabel(byCode[0]);
  // Shared code (e.g. TR01C spanning multiple sites) — keep code; site resolved elsewhere when known.
  return raw;
}

function resolvePriorYardId(flag, state, newYardId) {
  if (!newYardId || !state?.scans?.length) return null;
  const flagTime = flag.createdAt ? new Date(flag.createdAt).getTime() : Number.POSITIVE_INFINITY;
  const prior = state.scans
    .filter((s) => s.vin === flag.vin && s.type === "in" && s.yardId && s.yardId !== newYardId)
    .filter((s) => !s.scannedAt || new Date(s.scannedAt).getTime() <= flagTime)
    .sort((a, b) => new Date(b.scannedAt || 0).getTime() - new Date(a.scannedAt || 0).getTime());
  return prior[0]?.yardId || null;
}

/** Display-only: never writes to DB. Enriches bare yard codes with code · name. */
export function displayFlagMessage(flag, state) {
  const message = flag?.message || "";

  if (flag.type === "duplicate_yard_status") {
    const newYardId = flag.yardId || null;
    const priorYardId = resolvePriorYardId(flag, state, newYardId);
    const legacy = message.match(
      /was IN at(?: yard)? (.+?), now scanned IN at (.+?)(?:\s+without prior OUT scan\.?)?$/i
    );
    const oldToken = priorYardId || legacy?.[1] || "";
    const newToken = newYardId || legacy?.[2] || "";
    if (oldToken || newToken) {
      return `Vehicle was IN at ${labelFromCodeOrId(oldToken)}, now scanned IN at ${labelFromCodeOrId(newToken)}`;
    }
  }

  if (flag.type === "dwell_exceeded") {
    // Legacy: "... at yard TR01C-1" or "... at TR01C-1"
    const m = message.match(/^(Vehicle has been IN for \d+ days at )(?:yard )?(.+)$/i);
    if (m) return `${m[1]}${labelFromCodeOrId(m[2])}`;
  }

  // Generic: replace known site ids embedded as whole tokens
  return message.replace(/\b([A-Z]{2}\d{2}[A-Z]-\d+)\b/g, (id) => formatYardLabel(id, id));
}
