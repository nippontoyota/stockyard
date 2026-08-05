import * as XLSX from "xlsx";
import { flagLabel, findYardById, driveTypeLabel, entryMethodLabel } from "./stockyardLogic.js";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function vehicleToExportRow(vehicle, yard, flags = []) {
  const openFlag = flags.find((f) => f.vin === vehicle.vin && !f.resolved);
  const yardMeta = yard || findYardById(vehicle.currentYardId);

  const onDisplay = Boolean(vehicle.onDisplay);
  return {
    VIN: vehicle.vin,
    Model: vehicle.model || "",
    "Drive Type": driveTypeLabel(vehicle.driveType),
    "Key No": vehicle.keyNo || "",
    Status: (vehicle.currentStatus || "").toUpperCase(),
    "Entry Method": entryMethodLabel(vehicle.entryMethod) || "Unlabeled",
    "Yard Code": yardMeta?.code || "",
    "Yard Name": yardMeta?.name || "",
    Region: yardMeta?.city || "",
    "On Display": onDisplay ? "Yes" : "",
    "Taken By": onDisplay ? (vehicle.displayTakenBy || "") : "",
    "Display Location": onDisplay ? (vehicle.displayLocation || "") : "",
    "VIN Valid": vehicle.vinValid === false ? "No" : "Yes",
    "Open Flag": openFlag ? flagLabel(openFlag.type) : "",
    "Last Updated": formatDate(vehicle.lastChangedAt),
  };
}

export function exportVehiclesExcel({
  vehicles = [],
  flags = [],
  filename = "stock_export",
  sheetName = "Vehicles",
  yard = null,
}) {
  const rows = vehicles.map((vehicle) => {
    const rowYard = yard || findYardById(vehicle.currentYardId);
    return vehicleToExportRow(vehicle, rowYard, flags);
  });

  const sheet = XLSX.utils.json_to_sheet(
    rows.length ? rows : [{ VIN: "", Model: "", Status: "" }]
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
  const safeName = String(filename).replace(/[^\w.-]+/g, "_");
  const dateStamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${safeName}_${dateStamp}.xlsx`);
}

export function exportYardVehiclesExcel(yard, vehicles, flags = []) {
  const safeCode = String(yard?.code || "yard").replace(/[^\w.-]+/g, "_");
  exportVehiclesExcel({
    vehicles,
    flags,
    yard,
    filename: `${safeCode}_vehicles`,
    sheetName: yard?.code || "Vehicles",
  });
}
