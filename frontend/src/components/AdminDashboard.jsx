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

export function AdminHome({ stats, state, setState }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [riskFilter, setRiskFilter] = useState("all");
  const [toastMessage, setToastMessage] = useState("");
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
            <span>Damaged Cars</span>
            {activeDamagedCount > 0 && <span className="rail-badge bad">{activeDamagedCount}</span>}
          </button>
          <button
            type="button"
            className={activeTab === "transit" ? "active" : ""}
            onClick={() => setActiveTab("transit")}
          >
            <span className="material-symbols-outlined">local_shipping</span>
            <span>In Transit</span>
            {transitCount > 0 && <span className="rail-badge info" style={{ background: 'var(--brand)', color: 'white' }}>{transitCount}</span>}
          </button>
        </div>
        <div className="rail-note">
          <b>{healthyYards}/{stats.yards.length}</b>
          <span>yards healthy</span>
        </div>
      </aside>

      <div className="stack analytical-dashboard">
        <div className="dashboard-header">
          <div>
            <span className="eyebrow">Stockyard Intelligence</span>
            <h1>Admin Analytics Dashboard</h1>
          </div>
          <div className="dashboard-actions">
            <button
              type="button"
              className="action-icon-btn"
              onClick={handleDownload}
              title="Download Excel Analytics Report"
              aria-label="Download Report"
            >
              <span className="material-symbols-outlined">download</span>
            </button>
            <button
              type="button"
              className={`action-icon-btn ${showFilterBar || riskFilter !== "all" ? "active" : ""}`}
              onClick={() => setShowFilterBar(!showFilterBar)}
              title="Tune Dashboard Filters"
              aria-label="Tune Dashboard Filters"
            >
              <span className="material-symbols-outlined">tune</span>
            </button>
            <div className="segmented">
              <button type="button" className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>Overview</button>
              <button type="button" className={activeTab === "all-vehicles" ? "active" : ""} onClick={() => setActiveTab("all-vehicles")}>All Vehicles</button>
              <button type="button" className={activeTab === "yards" ? "active" : ""} onClick={() => setActiveTab("yards")}>Yards</button>
              <button type="button" className={activeTab === "flags" ? "active" : ""} onClick={() => setActiveTab("flags")}>Flags ({stats.openFlags})</button>
              <button type="button" className={activeTab === "damaged" ? "active" : ""} onClick={() => setActiveTab("damaged")}>Damaged Cars ({activeDamagedCount})</button>
              <button type="button" className={activeTab === "transit" ? "active" : ""} onClick={() => setActiveTab("transit")}>In Transit</button>
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
                <DwellByModelChart data={stats.dwellTime.byModel} />
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
              <span className="eyebrow">Yard details</span>
              <strong>{filteredYards.length} stockyard{filteredYards.length === 1 ? "" : "s"} (Tap any card to view cars)</strong>
            </div>
            <section className="yard-box-grid">
              {filteredYards.map((yard) => {
                const empty = Math.max(0, yard.capacity - yard.count);
                return (
                  <article
                    className={`yard-box clickable ${yard.risk === "critical" ? "risk-critical" : yard.risk === "heavy" ? "risk-heavy" : ""}`}
                    key={yard.id}
                    onClick={() => setSelectedYardModal(yard)}
                    title={`Click to view all vehicles at ${yard.name}`}
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
                      <span>Tap to view vehicles &rarr;</span>
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
              <span className="eyebrow">Flags</span>
              <strong>{activeFlagsList.length} active operational flag{activeFlagsList.length === 1 ? "" : "s"}</strong>
              <span className={activeFlagsList.length > 0 ? "pill bad" : "pill ok"}>{activeFlagsList.length > 0 ? "Review Required" : "All Clear"}</span>
            </div>
            {activeFlagsList.length === 0 ? (
              <p className="notice ok">No open flags or exceptions. All stockyards operating smoothly.</p>
            ) : (
              activeFlagsList.map((flag) => (
                <div className="flag-row" key={flag.id}>
                  <span>
                    <b>{flag.vin}</b>
                    <small>
                      {flag.createdAt && <span className="flag-time">{new Date(flag.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}{" · "}
                      <strong className="flag-kind">{flagLabel(flag.type)}</strong> {flag.message}
                    </small>
                  </span>
                  {setState && (
                    <div className="flag-actions">
                      {flag.type === "duplicate_yard_status" && (
                        <button
                          type="button"
                          className="flag-btn primary-flag"
                          title="Confirm vehicle is IN at the newly scanned yard and resolve flag"
                          onClick={async () => {
                            try {
                              await apiResolveFlag(flag.id);
                              setState(resolveFlag(state, flag.id));
                              setToastMessage(`Flag for VIN ${flag.vin} resolved — Confirmed IN at new yard.`);
                              setTimeout(() => setToastMessage(""), 3500);
                            } catch (err) {
                              alert(err.message);
                            }
                          }}
                        >
                          Confirm IN at New Yard
                        </button>
                      )}
                      {flag.type === "unverified_in" && (
                        <button
                          type="button"
                          className="flag-btn secondary-flag"
                          title="Reconcile missing IN record and mark vehicle IN"
                          onClick={async () => {
                            try {
                              await adminOverrideVehicle(flag.vin, "in", "Admin reconciled missing IN record");
                              await apiResolveFlag(flag.id);
                              setState(resolveFlag(state, flag.id));
                              setToastMessage(`Reconciled IN record for VIN ${flag.vin}.`);
                              setTimeout(() => setToastMessage(""), 3500);
                            } catch (err) {
                              alert(err.message);
                            }
                          }}
                        >
                          Reconcile IN
                        </button>
                      )}
                      <button
                        type="button"
                        className="flag-btn"
                        onClick={async () => {
                          try {
                            await apiResolveFlag(flag.id);
                            setState(resolveFlag(state, flag.id));
                          } catch (err) {
                            alert(err.message);
                          }
                        }}
                      >
                        Dismiss / Resolve
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === "damaged" && (
          <section className="panel stack flag-tab-panel">
            <div className="tab-summary">
              <span className="eyebrow">Vehicle Damage Log</span>
              <strong>{activeDamagedCount} active damaged car flag{activeDamagedCount === 1 ? "" : "s"} ({damagedVehiclesList.length} total recorded)</strong>
              <span className={activeDamagedCount > 0 ? "pill bad" : "pill ok"}>
                {activeDamagedCount > 0 ? "Action Required" : "No Active Damage Flags"}
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
                            <td>{item.yardName} {item.yardCode && `(${item.yardCode})`}</td>
                            <td><span className={`scan-badge ${item.scanType}`}>{item.scanType.toUpperCase()} SCAN</span></td>
                            <td>
                              <span className="damaged-time">
                                {new Date(item.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </td>
                            <td>
                              <span className={item.resolved ? "pill ok" : "pill bad"}>
                                {item.resolved ? "Resolved" : "Flagged"}
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
                                      <small className="remark-label">Damage Remarks</small>
                                      <p className="remark-text">{item.damageRemark}</p>
                                    </div>
                                  </div>

                                  <div className="damaged-photo-section">
                                    <small className="photo-label">Damage Evidence Photo</small>
                                    {item.damageImage ? (
                                      <div className="photo-actions">
                                        <div
                                          className="damaged-photo-preview clickable"
                                          onClick={() => setSelectedPhotoModal({
                                            vin: item.vin,
                                            model: item.model,
                                            yardName: item.yardName,
                                            src: item.damageImage,
                                            remark: item.damageRemark,
                                          })}
                                          title="Click to expand photo"
                                        >
                                          <img src={item.damageImage} alt="Damage evidence" />
                                          <div className="photo-overlay">
                                            <span className="material-symbols-outlined">zoom_in</span>
                                            <span>View Full Photo</span>
                                          </div>
                                        </div>
                                        <a href={item.damageImage} download={`damage-${item.vin}.jpg`} className="download-btn" onClick={(e) => e.stopPropagation()}>
                                          <span className="material-symbols-outlined">download</span> Download Evidence
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
                                            setToastMessage(`Damage flag resolved for VIN ${item.vin}`);
                                            setTimeout(() => setToastMessage(""), 3500);
                                          } catch (err) {
                                            alert(err.message);
                                          }
                                        }}
                                      >
                                        Resolve Damage Flag
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
              <span className="eyebrow">Incoming Vehicles</span>
              <strong>{transitCount} vehicle{transitCount === 1 ? "" : "s"} currently in transit from TKM</strong>
              <span className={transitCount > 0 ? "pill info" : "pill ok"} style={transitCount > 0 ? { background: 'var(--brand)', color: 'white' } : {}}>
                {transitCount > 0 ? "Pending Arrival" : "No Transit Vehicles"}
              </span>
            </div>

            {transitCount === 0 ? (
              <p className="notice ok">There are no vehicles currently marked as in transit.</p>
            ) : (
              <div className="table-wrapper">
                <table className="damaged-table">
                  <thead>
                    <tr>
                      <th>VIN</th>
                      <th>Model</th>
                      <th>Destination Yard</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transitVehicles.map((vehicle) => {
                      const destinationYard = yards.find(y => y.id === vehicle.currentYardId);
                      return (
                        <tr key={vehicle.vin}>
                          <td style={{ fontFamily: "monospace" }}>{vehicle.vin}</td>
                          <td>{vehicle.model}</td>
                          <td>
                            <span className="scan-badge in">{destinationYard?.code || "UKN"}</span> {destinationYard?.name || "Unknown Yard"}
                          </td>
                          <td>
                            <span className="pill info" style={{ background: 'var(--brand)', color: 'white' }}>In Transit</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            
            <div style={{ marginTop: "2rem" }}>
              <TransitUploadTab onUploadComplete={() => {
                // Dashboard will automatically react if state refreshes, or user can refresh.
              }} />
            </div>
          </section>
        )}
      </div>

      <YardVehiclesModal
        yard={selectedYardModal}
        state={state}
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
