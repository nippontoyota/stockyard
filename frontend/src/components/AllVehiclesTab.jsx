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
    if (!yardId) return "-";
    const yardObj = yards.find(y => y.id === yardId || y.code === yardId);
    return yardObj ? yardObj.name : yardId;
  };

  return (
    <div className="tab-pane">
      <div className="tab-header">
        <h2>All Vehicles Tracking</h2>
        <p className="tab-desc">Real-time status of all vehicles across all yards and transit operations.</p>
      </div>

      <div className="controls-row">
        <div className="search-row inline-search">
          <span className="material-symbols-outlined">search</span>
          <input
            type="text"
            placeholder="Search by VIN or Model..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="IN-TRANSIT">In-Transit</option>
          <option value="IN">In</option>
          <option value="BRANCH TRANSFER">Branch Transfer</option>
          <option value="OUT">Out</option>
        </select>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>VIN</th>
              <th>Model</th>
              <th>Status</th>
              <th>Current/Last Yard</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty-state-cell">
                  No vehicles found.
                </td>
              </tr>
            ) : (
              filteredVehicles.map((v) => {
                const derivedStatus = getDerivedStatus(v);
                return (
                  <tr key={v.vin}>
                    <td className="mono">{v.vin}</td>
                    <td>{v.model}</td>
                    <td>
                      <span className={`status-badge ${derivedStatus.badgeClass}`}>
                        {derivedStatus.label}
                      </span>
                    </td>
                    <td>{getYardName(v.currentYardId)}</td>
                    <td>{new Date(v.lastChangedAt).toLocaleString()}</td>
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
