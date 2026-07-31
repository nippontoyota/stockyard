/**
 * Lightweight localStorage snapshot of last successful server sync.
 * Hydrates stock/dashboard/requisitions when offline or API is unreachable.
 */

const PREFIX = "yardDataSnapshot:";

function snapshotKey(session) {
  if (!session) return null;
  const scope =
    session.role === "stockyard"
      ? session.yardId
      : session.role === "delivery_incharge"
        ? session.branchId
        : "admin";
  return `${PREFIX}${session.role}:${scope || "unknown"}`;
}

export function saveSnapshot(session, payload) {
  const key = snapshotKey(session);
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        syncedAt: new Date().toISOString(),
        vehicles: payload.vehicles,
        flags: payload.flags,
        scans: payload.scans,
        notifications: payload.notifications,
        requisitions: payload.requisitions,
      })
    );
  } catch (err) {
    console.warn("[offline-snapshot] save failed", err);
  }
}

export function loadSnapshot(session) {
  const key = snapshotKey(session);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.syncedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function formatSnapshotAge(syncedAt) {
  const ms = Date.now() - Date.parse(syncedAt);
  if (Number.isNaN(ms) || ms < 0) return "unknown time";
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) {
    const mins = Math.max(1, Math.round(ms / 60_000));
    return `${mins} min ago`;
  }
  if (ms < 86_400_000) {
    const hrs = Math.max(1, Math.round(ms / 3_600_000));
    return `${hrs} hr ago`;
  }
  const days = Math.max(1, Math.round(ms / 86_400_000));
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function applySnapshotToState(baseState, snapshot) {
  if (!snapshot) return baseState;
  return {
    ...baseState,
    vehicles: snapshot.vehicles || {},
    flags: snapshot.flags || [],
    scans: snapshot.scans || [],
    notifications: snapshot.notifications || [],
    requisitions: snapshot.requisitions || { incoming: [], outgoing: [] },
  };
}
