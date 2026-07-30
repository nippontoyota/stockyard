import React, { useState } from "react";
import * as XLSX from "xlsx";
import {
  ExecutiveKpiCards,
  ModelDonutChart,
  YardCapacityBarChart,
  DwellDistributionChart,
  FlagDistributionChart,
  DwellByModelChart,
} from "../AnalyticsCharts.jsx";
import { YardVehiclesModal } from "./YardVehiclesModal.jsx";
import { CredentialsTab } from "./CredentialsTab.jsx";
import { TransitUploadTab } from "./TransitUploadTab.jsx";
import { AllVehiclesTab } from "./AllVehiclesTab.jsx";
import { flagLabel, resolveFlag, yards, detectModel } from "../stockyardLogic.js";
import { resolveFlag as apiResolveFlag, adminOverrideVehicle } from "../api.js";
import { useWebPush } from "../hooks/useWebPush.js";

function exportAnalyticsReport(stats) {
  const yardSheet = XLSX.utils.json_to_sheet(
    stats.yards.map((y) => ({
      Code: y.code,
      Name: y.name,
      Capacity: y.capacity,
      Occupied: y.count,
      Utilization: `${y.utilization}%`,
      Risk: y.risk.toUpperCase(),
    }))
  );

  const modelSheet = XLSX.utils.json_to_sheet(
    stats.models.map((m) => ({
      Model: m.model,
      Units: m.count,
      Percentage: `${m.pct}%`,
    }))
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, yardSheet, "Yard Capacity");
  XLSX.utils.book_append_sheet(workbook, modelSheet, "Model Distribution");
  XLSX.writeFile(workbook, `Stockyard_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

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
        help: "Damage was logged on scan. Review evidence in Damaged, then close when handled.",
        resolveLabel: "Mark handled",
      };
    default:
      return {
        help: "Review this exception, then close it when no further action is needed.",
        resolveLabel: "Mark resolved",
      };
  }
}

export function AdminHome({ stats, state, setState }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [riskFilter, setRiskFilter] = useState("all");
  const [toastMessage, setToastMessage] = useState("");
  const { isSubscribed, permission, subscribe, unsubscribe } = useWebPush();
  const [selectedYardModal, setSelectedYardModal] = useState(null);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState(null);
  const [expandedDamagedRows, setExpandedDamagedRows] = useState(new Set());

  const toggleDamagedRow = (id) => {
    setExpandedDamagedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const busiestYard = stats.yards.reduce((top, yard) => yard.count > top.count ? yard : top, stats.yards[0] || { count: 0, code: "-", name: "No yard" });
  const healthyYards = stats.yards.filter((yard) => yard.risk === "normal").length;

  const filteredYards = stats.yards.filter((yard) => {
    if (riskFilter === "critical") return yard.risk === "critical";
    if (riskFilter === "heavy") return yard.risk === "critical" || yard.risk === "heavy";
    return true;
  });

  const handleDownload = () => {
    exportAnalyticsReport(stats);
    setToastMessage("Analytics report exported to Excel!");
    setTimeout(() => setToastMessage(""), 3000);
  };

  const activeFlagsList = state ? state.flags.filter((f) => !f.resolved) : [];

  // Compute Damaged Vehicles List (combining flags and scans)
  const damagedVehiclesMap = new Map();
  if (state?.flags) {
    state.flags.filter((f) => f.type === "damage_reported").forEach((flag) => {
      const scan = state?.scans?.find((s) => s.vin === flag.vin || s.id === flag.scanId);
      const vehicle = state?.vehicles?.[flag.vin];
      const yardObj = yards.find((y) => y.id === (flag.yardId || scan?.yardId || vehicle?.currentYardId));
      damagedVehiclesMap.set(flag.id, {
        id: flag.id,
        flagId: flag.id,
        vin: flag.vin,
        model: vehicle?.model || (scan ? scan.model : null) || detectModel(flag.vin),
        scanType: flag.scanType || scan?.type || "in",
        yardName: yardObj?.name || flag.yardId || "Stockyard",
        yardCode: yardObj?.code || "",
        damageRemark: flag.damageRemark || scan?.damageRemark || flag.message || "Damage reported",
        damageImage: flag.damageImage || scan?.damageImage || null,
        createdAt: flag.createdAt || scan?.scannedAt || new Date().toISOString(),
        resolved: flag.resolved,
      });
    });
  }

  if (state?.scans) {
    state.scans.filter((s) => s.damaged).forEach((scan) => {
      const existing = [...damagedVehiclesMap.values()].find((d) => d.vin === scan.vin && Math.abs(new Date(d.createdAt) - new Date(scan.scannedAt)) < 5000);
      if (!existing) {
        const vehicle = state?.vehicles?.[scan.vin];
        const yardObj = yards.find((y) => y.id === scan.yardId);
        damagedVehiclesMap.set(scan.id || scan.clientScanId || crypto.randomUUID(), {
          id: scan.id || scan.clientScanId || crypto.randomUUID(),
          flagId: null,
          vin: scan.vin,
          model: vehicle?.model || detectModel(scan.vin),
          scanType: scan.type || "in",
          yardName: yardObj?.name || scan.yardId || "Stockyard",
          yardCode: yardObj?.code || "",
          damageRemark: scan.damageRemark || "Damage reported",
          damageImage: scan.damageImage || null,
          createdAt: scan.scannedAt || new Date().toISOString(),
          resolved: false,
        });
      }
    });
  }

  const damagedVehiclesList = [...damagedVehiclesMap.values()];
  const activeDamagedCount = damagedVehiclesList.filter((d) => !d.resolved).length;

  const transitVehicles = state?.vehicles ? Object.values(state.vehicles).filter(v => v.currentStatus === 'transit') : [];
  const transitCount = transitVehicles.length;

  return (
    <section className="dashboard-workspace">
      <aside className="dashboard-rail" aria-label="Stockyard summary">
        <div className="rail-brand">
          <span className="material-symbols-outlined">directions_car</span>
          <strong>Nippon</strong>
        </div>
        <div className="rail-menu">
          <button
            type="button"
            className={activeTab === "overview" ? "active" : ""}
            onClick={() => setActiveTab("overview")}
          >
            <span className="material-symbols-outlined">dashboard</span>
            <span>Overview</span>
          </button>
          <button
            type="button"
            className={activeTab === "all-vehicles" ? "active" : ""}
            onClick={() => setActiveTab("all-vehicles")}
          >
            <span className="material-symbols-outlined">directions_car</span>
            <span>All Vehicles</span>
          </button>
          <button
            type="button"
            className={activeTab === "yards" ? "active" : ""}
            onClick={() => setActiveTab("yards")}
          >
            <span className="material-symbols-outlined">warehouse</span>
            <span>Yards</span>
          </button>
          <button
            type="button"
            className={activeTab === "flags" ? "active" : ""}
            onClick={() => setActiveTab("flags")}
          >
            <span className="material-symbols-outlined">flag</span>
            <span>Flags</span>
            {stats.openFlags > 0 && <span className="rail-badge">{stats.openFlags}</span>}
          </button>
          <button
            type="button"
            className={activeTab === "damaged" ? "active" : ""}
            onClick={() => setActiveTab("damaged")}
          >
            <span className="material-symbols-outlined">car_crash</span>
            <span>Damaged</span>
            {activeDamagedCount > 0 && <span className="rail-badge bad">{activeDamagedCount}</span>}
          </button>
          <button
            type="button"
            className={activeTab === "transit" ? "active" : ""}
            onClick={() => setActiveTab("transit")}
          >
            <span className="material-symbols-outlined">local_shipping</span>
            <span>In Transit</span>
            {transitCount > 0 && <span className="rail-badge info">{transitCount}</span>}
          </button>
        </div>
        <div className="rail-note" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <b>{healthyYards}/{stats.yards.length}</b>
            <span>yards healthy</span>
          </div>
          {permission !== 'denied' && (
            <button 
              type="button" 
              className="btn btn-outline" 
              style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              onClick={isSubscribed ? unsubscribe : subscribe}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                {isSubscribed ? 'notifications_active' : 'notifications'}
              </span>
              {isSubscribed ? 'Disable Push' : 'Enable Push'}
            </button>
          )}
        </div>
      </aside>

      <div className="stack analytical-dashboard">
        <div className="dashboard-header">
          <div className="dashboard-header-copy">
            <h1>Yard Analytics</h1>
            <p className="dashboard-subtitle">Stock, capacity, flags, and transit across all yards</p>
          </div>
          <div className="dashboard-actions">
            <button
              type="button"
              className="action-icon-btn"
              onClick={handleDownload}
              title="Download Excel report"
              aria-label="Download Excel report"
            >
              <span className="material-symbols-outlined">download</span>
            </button>
            <button
              type="button"
              className={`action-icon-btn ${showFilterBar || riskFilter !== "all" ? "active" : ""}`}
              onClick={() => setShowFilterBar(!showFilterBar)}
              title="Filter yards by capacity risk"
              aria-label="Filter yards by capacity risk"
            >
              <span className="material-symbols-outlined">tune</span>
            </button>
            <div className="segmented dashboard-mobile-tabs" role="tablist" aria-label="Analytics sections">
              <button type="button" role="tab" aria-selected={activeTab === "overview"} className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>Overview</button>
              <button type="button" role="tab" aria-selected={activeTab === "all-vehicles"} className={activeTab === "all-vehicles" ? "active" : ""} onClick={() => setActiveTab("all-vehicles")}>Vehicles</button>
              <button type="button" role="tab" aria-selected={activeTab === "yards"} className={activeTab === "yards" ? "active" : ""} onClick={() => setActiveTab("yards")}>Yards</button>
              <button type="button" role="tab" aria-selected={activeTab === "flags"} className={activeTab === "flags" ? "active" : ""} onClick={() => setActiveTab("flags")}>Flags{stats.openFlags > 0 ? ` (${stats.openFlags})` : ""}</button>
              <button type="button" role="tab" aria-selected={activeTab === "damaged"} className={activeTab === "damaged" ? "active" : ""} onClick={() => setActiveTab("damaged")}>Damaged{activeDamagedCount > 0 ? ` (${activeDamagedCount})` : ""}</button>
              <button type="button" role="tab" aria-selected={activeTab === "transit"} className={activeTab === "transit" ? "active" : ""} onClick={() => setActiveTab("transit")}>Transit</button>
            </div>
          </div>
        </div>

        {toastMessage && <div className="notice ok">{toastMessage}</div>}

        {showFilterBar && (
          <div className="filter-drawer analytics-filter-drawer">
            <div className="filter-drawer-header">
              <span>Dashboard Risk Filter</span>
              {riskFilter !== "all" && (
                <button type="button" className="clear-btn" onClick={() => setRiskFilter("all")}>Reset</button>
              )}
            </div>
            <div className="filter-grid">
              <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                <option value="all">Show All Yards ({stats.yards.length})</option>
                <option value="heavy">Show High Utilization (&ge;75%)</option>
                <option value="critical">Show Critical Capacity (&ge;90%)</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === "overview" && (
          <>
            <div
              className="dashboard-spotlight clickable"
              onClick={() => setSelectedYardModal(busiestYard)}
              title={`Click to view all vehicles at ${busiestYard.name}`}
            >
              <div>
                <span>Highest occupied yard &rarr;</span>
                <strong>{busiestYard.name}</strong>
              </div>
              <b>{busiestYard.count}</b>
              <small>{busiestYard.code}</small>
            </div>

            <ExecutiveKpiCards stats={stats} />

            {stats.dwellAlertCount > 0 && (
              <div className="notice warn" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.5rem' }}>alarm</span>
                <div>
                  <strong>{stats.dwellAlertCount} vehicle{stats.dwellAlertCount > 1 ? 's' : ''} exceed{stats.dwellAlertCount === 1 ? 's' : ''} dwell time threshold (30 days).</strong>
                  <small style={{ display: 'block' }}>Review in the Flags tab to resolve or take action.</small>
                </div>
              </div>
            )}

            <div className="analytics-grid-2col">
              <section className="panel chart-panel chart-panel-wide">
                <div className="chart-panel-header">
                  <h2>Yard Capacity Utilization</h2>
                  <span className="pill info">Capacity vs Occupied</span>
                </div>
                <YardCapacityBarChart yards={filteredYards} onSelectYard={(y) => setSelectedYardModal(y)} />
              </section>

              <section className="panel chart-panel chart-panel-compact">
                <div className="chart-panel-header">
                  <h2>Vehicle Model Distribution</h2>
                  <span className="pill info">In-Stock Split</span>
                </div>
                <ModelDonutChart models={stats.models} />
              </section>
            </div>

            <div className="analytics-grid-3col">
              <section className="panel chart-panel">
                <div className="chart-panel-header">
                  <h2>Dwell Time Ageing</h2>
                  <span className="pill neutral">Parked Duration</span>
                </div>
                <DwellDistributionChart dwellDistribution={stats.dwellDistribution} />
              </section>

              <section className="panel chart-panel">
                <div className="chart-panel-header">
                  <h2>Flag & Risk Breakdown</h2>
                  <span className={stats.openFlags > 0 ? "pill bad" : "pill ok"}>
                    {stats.openFlags} Active Issue{stats.openFlags === 1 ? "" : "s"}
                  </span>
                </div>
                <FlagDistributionChart flags={stats.flagBreakdown} />
              </section>

              <section className="panel chart-panel">
                <div className="chart-panel-header">
                  <h2>Dwell by Model</h2>
                  <span className="pill neutral">Days in Stock</span>
                </div>
                <DwellByModelChart data={stats.dwellByModel} />
              </section>
            </div>
          </>
        )}

        {activeTab === "all-vehicles" && (
          <AllVehiclesTab state={state} />
        )}

        {activeTab === "yards" && (
          <>
            <div className="tab-summary">
              <strong>{filteredYards.length} stockyard{filteredYards.length === 1 ? "" : "s"}</strong>
              <span className="tab-summary-hint">Tap a yard to see its vehicles</span>
            </div>
            <section className="yard-box-grid">
              {filteredYards.map((yard) => {
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
            </section>
          </>
        )}

        {activeTab === "flags" && (
          <section className="panel stack flag-tab-panel">
            <div className="tab-summary">
              <strong>{activeFlagsList.length} open flag{activeFlagsList.length === 1 ? "" : "s"}</strong>
              <span className={activeFlagsList.length > 0 ? "pill bad" : "pill ok"}>
                {activeFlagsList.length > 0 ? "Action needed" : "All clear"}
              </span>
              {activeFlagsList.length > 0 && (
                <span className="tab-summary-hint">Primary buttons change vehicle status. Secondary only closes the flag.</span>
              )}
            </div>
            {activeFlagsList.length === 0 ? (
              <p className="notice ok">No open flags. Yards are clear of exceptions.</p>
            ) : (
              activeFlagsList.map((flag) => {
                const decision = flagDecisionCopy(flag.type);
                return (
                  <div className="flag-row" key={flag.id}>
                    <div className="flag-row-main">
                      <div className="flag-row-title">
                        <b className="flag-vin">{flag.vin}</b>
                        <span className="flag-kind">{flagLabel(flag.type)}</span>
                      </div>
                      <p className="flag-message">
                        {flag.createdAt && (
                          <time dateTime={flag.createdAt}>
                            {new Date(flag.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </time>
                        )}
                        {flag.createdAt ? " · " : ""}
                        {flag.message}
                      </p>
                      <p className="flag-help">{decision.help}</p>
                    </div>
                    {setState && (
                      <div className="flag-actions">
                        {flag.type === "duplicate_yard_status" && (
                          <button
                            type="button"
                            className="flag-btn primary-flag"
                            title="Confirm vehicle is IN at the newly scanned yard and close this flag"
                            onClick={async () => {
                              try {
                                await apiResolveFlag(flag.id);
                                setState(resolveFlag(state, flag.id));
                                setToastMessage(`Confirmed IN at new yard for ${flag.vin}.`);
                                setTimeout(() => setToastMessage(""), 3500);
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
                            title="Create the missing IN record and close this flag"
                            onClick={async () => {
                              try {
                                await adminOverrideVehicle(flag.vin, "in", "Admin reconciled missing IN record");
                                await apiResolveFlag(flag.id);
                                setState(resolveFlag(state, flag.id));
                                setToastMessage(`Reconciled missing IN for ${flag.vin}.`);
                                setTimeout(() => setToastMessage(""), 3500);
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
                          title="Close this flag without changing vehicle status"
                          onClick={async () => {
                            try {
                              await apiResolveFlag(flag.id);
                              setState(resolveFlag(state, flag.id));
                              setToastMessage(`Flag closed for ${flag.vin}.`);
                              setTimeout(() => setToastMessage(""), 3500);
                            } catch (err) {
                              alert(err.message);
                            }
                          }}
                        >
                          {decision.resolveLabel}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        )}

        {activeTab === "damaged" && (
          <section className="panel stack flag-tab-panel">
            <div className="tab-summary">
              <strong>{activeDamagedCount} open damage case{activeDamagedCount === 1 ? "" : "s"}</strong>
              <span className="tab-summary-hint">{damagedVehiclesList.length} total recorded · tap a row for remarks and photo</span>
              <span className={activeDamagedCount > 0 ? "pill bad" : "pill ok"}>
                {activeDamagedCount > 0 ? "Review needed" : "No open damage"}
              </span>
            </div>

            {damagedVehiclesList.length === 0 ? (
              <p className="notice ok">No damaged cars reported across stockyard scans.</p>
            ) : (
              <div className="table-wrapper">
                <table className="damaged-table">
                  <thead>
                    <tr>
                      <th>VIN</th>
                      <th>Model</th>
                      <th>Yard</th>
                      <th>Scan</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th aria-label="Expand"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {damagedVehiclesList.map((item) => {
                      const isExpanded = expandedDamagedRows.has(item.id);
                      return (
                        <React.Fragment key={item.id}>
                          <tr
                            className={`damaged-row ${isExpanded ? "expanded-active" : ""} ${item.resolved ? "resolved" : "active"}`}
                            onClick={() => toggleDamagedRow(item.id)}
                          >
                            <td><strong className="damaged-vin">{item.vin}</strong></td>
                            <td><span className="damaged-model">{item.model}</span></td>
                            <td className="damaged-yard-cell">{item.yardName}{item.yardCode ? ` (${item.yardCode})` : ""}</td>
                            <td><span className={`scan-badge ${item.scanType}`}>{item.scanType.toUpperCase()}</span></td>
                            <td>
                              <span className="damaged-time">
                                {new Date(item.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </td>
                            <td>
                              <span className={item.resolved ? "pill ok" : "pill bad"}>
                                {item.resolved ? "Resolved" : "Open"}
                              </span>
                            </td>
                            <td className="expand-cell">
                              <span className="material-symbols-outlined expand-icon" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>
                                expand_more
                              </span>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="expanded-row">
                              <td colSpan="7">
                                <div className="expanded-content">
                                  <div className="damaged-remark-box">
                                    <span className="material-symbols-outlined remark-icon">report_problem</span>
                                    <div>
                                      <small className="remark-label">Damage remarks</small>
                                      <p className="remark-text">{item.damageRemark}</p>
                                    </div>
                                  </div>

                                  <div className="damaged-photo-section">
                                    <small className="photo-label">Evidence photo</small>
                                    {item.damageImage ? (
                                      <div className="photo-actions">
                                        <div
                                          className="damaged-photo-preview clickable"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedPhotoModal({
                                              vin: item.vin,
                                              model: item.model,
                                              yardName: item.yardName,
                                              src: item.damageImage,
                                              remark: item.damageRemark,
                                            });
                                          }}
                                          title="View full photo"
                                        >
                                          <img src={item.damageImage} alt={`Damage evidence for ${item.vin}`} />
                                          <div className="photo-overlay">
                                            <span className="material-symbols-outlined">zoom_in</span>
                                            <span>View full photo</span>
                                          </div>
                                        </div>
                                        <a href={item.damageImage} download={`damage-${item.vin}.jpg`} className="download-btn" onClick={(e) => e.stopPropagation()}>
                                          <span className="material-symbols-outlined">download</span> Download
                                        </a>
                                      </div>
                                    ) : (
                                      <div className="no-photo-box">
                                        <span className="material-symbols-outlined">image_not_supported</span>
                                        <span>No photo attached</span>
                                      </div>
                                    )}
                                  </div>

                                  {!item.resolved && item.flagId && setState && (
                                    <div className="damaged-card-actions">
                                      <button
                                        type="button"
                                        className="flag-btn primary-flag"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          try {
                                            await apiResolveFlag(item.flagId);
                                            setState(resolveFlag(state, item.flagId));
                                            setToastMessage(`Damage flag closed for ${item.vin}`);
                                            setTimeout(() => setToastMessage(""), 3500);
                                          } catch (err) {
                                            alert(err.message);
                                          }
                                        }}
                                      >
                                        Mark damage handled
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === "transit" && (
          <section className="panel stack flag-tab-panel">
            <div className="tab-summary">
              <strong>{transitCount} vehicle{transitCount === 1 ? "" : "s"} in transit from TKM</strong>
              <span className={transitCount > 0 ? "pill info transit-pill" : "pill ok"}>
                {transitCount > 0 ? "Awaiting yard IN scan" : "None in transit"}
              </span>
            </div>

            {transitCount === 0 ? (
              <p className="notice ok">No vehicles currently marked in transit. Upload a TKM list below to add them.</p>
            ) : (
              <div className="table-wrapper">
                <table className="damaged-table">
                  <thead>
                    <tr>
                      <th>VIN</th>
                      <th>Model</th>
                      <th>Destination</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transitVehicles.map((vehicle) => {
                      const destinationYard = yards.find(y => y.id === vehicle.currentYardId);
                      return (
                        <tr key={vehicle.vin}>
                          <td className="damaged-vin">{vehicle.vin}</td>
                          <td>{vehicle.model}</td>
                          <td className="damaged-yard-cell">
                            <span className="scan-badge in">{destinationYard?.code || "?"}</span>{" "}
                            {destinationYard?.name || "Unknown yard"}
                          </td>
                          <td>
                            <span className="pill info transit-pill">In transit</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="transit-upload-slot">
              <TransitUploadTab onUploadComplete={() => {}} />
            </div>
          </section>
        )}
      </div>

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
                <span className="eyebrow">{selectedPhotoModal.model} &bull; {selectedPhotoModal.yardName}</span>
              </div>
              <button type="button" className="damage-modal-close" onClick={() => setSelectedPhotoModal(null)}>&times;</button>
            </div>
            <div className="damage-modal-body">
              <img src={selectedPhotoModal.src} alt="Damage evidence" className="damage-modal-img" />
              <div className="damage-modal-caption">
                <strong>Type of Damage & Remarks:</strong>
                <p>{selectedPhotoModal.remark}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
