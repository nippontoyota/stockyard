import assert from "node:assert/strict";
import { applyScan, CAR_MODELS, createInitialState, dashboard, isCarModel, normalizeVin, parseDeliveredVins, yards } from "./stockyardLogic.js";

assert.equal(CAR_MODELS.length, 18);
assert.equal(isCarModel("Rumion"), true);
assert.equal(isCarModel("Lexus ES"), true);
assert.equal(isCarModel("Urban Cruiser HyRyder"), true);
assert.equal(isCarModel("Toyota Vehicle"), false);

globalThis.localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = String(value); },
};

assert.ok(yards.some((y) => y.id === "CO01B-1"));
assert.ok(yards.some((y) => y.id === "CO01A-1"));
assert.ok(yards.some((y) => y.id === "KL01A-3")); // Thazhuthla (KL01A BP adjacent)
assert.ok(yards.some((y) => y.code === "TI01C")); // Chavakkad
assert.ok(yards.some((y) => y.id === "KY01A-7")); // Kayamkulam showroom adjacent area
assert.ok(yards.some((y) => y.id === "TR01B-1")); // Kochuveli BP facility
assert.ok(yards.some((y) => y.id === "KL01B-1")); // Thazhuthla BP facility
assert.equal(yards.find((y) => y.id === "KY01A-7")?.capacity, 110);
assert.equal(yards.find((y) => y.id === "TR01B-1")?.capacity, 5);
assert.equal(yards.find((y) => y.id === "KL01B-1")?.capacity, 5);

const baseScan = {
  id: "scan-1",
  clientScanId: "client-1",
  vinRaw: "JTMBA38V70D123456",
  type: "in",
  yardId: "CO01B-1",
  keyNo: "K-901",
  model: "Hilux",
  deviceId: "device-1",
  scannedAt: new Date().toISOString(),
  syncStatus: "synced",
};

assert.equal(Object.hasOwn(createInitialState(), "queue"), false);

// First scan: should be accepted normally
const firstScanResult = applyScan(createInitialState(), baseScan);
assert.equal(firstScanResult.accepted, true);
assert.equal(firstScanResult.state.vehicles.JTMBA38V70D123456.currentYardId, "CO01B-1");
assert.equal(firstScanResult.state.vehicles.JTMBA38V70D123456.keyNo, "K-901");
assert.equal(firstScanResult.state.vehicles.JTMBA38V70D123456.model, "Hilux");

// Second scan at the SAME yard: should be rejected silently
const sameYardDuplicate = applyScan(firstScanResult.state, { ...baseScan, clientScanId: "client-2" });
assert.equal(sameYardDuplicate.accepted, false);
assert.equal(sameYardDuplicate.message, "Vehicle is already IN at this yard.");
assert.equal(sameYardDuplicate.state.flags.some((flag) => flag.type === "duplicate_yard_status"), false);

// Third scan at a DIFFERENT yard: should be accepted as IN at new yard, update location, and raise duplicate_yard_status flag
const transferConflict = applyScan(firstScanResult.state, { ...baseScan, clientScanId: "client-3", yardId: "CO01A-1", model: "Fortuner" });
assert.equal(transferConflict.accepted, true);
assert.equal(transferConflict.state.vehicles.JTMBA38V70D123456.currentYardId, "CO01A-1");
assert.equal(transferConflict.state.vehicles.JTMBA38V70D123456.currentStatus, "in");
assert.equal(transferConflict.state.vehicles.JTMBA38V70D123456.model, "Fortuner");
assert.equal(transferConflict.state.flags.some((flag) => flag.type === "duplicate_yard_status"), true);

// Branch transfer OUT moves vehicle to transit at destination yard
const transferOut = applyScan(firstScanResult.state, {
  ...baseScan,
  clientScanId: "client-transfer-out",
  type: "out",
  outRemark: "stockyard_transfer",
  transferDestinationYardId: "CO01A-1",
  transferRequestedBy: "DI Test",
});
assert.equal(transferOut.accepted, true);
assert.equal(transferOut.state.vehicles.JTMBA38V70D123456.currentStatus, "transit");
assert.equal(transferOut.state.vehicles.JTMBA38V70D123456.currentYardId, "CO01A-1");

// OUT scan with no prior IN (using a completely new state and VIN)
const outNoIn = applyScan(createInitialState(), { ...baseScan, clientScanId: "client-4", vinRaw: "AAAAAAAAAAAAAAAAA", type: "out", outRemark: "customer_acquisition", model: "" });
assert.equal(outNoIn.accepted, true);
assert.equal(outNoIn.state.flags.some((flag) => flag.type === "unverified_in"), true);

// Invalid VIN
const invalid = applyScan(createInitialState(), { ...baseScan, clientScanId: "client-5", vinRaw: "BADVIN" });
assert.equal(invalid.accepted, true);
assert.equal(invalid.state.flags.some((flag) => flag.type === "invalid_vin"), true);

assert.equal(normalizeVin("https://yard.example/car?vin=JTMBA38V70D123456"), "JTMBA38V70D123456");

const deliveredVins = parseDeliveredVins("VIN\nJTMBA38V70D123456\nnot-a-vin\nJTMBA38V70D123456");
assert.deepEqual(deliveredVins, ["JTMBA38V70D123456"]);

// Dashboard uses the full hardcoded yard list
const stateWithVehicle = firstScanResult.state;
const globalStats = dashboard(stateWithVehicle);
assert.equal(globalStats.currentStock, 1);
assert.equal(globalStats.yards.length, yards.length);

const yardStats = dashboard(stateWithVehicle, "CO01B-1");
assert.equal(yardStats.currentStock, 1);
assert.equal(yardStats.totalCapacity, 132);
assert.equal(yardStats.openFlags, 0);

// IN scan with damage reported
const damagedInScan = applyScan(createInitialState(), {
  ...baseScan,
  clientScanId: "client-6",
  vinRaw: "MBJUYML1STE999999",
  type: "in",
  model: "Urban Cruiser HyRyder",
  damaged: true,
  damageRemark: "Scratched side door panel",
  damageImage: "data:image/png;base64,sampleImageData",
});
assert.equal(damagedInScan.accepted, true);
assert.equal(damagedInScan.state.vehicles.MBJUYML1STE999999.model, "Urban Cruiser HyRyder");
const damageFlag = damagedInScan.state.flags.find((f) => f.type === "damage_reported");
assert.ok(damageFlag);
assert.equal(damageFlag.damageRemark, "Scratched side door panel");
assert.equal(damageFlag.damageImage, "data:image/png;base64,sampleImageData");

console.log("stockyard logic ok");
