import React, { useEffect, useMemo, useState } from "react";
import { getBranchOverview } from "../api.js";
import { findYardById } from "../stockyardLogic.js";
import { exportVehiclesExcel, exportYardVehiclesExcel } from "../exportStockExcel.js";
import { YardVehiclesModal } from "./YardVehiclesModal.jsx";

export function DeliveryBranchStock({ state, session }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState("");
  const [selectedYard, setSelectedYard] = useState(null);

  useEffect(() => {
    if (!session?.branchId) return;
    setLoading(true);
    getBranchOverview(session.branchId)
      .then((data) => {
        setOverview(data);
        setError("");
      })
      .catch((err) => setError(err.message || "Could not load branch yards."))
      .finally(() => setLoading(false));
  }, [session?.branchId]);

  const branchYardIds = useMemo(
    () => new Set((overview?.yards || []).map((y) => y.id)),
    [overview?.yards]
  );

  const branchVehicles = useMemo(() => {
    if (!branchYardIds.size) return [];
    return Object.values(state.vehicles || {}).filter((v) => branchYardIds.has(v.currentYardId));
  }, [state.vehicles, branchYardIds]);

  const yardsWithCounts = useMemo(() => {
    return (overview?.yards || []).map((yard) => {
      const vehicles = branchVehicles.filter((v) => v.currentYardId === yard.id);
      const inCount = vehicles.filter((v) => v.currentStatus === "in").length;
      const yardMeta = findYardById(yard.id) || yard;
      return {
        ...yardMeta,
        ...yard,
        inCount,
        vehicleCount: vehicles.length,
        utilization: yard.capacity > 0 ? Math.round((inCount / yard.capacity) * 100) : 0,
      };
    });
  }, [overview?.yards, branchVehicles]);

  async function handleExportAll() {
    setExporting("all");
    try {
      const branchName = (overview?.branch?.name || "branch").replace(/[^\w.-]+/g, "_");
      exportVehiclesExcel({
        vehicles: branchVehicles,
        flags: state.flags || [],
        filename: `${branchName}_all_yards_stock`,
        sheetName: "Branch Stock",
      });
    } finally {
      setExporting("");
    }
  }

  function handleExportYard(yard) {
    setExporting(yard.id);
    try {
      const vehicles = branchVehicles.filter((v) => v.currentYardId === yard.id);
      exportYardVehiclesExcel(yard, vehicles, state.flags || []);
    } finally {
      setExporting("");
    }
  }

  if (loading) {
    return (
      <div className="delivery-stock-loading">
        <div className="skeleton skeleton-kpi" style={{ height: 72, marginBottom: 12 }} />
        <div className="skeleton skeleton-kpi" style={{ height: 160 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="notice bad delivery-stock-error" role="alert">
        {error}
      </div>
    );
  }

  const totalIn = yardsWithCounts.reduce((sum, y) => sum + y.inCount, 0);
  const totalCapacity = yardsWithCounts.reduce((sum, y) => sum + (y.capacity || 0), 0);

  return (
    <section className="stack delivery-branch-stock">
      <div className="stock-header-bar">
        <div>
          <span className="eyebrow">Branch stock</span>
          <h2>{overview?.branch?.name || "Your yards"}</h2>
          <p className="delivery-stock-subtitle">
            {yardsWithCounts.length} yard{yardsWithCounts.length === 1 ? "" : "s"} · {totalIn} vehicles IN
            {totalCapacity > 0 ? ` · ${Math.round((totalIn / totalCapacity) * 100)}% utilisation` : ""}
          </p>
        </div>
        <div className="stock-actions">
          <button
            type="button"
            className="yard-export-btn"
            disabled={!branchVehicles.length || exporting === "all"}
            onClick={handleExportAll}
          >
            <span className="material-symbols-outlined">download</span>
            <span>{exporting === "all" ? "Exporting…" : "Download all yards"}</span>
          </button>
        </div>
      </div>

      <div className="delivery-yard-grid">
        {yardsWithCounts.map((yard) => (
          <article key={yard.id} className="delivery-yard-card">
            <div className="delivery-yard-card-head">
              <div>
                <span className="eyebrow">{yard.code}</span>
                <h3>{yard.name}</h3>
                <p className="delivery-yard-meta">{yard.city || "—"}</p>
              </div>
              <div className="delivery-yard-stats">
                <strong>{yard.inCount}</strong>
                <span>IN / {yard.capacity}</span>
              </div>
            </div>
            <div className="delivery-yard-util">
              <div className="delivery-yard-util-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, yard.utilization)}%` }} />
              </div>
              <span>{yard.utilization}% full · {yard.vehicleCount} tracked</span>
            </div>
            <div className="delivery-yard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setSelectedYard(yard)}>
                View vehicles
              </button>
              <button
                type="button"
                className="yard-export-btn"
                disabled={!yard.vehicleCount || exporting === yard.id}
                onClick={() => handleExportYard(yard)}
              >
                <span className="material-symbols-outlined">download</span>
                <span>{exporting === yard.id ? "…" : "Excel"}</span>
              </button>
            </div>
          </article>
        ))}
      </div>

      {yardsWithCounts.length === 0 && (
        <div className="no-results">
          <span className="material-symbols-outlined">warehouse</span>
          <p>No yards are assigned to your branch yet.</p>
        </div>
      )}

      <YardVehiclesModal
        yard={selectedYard}
        state={state}
        onClose={() => setSelectedYard(null)}
        readOnly
      />
    </section>
  );
}
