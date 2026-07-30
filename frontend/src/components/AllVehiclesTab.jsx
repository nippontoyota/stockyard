import React, { useState } from "react";
import { yards, decodeVinDetails } from "../stockyardLogic.js";

export function AllVehiclesTab({ state }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const allVehicles = state ? Object.values(state.vehicles) : [];

  const getDerivedStatus = (v) => {
    if (v.currentStatus === "transit") return { label: "IN-TRANSIT", badgeClass: "badge-transit" };
    if (v.currentStatus === "in") return { label: "IN", badgeClass: "badge-in" };
    if (v.currentStatus === "out" && v.outRemark === "stockyard_transfer") return { label: "BRANCH TRANSFER", badgeClass: "badge-transfer" };
    if (v.currentStatus === "out") return { label: "OUT", badgeClass: "badge-out" };
    return { label: "UNKNOWN", badgeClass: "badge-unknown" };
  };

  const filteredVehicles = allVehicles.filter((v) => {
    const derivedStatus = getDerivedStatus(v);
    const matchesStatus = statusFilter === "all" || derivedStatus.label === statusFilter;

    const decoded = decodeVinDetails(v.vin);
    const displayModel = v.model && v.model !== "Unknown" && v.model !== "Toyota Vehicle" ? v.model : decoded.model;
    const searchString = `${v.vin} ${displayModel} ${v.variant || ""} ${v.colour || ""} ${derivedStatus.label}`.toLowerCase();
    const matchesSearch = searchString.includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const getYardName = (yardId) => {
    if (!yardId) return "—";
    const yardObj = yards.find((y) => y.id === yardId || y.code === yardId);
    return yardObj ? `${yardObj.code} · ${yardObj.name}` : yardId;
  };

  return (
    <div className="tab-pane">
      <div className="tab-summary">
        <strong>All vehicles</strong>
        <span className="tab-summary-hint">
          {filteredVehicles.length} shown · {allVehicles.length} total across yards and transit
        </span>
      </div>

      <div className="controls-row">
        <div className="search-row inline-search">
          <span className="material-symbols-outlined">search</span>
          <input
            type="text"
            placeholder="Search VIN or model…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search vehicles"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="IN-TRANSIT">In transit</option>
          <option value="IN">In</option>
          <option value="BRANCH TRANSFER">Branch transfer</option>
          <option value="OUT">Out</option>
        </select>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>VIN</th>
              <th>Model</th>
              <th>Key No</th>
              <th>Status</th>
              <th>Yard</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-state-cell">
                  {allVehicles.length === 0
                    ? "No vehicles in the system yet."
                    : "No vehicles match this search or filter."}
                </td>
              </tr>
            ) : (
              filteredVehicles.map((v) => {
                const derivedStatus = getDerivedStatus(v);
                return (
                  <tr key={v.vin}>
                    <td className="mono">{v.vin}</td>
                    <td>{v.model}</td>
                    <td className="mono">{v.keyNo || "—"}</td>
                    <td>
                      <span className={`status-badge ${derivedStatus.badgeClass}`}>
                        {derivedStatus.label}
                      </span>
                    </td>
                    <td className="yard-cell">{getYardName(v.currentYardId)}</td>
                    <td className="time-cell">
                      {v.lastChangedAt
                        ? new Date(v.lastChangedAt).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
