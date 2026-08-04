import React, { useMemo, useState } from "react";
import { dismissDamageScan, getDamagedExtras, loadDismissedDamageScanIds } from "./dismissedDamage.js";
import {
  enrichFlag,
  flagDecisionCopy,
  runFlagAction,
  sortFlagsByPriority,
} from "./flagUtils.js";
import { flagLabel } from "../../stockyardLogic.js";

export function AttentionSection({
  state,
  setState,
  activeFlagsList,
  issueFilter,
  setIssueFilter,
  onShowPhoto,
  onEditVehicle,
  toast,
  onError,
}) {
  const [dismissedScanIds, setDismissedScanIds] = useState(() => loadDismissedDamageScanIds());
  const [actionLoading, setActionLoading] = useState(null);

  const damageFlags = useMemo(
    () => activeFlagsList.filter((f) => f.type === "damage_reported"),
    [activeFlagsList]
  );

  const damagedExtras = useMemo(
    () => getDamagedExtras(state, activeFlagsList, dismissedScanIds),
    [state, activeFlagsList, dismissedScanIds]
  );

  const filteredFlags = useMemo(() => {
    let list = activeFlagsList;
    if (issueFilter === "damage") list = activeFlagsList.filter((f) => f.type === "damage_reported");
    else if (issueFilter === "exceptions") list = activeFlagsList.filter((f) => f.type !== "damage_reported");
    return sortFlagsByPriority(list);
  }, [activeFlagsList, issueFilter]);

  async function handleFlagAction(action, flag) {
    if (!setState) return;
    setActionLoading(flag.id);
    await runFlagAction(action, flag, { state, setState, toast, onError });
    setActionLoading(null);
  }

  function handleDismissScan(item) {
    const next = dismissDamageScan(item.id);
    setDismissedScanIds(new Set(next));
    toast(`Damage marked handled for ${item.vin}.`);
  }

  const showExtras = issueFilter !== "exceptions";

  return (
    <div className="admin-section stack">
      <div className="admin-section-intro">
        <strong>Things that need a decision</strong>
        <span>Resolve exceptions and damage here. Everything else stays in Vehicles or Yards.</span>
      </div>

      <div className="admin-filter-chips" role="group" aria-label="Issue type">
        {[
          { id: "all", label: `All (${activeFlagsList.length + damagedExtras.length})` },
          { id: "exceptions", label: `Exceptions (${activeFlagsList.length - damageFlags.length})` },
          { id: "damage", label: `Damage (${damageFlags.length + damagedExtras.length})` },
        ].map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={issueFilter === chip.id ? "active" : ""}
            onClick={() => setIssueFilter(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {filteredFlags.length === 0 && (!showExtras || damagedExtras.length === 0) ? (
        <p className="notice ok">Nothing open. Yards are clear of exceptions.</p>
      ) : (
        <div className="admin-issue-list">
          {filteredFlags.map((raw) => {
            const flag = enrichFlag(raw, state);
            const decision = flagDecisionCopy(flag.type);
            const isDamage = flag.type === "damage_reported";
            const busy = actionLoading === flag.id;
            return (
              <article className="admin-issue" key={flag.id}>
                <div className="admin-issue-main">
                  <div className="admin-issue-title">
                    <b className="flag-vin">{flag.vin}</b>
                    <span className="flag-kind">{flagLabel(flag.type)}</span>
                    {flag.model && <span className="admin-issue-model">{flag.model}</span>}
                  </div>
                  <p className="flag-message">
                    {flag.createdAt && (
                      <time dateTime={flag.createdAt}>
                        {new Date(flag.createdAt).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    )}
                    {flag.createdAt ? " · " : ""}
                    {isDamage ? (flag.displayMessage || flag.damageRemark) : (flag.displayMessage || flag.message)}
                  </p>
                  <p className="flag-help">{decision.help}</p>
                  {isDamage && flag.damageImage && (
                    <button
                      type="button"
                      className="admin-photo-thumb"
                      onClick={() =>
                        onShowPhoto({
                          vin: flag.vin,
                          model: flag.model,
                          yardName: flag.yardLabel || "",
                          src: flag.damageImage,
                          remark: flag.damageRemark,
                        })
                      }
                    >
                      <img src={flag.damageImage} alt={`Damage for ${flag.vin}`} />
                      <span>View photo</span>
                    </button>
                  )}
                </div>
                {setState && (
                  <div className="flag-actions">
                    <button type="button" className="flag-btn ghost-flag" onClick={() => onEditVehicle(flag.vin)} disabled={busy}>
                      Edit vehicle
                    </button>
                    {flag.type === "duplicate_yard_status" && (
                      <button
                        type="button"
                        className="flag-btn primary-flag"
                        disabled={busy}
                        onClick={() => handleFlagAction("confirm_in", flag)}
                      >
                        Confirm IN at new yard
                      </button>
                    )}
                    {flag.type === "unverified_in" && (
                      <button
                        type="button"
                        className="flag-btn secondary-flag"
                        disabled={busy}
                        onClick={() => handleFlagAction("reconcile_in", flag)}
                      >
                        Reconcile missing IN
                      </button>
                    )}
                    <button
                      type="button"
                      className="flag-btn"
                      disabled={busy}
                      onClick={() => handleFlagAction("close", flag)}
                    >
                      {busy ? "Saving…" : decision.resolveLabel}
                    </button>
                  </div>
                )}
              </article>
            );
          })}

          {showExtras &&
            damagedExtras.map((item) => (
              <article className="admin-issue" key={item.id}>
                <div className="admin-issue-main">
                  <div className="admin-issue-title">
                    <b className="flag-vin">{item.vin}</b>
                    <span className="flag-kind">Damage (scan)</span>
                    <span className="admin-issue-model">{item.model}</span>
                  </div>
                  <p className="flag-message">
                    {item.createdAt && (
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    )}
                    {item.createdAt ? " · " : ""}
                    {item.yardName} · {item.damageRemark}
                  </p>
                  <p className="flag-help">Damage was logged on scan. Review evidence, then mark handled when done.</p>
                  {item.damageImage && (
                    <button
                      type="button"
                      className="admin-photo-thumb"
                      onClick={() =>
                        onShowPhoto({
                          vin: item.vin,
                          model: item.model,
                          yardName: item.yardName,
                          src: item.damageImage,
                          remark: item.damageRemark,
                        })
                      }
                    >
                      <img src={item.damageImage} alt={`Damage for ${item.vin}`} />
                      <span>View photo</span>
                    </button>
                  )}
                </div>
                <div className="flag-actions">
                  <button type="button" className="flag-btn ghost-flag" onClick={() => onEditVehicle(item.vin)}>
                    Edit vehicle
                  </button>
                  <button type="button" className="flag-btn" onClick={() => handleDismissScan(item)}>
                    Mark handled
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
    </div>
  );
}
