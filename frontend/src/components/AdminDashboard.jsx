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
import { flagLabel, resolveFlag } from "../stockyardLogic.js";
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
              <button type="button" className={activeTab === "yards" ? "active" : ""} onClick={() => setActiveTab("yards")}>Yards</button>
              <button type="button" className={activeTab === "flags" ? "active" : ""} onClick={() => setActiveTab("flags")}>Flags ({stats.openFlags})</button>
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
                <DwellByModelChart dwellByModel={stats.dwellByModel} />
              </section>
            </div>
          </>
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
      </div>

      <YardVehiclesModal
        yard={selectedYardModal}
        state={state}
        onClose={() => setSelectedYardModal(null)}
      />
    </section>
  );
}
