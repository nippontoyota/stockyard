import React, { useEffect, useState } from "react";
import { yards } from "../../stockyardLogic.js";
import { downloadExport } from "../../api.js";
import { exportVehiclesExcel } from "../../exportStockExcel.js";
import { AllVehiclesTab } from "../AllVehiclesTab.jsx";
import { TransitUploadTab } from "../TransitUploadTab.jsx";
import { ManualOverride } from "./ManualOverride.jsx";
import { DeliveredCleanup } from "./DeliveredCleanup.jsx";
import { AddToYard } from "./AddToYard.jsx";

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

  function toggleTool(id) {
    setVehicleTool((prev) => (prev === id ? null : id));
  }

  const allVehicles = Object.values(state.vehicles || {});
  const inVehicles = allVehicles.filter((v) => v.currentStatus === "in");
  const qrVehicles = allVehicles.filter((v) => v.entryMethod === "qr");
  const manualVehicles = allVehicles.filter((v) => v.entryMethod === "manual");

  return (
    <div className="admin-section stack">
      <div className="admin-section-intro">
        <strong>Find and edit any vehicle</strong>
        <span>Use the tools above the list to add stock, upload transit, or override status. Tap a row to edit.</span>
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
            className="yard-export-btn"
            disabled={!!exporting || !qrVehicles.length}
            onClick={() => handleExcelExport(qrVehicles, "QR entry", "qr_entry")}
          >
            <span className="material-symbols-outlined">download</span>
            <span>{exporting === "QR entry" ? "Exporting…" : `QR entry (${qrVehicles.length})`}</span>
          </button>
          <button
            type="button"
            className="yard-export-btn"
            disabled={!!exporting || !manualVehicles.length}
            onClick={() => handleExcelExport(manualVehicles, "Manual entry", "manual_entry")}
          >
            <span className="material-symbols-outlined">download</span>
            <span>{exporting === "Manual entry" ? "Exporting…" : `Manual entry (${manualVehicles.length})`}</span>
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

      <div className="admin-vehicle-tools">
        <div className="admin-vehicle-tool-bar sticky">
          <button
            type="button"
            className={`admin-tool-toggle ${vehicleTool === "add" ? "open" : ""}`}
            onClick={() => toggleTool("add")}
          >
            <span className="material-symbols-outlined">add_box</span>
            <span>Add to yard</span>
            <span className="material-symbols-outlined admin-tool-chevron">expand_more</span>
          </button>
          <button
            type="button"
            className={`admin-tool-toggle ${vehicleTool === "transit" ? "open" : ""}`}
            onClick={() => toggleTool("transit")}
          >
            <span className="material-symbols-outlined">local_shipping</span>
            <span>In transit ({transitCount})</span>
            <span className="material-symbols-outlined admin-tool-chevron">expand_more</span>
          </button>
          <button
            type="button"
            className={`admin-tool-toggle ${vehicleTool === "override" ? "open" : ""}`}
            onClick={() => toggleTool("override")}
          >
            <span className="material-symbols-outlined">build</span>
            <span>Force status (override)</span>
            <span className="material-symbols-outlined admin-tool-chevron">expand_more</span>
          </button>
          <button
            type="button"
            className={`admin-tool-toggle ${vehicleTool === "delivered" ? "open" : ""}`}
            onClick={() => toggleTool("delivered")}
          >
            <span className="material-symbols-outlined">playlist_remove</span>
            <span>Remove delivered VINs</span>
            <span className="material-symbols-outlined admin-tool-chevron">expand_more</span>
          </button>
        </div>

        {vehicleTool === "add" && (
          <div className="admin-tool-panel admin-tool-panel-standalone">
            <AddToYard onSuccess={toast} onError={onError} onRefresh={onRefresh} />
          </div>
        )}

        {vehicleTool === "transit" && (
          <div className="admin-tool-panel admin-tool-panel-standalone stack">
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
                            <span className="scan-badge in">{destinationYard?.code || "?"}</span>{" "}
                            {destinationYard?.name || "Unknown yard"}
                          </td>
                          <td className="transit-actions-cell">
                            <button
                              type="button"
                              className="flag-btn ghost-flag"
                              onClick={() => onEditVehicle(vehicle.vin)}
                            >
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

        {vehicleTool === "override" && (
          <div className="admin-tool-panel admin-tool-panel-standalone">
            <ManualOverride state={state} setState={setState} onSuccess={toast} onError={onError} />
          </div>
        )}

        {vehicleTool === "delivered" && (
          <div className="admin-tool-panel admin-tool-panel-standalone">
            <DeliveredCleanup state={state} setState={setState} onSuccess={toast} onError={onError} />
          </div>
        )}
      </div>

      <AllVehiclesTab
        state={state}
        setState={setState}
        initialEditVin={editVinRequest?.vin}
        onInitialEditConsumed={onEditVinConsumed}
        toast={toast}
      />
    </div>
  );
}
