import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { YardVehiclesModal } from "./YardVehiclesModal.jsx";
import { CredentialsTab } from "./CredentialsTab.jsx";
import { TransitUploadTab } from "./TransitUploadTab.jsx";
import { AllVehiclesTab } from "./AllVehiclesTab.jsx";
import { BranchesTab } from "./BranchesTab.jsx";
import {
  flagLabel,
  resolveFlag,
  yards,
  detectModel,
  YARD_REGIONS,
  yardsByRegion,
  parseDeliveredVins,
  removeDeliveredVehicles,
  updateVehicleAdmin,
} from "../stockyardLogic.js";
import { resolveFlag as apiResolveFlag, adminOverrideVehicle, deliverVehicles } from "../api.js";
import { useWebPush } from "../hooks/useWebPush.js";

const SECTIONS = [
  { id: "attention", label: "Attention", icon: "priority_high" },
  { id: "yards", label: "Yards", icon: "warehouse" },
  { id: "vehicles", label: "Vehicles", icon: "directions_car" },
  { id: "setup", label: "Setup", icon: "tune" },
];

function flagDecisionCopy(type) {
  switch (type) {
    case "duplicate_yard_status":
      return {
        help: "Still marked IN at another yard. Confirm the new yard if that is correct, or close the flag if already fixed.",
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
    case "gps_outside_yard":
      return {
        help: "Scan GPS was outside the yard radius. Close after verifying the vehicle location.",
        resolveLabel: "Mark verified",
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

function StatusStrip({ stats, openFlags, damageCount, transitCount, onJump }) {
  return (
    <div className="admin-status-strip" role="navigation" aria-label="Admin status">
      <button type="button" className="admin-status-chip" onClick={() => onJump("yards")}>
        <span className="admin-status-value">{stats.currentStock}</span>
        <span className="admin-status-label">In stock</span>
      </button>
      <button type="button" className={`admin-status-chip ${openFlags > 0 ? "warn" : ""}`} onClick={() => onJump("attention")}>
        <span className="admin-status-value">{openFlags}</span>
        <span className="admin-status-label">Open flags</span>
      </button>
      <button type="button" className={`admin-status-chip ${damageCount > 0 ? "warn" : ""}`} onClick={() => onJump("attention")}>
        <span className="admin-status-value">{damageCount}</span>
        <span className="admin-status-label">Damage</span>
      </button>
      <button type="button" className={`admin-status-chip ${transitCount > 0 ? "info" : ""}`} onClick={() => onJump("vehicles")}>
        <span className="admin-status-value">{transitCount}</span>
        <span className="admin-status-label">In transit</span>
      </button>
      <button type="button" className="admin-status-chip" onClick={() => onJump("yards")}>
        <span className="admin-status-value">{stats.overallUtilization}%</span>
        <span className="admin-status-label">Utilisation</span>
      </button>
    </div>
  );
}

function ManualOverride({ state, setState }) {
  const [vin, setVin] = useState("");
  const [yardId, setYardId] = useState(yards[0]?.id || "");
  const [status, setStatus] = useState("out");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const selectedYard = yards.find((y) => y.id === yardId);
  const consequence =
    status === "out"
      ? `Marks ${vin || "this VIN"} as OUT and clears its current yard.`
      : `Marks ${vin || "this VIN"} as IN at ${selectedYard ? `${selectedYard.code} · ${selectedYard.name}` : "the selected yard"}.`;

  async function submit(event) {
    event.preventDefault();
    setFormError("");
    setFormSuccess("");
    const confirmed = window.confirm(
      status === "out"
        ? `Force close OUT for ${vin}?\n\n${consequence}\n\nThis is logged as a manual admin override.`
        : `Reassign ${vin} as IN?\n\n${consequence}\n\nThis is logged as a manual admin override.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const targetVin = vin;
      await adminOverrideVehicle(targetVin, status, reason, status === "in" ? yardId : null);
      setState(updateVehicleAdmin(state, { vin: targetVin, yardId, status, reason }));
      setVin("");
      setReason("");
      setFormSuccess(status === "out" ? `Forced OUT for ${targetVin}.` : `Set IN at ${selectedYard?.code || yardId} for ${targetVin}.`);
    } catch (err) {
      setFormError(err.message || "Override failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="stack admin-tool-form" onSubmit={submit}>
      <p className="field-hint">Use only when a physical scan failed. Every change is audited with your note.</p>
      <label htmlFor="override-vin">VIN</label>
      <input
        id="override-vin"
        required
        value={vin}
        onChange={(event) => setVin(event.target.value.toUpperCase())}
        placeholder="17-character VIN"
        autoComplete="off"
        spellCheck={false}
      />
      <label htmlFor="override-status">What should happen?</label>
      <select id="override-status" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="out">Force close — mark vehicle OUT</option>
        <option value="in">Reassign — mark vehicle IN at a yard</option>
      </select>
      {status === "in" && (
        <>
          <label htmlFor="override-yard">Destination yard</label>
          <select id="override-yard" value={yardId} onChange={(event) => setYardId(event.target.value)} required>
            {yardsByRegion().map(({ region, yards: regionYards }) => (
              <optgroup key={region} label={region}>
                {regionYards.map((yard) => (
                  <option value={yard.id} key={yard.id}>{yard.code} · {yard.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </>
      )}
      <label htmlFor="override-reason">Why are you changing this?</label>
      <textarea
        id="override-reason"
        required
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="e.g. Vehicle left without OUT scan — confirmed with yard supervisor"
        rows={3}
      />
      <div className="notice info" role="status">
        <strong>Result:</strong> {consequence}
      </div>
      {formError && <p className="notice bad">{formError}</p>}
      {formSuccess && <p className="notice ok">{formSuccess}</p>}
      <button className="primary" disabled={loading || !vin.trim() || !reason.trim()}>
        {loading ? "Applying…" : status === "out" ? "Force close OUT" : "Reassign as IN"}
      </button>
    </form>
  );
}

function DeliveredCleanup({ state, setState }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("ok");
  const [loading, setLoading] = useState(false);
  const vins = useMemo(() => parseDeliveredVins(text), [text]);
  const liveMatches = vins.filter((vin) => state.vehicles[vin]);
  const unmatched = vins.length - liveMatches.length;

  function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const workbook = XLSX.read(reader.result, { type: "array" });
        setText(workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join("\n"));
        return;
      }
      setText(String(reader.result || ""));
    };
    if (file.name.toLowerCase().endsWith(".xlsx")) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }

  async function submit(event) {
    event.preventDefault();
    if (!liveMatches.length) {
      setMessageTone("warn");
      setMessage("No matching live vehicles found. Nothing will be removed.");
      return;
    }
    const confirmed = window.confirm(
      `Remove ${liveMatches.length} live vehicle${liveMatches.length === 1 ? "" : "s"} from stock?\n\n` +
      `${unmatched > 0 ? `${unmatched} VIN${unmatched === 1 ? "" : "s"} in the list are not in live stock and will be ignored.\n\n` : ""}` +
      "This cannot be undone from this screen."
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      await deliverVehicles(liveMatches);
      setState(removeDeliveredVehicles(state, vins));
      setMessageTone("ok");
      setMessage(`Removed ${liveMatches.length} delivered vehicle${liveMatches.length === 1 ? "" : "s"} from live stock.`);
      setText("");
    } catch (err) {
      setMessageTone("bad");
      setMessage(`Could not sync: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="stack admin-tool-form" onSubmit={submit}>
      <p className="field-hint">Paste or upload VINs already delivered to customers. Matching vehicles are removed from live stock.</p>
      <label htmlFor="delivered-file">Excel / CSV file (optional)</label>
      <input id="delivered-file" type="file" accept=".xlsx,.csv,.txt" onChange={upload} />
      <label htmlFor="delivered-vins">VIN list</label>
      <textarea
        id="delivered-vins"
        rows="6"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste VINs, one per line or from an Excel column"
      />
      <div className="delivered-counts">
        <span><b>{vins.length}</b> VINs parsed</span>
        <span><b>{liveMatches.length}</b> in live stock</span>
        {unmatched > 0 && <span className="delivered-unmatched"><b>{unmatched}</b> not in stock</span>}
      </div>
      {liveMatches.length > 0 && (
        <div className="notice warn" role="status">
          Confirming will permanently remove {liveMatches.length} vehicle{liveMatches.length === 1 ? "" : "s"} from live stock.
        </div>
      )}
      <button className="primary" disabled={!vins.length || loading || liveMatches.length === 0}>
        {loading ? "Removing…" : `Remove ${liveMatches.length || 0} from live stock`}
      </button>
      {message && <p className={`notice ${messageTone}`}>{message}</p>}
    </form>
  );
}

export function AdminHome({ stats, state, setState }) {
  const [section, setSection] = useState("attention");
  const [toastMessage, setToastMessage] = useState("");
  const [selectedYardModal, setSelectedYardModal] = useState(null);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState(null);
  const [yardSearch, setYardSearch] = useState("");
  const [issueFilter, setIssueFilter] = useState("all");
  const [vehicleTool, setVehicleTool] = useState(null);
  const { isSubscribed, permission, subscribe, unsubscribe } = useWebPush();

  const activeFlagsList = state ? state.flags.filter((f) => !f.resolved) : [];
  const damageFlags = activeFlagsList.filter((f) => f.type === "damage_reported");
  const transitVehicles = state?.vehicles ? Object.values(state.vehicles).filter((v) => v.currentStatus === "transit") : [];
  const transitCount = transitVehicles.length;

  const damagedExtras = useMemo(() => {
    const fromFlags = new Set(damageFlags.map((f) => f.vin));
    if (!state?.scans) return [];
    return state.scans
      .filter((s) => s.damaged && !fromFlags.has(s.vin))
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
          flagId: null,
        };
      });
  }, [state, damageFlags]);

  const filteredFlags = useMemo(() => {
    if (issueFilter === "damage") return activeFlagsList.filter((f) => f.type === "damage_reported");
    if (issueFilter === "exceptions") return activeFlagsList.filter((f) => f.type !== "damage_reported");
    return activeFlagsList;
  }, [activeFlagsList, issueFilter]);

  const searchFilteredYards = useMemo(() => {
    const q = yardSearch.trim().toLowerCase();
    if (!q) return stats.yards;
    return stats.yards.filter(
      (yard) =>
        yard.name.toLowerCase().includes(q) ||
        yard.code.toLowerCase().includes(q) ||
        yard.id.toLowerCase().includes(q) ||
        (yard.city || "").toLowerCase().includes(q)
    );
  }, [stats.yards, yardSearch]);

  const yardsGroupedByRegion = useMemo(
    () =>
      YARD_REGIONS.map((region) => ({
        region,
        yards: searchFilteredYards.filter((yard) => yard.city === region),
      })).filter((group) => group.yards.length > 0),
    [searchFilteredYards]
  );

  function toast(msg) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  }

  function enrichFlag(flag) {
    const scan = state?.scans?.find((s) => s.vin === flag.vin || s.id === flag.scanId);
    return {
      ...flag,
      damageRemark: flag.damageRemark || scan?.damageRemark || flag.message,
      damageImage: flag.damageImage || scan?.damageImage || null,
      model: state?.vehicles?.[flag.vin]?.model || detectModel(flag.vin),
    };
  }

  async function closeFlag(flagId, vin, msg) {
    try {
      await apiResolveFlag(flagId);
      setState(resolveFlag(state, flagId));
      toast(msg || `Flag closed for ${vin}.`);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <section className="admin-console">
      <header className="admin-console-header">
        <div>
          <h1>Admin</h1>
          <p>Fix issues, manage stock, and configure access — one place.</p>
        </div>
      </header>

      <StatusStrip
        stats={stats}
        openFlags={activeFlagsList.length}
        damageCount={damageFlags.length + damagedExtras.length}
        transitCount={transitCount}
        onJump={setSection}
      />

      <nav className="admin-section-nav" role="tablist" aria-label="Admin sections">
        {SECTIONS.map((s) => {
          let badge = 0;
          if (s.id === "attention") badge = activeFlagsList.length;
          if (s.id === "vehicles") badge = transitCount;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={section === s.id}
              className={section === s.id ? "active" : ""}
              onClick={() => setSection(s.id)}
            >
              <span className="material-symbols-outlined">{s.icon}</span>
              <span>{s.label}</span>
              {badge > 0 && <span className="admin-section-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>

      {toastMessage && <div className="notice ok">{toastMessage}</div>}

      {section === "attention" && (
        <div className="admin-section stack">
          <div className="admin-section-intro">
            <strong>Things that need a decision</strong>
            <span>Resolve exceptions and damage here. Everything else stays in Vehicles or Yards.</span>
          </div>

          <div className="admin-filter-chips" role="group" aria-label="Issue type">
            {[
              { id: "all", label: `All (${activeFlagsList.length})` },
              { id: "exceptions", label: `Exceptions (${activeFlagsList.length - damageFlags.length})` },
              { id: "damage", label: `Damage (${damageFlags.length})` },
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

          {filteredFlags.length === 0 && damagedExtras.length === 0 ? (
            <p className="notice ok">Nothing open. Yards are clear of exceptions.</p>
          ) : (
            <div className="admin-issue-list">
              {filteredFlags.map((raw) => {
                const flag = enrichFlag(raw);
                const decision = flagDecisionCopy(flag.type);
                const isDamage = flag.type === "damage_reported";
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
                            {new Date(flag.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </time>
                        )}
                        {flag.createdAt ? " · " : ""}
                        {isDamage ? flag.damageRemark : flag.message}
                      </p>
                      <p className="flag-help">{decision.help}</p>
                      {isDamage && flag.damageImage && (
                        <button
                          type="button"
                          className="admin-photo-thumb"
                          onClick={() =>
                            setSelectedPhotoModal({
                              vin: flag.vin,
                              model: flag.model,
                              yardName: "",
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
                        {flag.type === "duplicate_yard_status" && (
                          <button
                            type="button"
                            className="flag-btn primary-flag"
                            onClick={async () => {
                              try {
                                await apiResolveFlag(flag.id);
                                setState(resolveFlag(state, flag.id));
                                toast(`Confirmed IN at new yard for ${flag.vin}.`);
                              } catch (err) {
                                alert(err.message);
                              }
                            }}
                          >
                            Confirm IN at new yard
                          </button>
                        )}
                        {flag.type === "unverified_in" && (
                          <button
                            type="button"
                            className="flag-btn secondary-flag"
                            onClick={async () => {
                              try {
                                await adminOverrideVehicle(flag.vin, "in", "Admin reconciled missing IN record");
                                await apiResolveFlag(flag.id);
                                setState(resolveFlag(state, flag.id));
                                toast(`Reconciled missing IN for ${flag.vin}.`);
                              } catch (err) {
                                alert(err.message);
                              }
                            }}
                          >
                            Reconcile missing IN
                          </button>
                        )}
                        <button
                          type="button"
                          className="flag-btn"
                          onClick={() => closeFlag(flag.id, flag.vin, isDamage ? `Damage closed for ${flag.vin}` : undefined)}
                        >
                          {decision.resolveLabel}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}

              {issueFilter !== "exceptions" &&
                damagedExtras.map((item) => (
                  <article className="admin-issue" key={item.id}>
                    <div className="admin-issue-main">
                      <div className="admin-issue-title">
                        <b className="flag-vin">{item.vin}</b>
                        <span className="flag-kind">Damage (scan)</span>
                        <span className="admin-issue-model">{item.model}</span>
                      </div>
                      <p className="flag-message">
                        {item.yardName} · {item.damageRemark}
                      </p>
                      {item.damageImage && (
                        <button
                          type="button"
                          className="admin-photo-thumb"
                          onClick={() =>
                            setSelectedPhotoModal({
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
                  </article>
                ))}
            </div>
          )}
        </div>
      )}

      {section === "yards" && (
        <div className="admin-section stack">
          <div className="admin-section-intro">
            <strong>
              {searchFilteredYards.length} yard{searchFilteredYards.length === 1 ? "" : "s"}
            </strong>
            <span>Search by name, code, or region. Tap a yard to open its vehicles.</span>
          </div>

          <div className="analytics-yards-toolbar">
            <div className="yard-search-wrap">
              <span className="material-symbols-outlined yard-search-icon" aria-hidden="true">search</span>
              <input
                id="analyticsYardSearch"
                type="search"
                className="yard-search-input"
                value={yardSearch}
                onChange={(e) => setYardSearch(e.target.value)}
                placeholder="Search by name, code, or region…"
                autoComplete="off"
                aria-label="Search yards"
              />
              {yardSearch && (
                <button type="button" className="yard-search-clear" onClick={() => setYardSearch("")} aria-label="Clear yard search">
                  <span className="material-symbols-outlined">close</span>
                </button>
              )}
            </div>
          </div>

          {yardsGroupedByRegion.length === 0 ? (
            <div className="yard-picker-empty">
              <span className="material-symbols-outlined">location_off</span>
              <p>No yards match &ldquo;{yardSearch}&rdquo;</p>
            </div>
          ) : (
            yardsGroupedByRegion.map(({ region, yards: regionYards }) => (
              <section key={region} className="analytics-yards-region">
                <div className="analytics-yards-region-label">{region}</div>
                <div className="yard-box-grid">
                  {regionYards.map((yard) => {
                    const empty = Math.max(0, yard.capacity - yard.count);
                    return (
                      <article
                        className={`yard-box clickable ${yard.risk === "critical" ? "risk-critical" : yard.risk === "heavy" ? "risk-heavy" : ""}`}
                        key={yard.id}
                        onClick={() => setSelectedYardModal(yard)}
                        title={`View vehicles at ${yard.name}`}
                      >
                        <div>
                          <span className="eyebrow">{yard.code}</span>
                          <h2>{yard.name}</h2>
                        </div>
                        <div className="yard-count">{yard.count}</div>
                        <div className="yard-box-metrics">
                          <span><b>{yard.count}</b>Utilised</span>
                          <span><b>{empty}</b>Empty</span>
                          <span><b>{yard.capacity}</b>Capacity</span>
                        </div>
                        <div className="progress-wrapper">
                          <progress max="100" value={Math.min(100, yard.utilization)} />
                          <span className="progress-lbl">{yard.utilization}%</span>
                        </div>
                        <div className="yard-box-tap-hint">
                          <span className="material-symbols-outlined">directions_car</span>
                          <span>View vehicles</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {section === "vehicles" && (
        <div className="admin-section stack">
          <div className="admin-section-intro">
            <strong>Find and edit any vehicle</strong>
            <span>Tap a row to edit fields. Transit uploads and rare overrides live below.</span>
          </div>

          <AllVehiclesTab state={state} setState={setState} />

          <div className="admin-vehicle-tools">
            <button
              type="button"
              className={`admin-tool-toggle ${vehicleTool === "transit" ? "open" : ""}`}
              onClick={() => setVehicleTool(vehicleTool === "transit" ? null : "transit")}
            >
              <span className="material-symbols-outlined">local_shipping</span>
              <span>In transit ({transitCount})</span>
              <span className="material-symbols-outlined admin-tool-chevron">expand_more</span>
            </button>
            {vehicleTool === "transit" && (
              <div className="admin-tool-panel stack">
                {transitCount === 0 ? (
                  <p className="notice ok">None in transit. Upload a TKM list to add vehicles awaiting yard IN.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="damaged-table">
                      <thead>
                        <tr>
                          <th>VIN</th>
                          <th>Model</th>
                          <th>Destination</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transitVehicles.map((vehicle) => {
                          const destinationYard = yards.find((y) => y.id === vehicle.currentYardId);
                          return (
                            <tr key={vehicle.vin}>
                              <td className="damaged-vin">{vehicle.vin}</td>
                              <td>{vehicle.model}</td>
                              <td className="damaged-yard-cell">
                                <span className="scan-badge in">{destinationYard?.code || "?"}</span>{" "}
                                {destinationYard?.name || "Unknown yard"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <TransitUploadTab onUploadComplete={() => {}} />
              </div>
            )}

            <button
              type="button"
              className={`admin-tool-toggle ${vehicleTool === "override" ? "open" : ""}`}
              onClick={() => setVehicleTool(vehicleTool === "override" ? null : "override")}
            >
              <span className="material-symbols-outlined">build</span>
              <span>Force status (override)</span>
              <span className="material-symbols-outlined admin-tool-chevron">expand_more</span>
            </button>
            {vehicleTool === "override" && (
              <div className="admin-tool-panel">
                <ManualOverride state={state} setState={setState} />
              </div>
            )}

            <button
              type="button"
              className={`admin-tool-toggle ${vehicleTool === "delivered" ? "open" : ""}`}
              onClick={() => setVehicleTool(vehicleTool === "delivered" ? null : "delivered")}
            >
              <span className="material-symbols-outlined">playlist_remove</span>
              <span>Remove delivered VINs</span>
              <span className="material-symbols-outlined admin-tool-chevron">expand_more</span>
            </button>
            {vehicleTool === "delivered" && (
              <div className="admin-tool-panel">
                <DeliveredCleanup state={state} setState={setState} />
              </div>
            )}
          </div>
        </div>
      )}

      {section === "setup" && (
        <div className="admin-section stack">
          <div className="admin-section-intro">
            <strong>Access & configuration</strong>
            <span>Passwords, delivery branches, and push alerts.</span>
          </div>

          {permission !== "denied" && (
            <div className="admin-push-row">
              <div>
                <strong>Push notifications</strong>
                <span>Alert this device when new flags appear.</span>
              </div>
              <button type="button" className="btn btn-outline" onClick={isSubscribed ? unsubscribe : subscribe}>
                <span className="material-symbols-outlined">{isSubscribed ? "notifications_active" : "notifications"}</span>
                {isSubscribed ? "Disable" : "Enable"}
              </button>
            </div>
          )}

          <div className="admin-setup-block">
            <h2>Passwords</h2>
            <CredentialsTab />
          </div>

          <div className="admin-setup-block">
            <h2>Branches</h2>
            <BranchesTab />
          </div>
        </div>
      )}

      <YardVehiclesModal
        yard={selectedYardModal}
        state={state}
        setState={setState}
        onClose={() => setSelectedYardModal(null)}
      />

      {selectedPhotoModal && (
        <div className="damage-modal-backdrop" onClick={() => setSelectedPhotoModal(null)}>
          <div className="damage-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="damage-modal-header">
              <div>
                <h3>{selectedPhotoModal.vin}</h3>
                <span className="eyebrow">
                  {selectedPhotoModal.model}
                  {selectedPhotoModal.yardName ? ` · ${selectedPhotoModal.yardName}` : ""}
                </span>
              </div>
              <button type="button" className="damage-modal-close" onClick={() => setSelectedPhotoModal(null)}>
                &times;
              </button>
            </div>
            <div className="damage-modal-body">
              <img src={selectedPhotoModal.src} alt="Damage evidence" className="damage-modal-img" />
              <div className="damage-modal-caption">
                <strong>Damage remarks</strong>
                <p>{selectedPhotoModal.remark}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
