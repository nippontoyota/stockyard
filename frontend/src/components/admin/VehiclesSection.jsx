import React, { useEffect, useState } from "react";
import { yards } from "../../stockyardLogic.js";
import { downloadExport } from "../../api.js";
import { exportVehiclesExcel } from "../../exportStockExcel.js";
import { AllVehiclesTab } from "../AllVehiclesTab.jsx";
import { TransitUploadTab } from "../TransitUploadTab.jsx";
import { ManualOverride } from "./ManualOverride.jsx";
import { DeliveredCleanup } from "./DeliveredCleanup.jsx";

export function VehiclesSection({
  state,
  setState,
  transitVehicles,
  transitCount,
  editVinRequest,
  onEditVinConsumed,
  onEditVehicle,
  onRefresh,
  toast,
  onError,
}) {
  const [vehicleTool, setVehicleTool] = useState(null);
  const [exporting, setExporting] = useState(null);

  useEffect(() => {
    if (editVinRequest?.tool) {
      setVehicleTool(editVinRequest.tool);
    }
  }, [editVinRequest?.tool]);

  async function handleCsvExport(type, params, label) {
    setExporting(label);
    try {
      await downloadExport(type, params);
      toast(`Downloaded ${label}.`);
    } catch (err) {
      onError(err.message || "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  function handleExcelExport(vehicles, label, filename) {
    setExporting(label);
    try {
      exportVehiclesExcel({
        vehicles,
        flags: state.flags || [],
        filename,
        sheetName: label,
      });
      toast(`Downloaded ${label}.`);
    } catch (err) {
      onError(err.message || "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  const allVehicles = Object.values(state.vehicles || {});
  const inVehicles = allVehicles.filter((v) => v.currentStatus === "in");

  return (
    <div className="admin-section stack">
      <div className="admin-section-intro">
        <strong>Find and edit any vehicle</strong>
        <span>Tap a row to edit fields. Transit uploads and rare overrides live below.</span>
      </div>

      <div className="admin-export-row">
        <span className="field-hint">Download Excel</span>
        <div className="admin-export-buttons">
          <button
            type="button"
            className="yard-export-btn"
            disabled={!!exporting || !allVehicles.length}
            onClick={() => handleExcelExport(allVehicles, "All stock", "all_stock")}
          >
            <span className="material-symbols-outlined">download</span>
            <span>{exporting === "All stock" ? "Exporting…" : "All vehicles"}</span>
          </button>
          <button
            type="button"
            className="yard-export-btn"
            disabled={!!exporting || !inVehicles.length}
            onClick={() => handleExcelExport(inVehicles, "IN stock", "in_stock")}
          >
            <span className="material-symbols-outlined">download</span>
            <span>{exporting === "IN stock" ? "Exporting…" : "IN only"}</span>
          </button>
          <button
            type="button"
            className="yard-export-btn"
            disabled={!!exporting || !transitVehicles.length}
            onClick={() => handleExcelExport(transitVehicles, "In transit", "in_transit")}
          >
            <span className="material-symbols-outlined">download</span>
            <span>{exporting === "In transit" ? "Exporting…" : "In transit"}</span>
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={!!exporting}
            onClick={() => handleCsvExport("flags", { resolved: "false" }, "open flags CSV")}
          >
            {exporting === "open flags CSV" ? "Exporting…" : "Open flags (CSV)"}
          </button>
        </div>
      </div>

      <AllVehiclesTab
        state={state}
        setState={setState}
        initialEditVin={editVinRequest?.vin}
        onInitialEditConsumed={onEditVinConsumed}
        toast={toast}
      />

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
                      <th aria-label="Actions" />
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
                            <span className="scan-badge in">{destinationYard?.code || "?"}</span> {destinationYard?.name || "Unknown yard"}
                          </td>
                          <td className="transit-actions-cell">
                            <button type="button" className="flag-btn ghost-flag" onClick={() => onEditVehicle(vehicle.vin)}>
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <TransitUploadTab onUploadComplete={onRefresh} />
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
            <ManualOverride state={state} setState={setState} onSuccess={toast} onError={onError} />
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
            <DeliveredCleanup state={state} setState={setState} onSuccess={toast} onError={onError} />
          </div>
        )}
      </div>
    </div>
  );
}
