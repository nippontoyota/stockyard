import assert from "node:assert/strict";
import { applyScan, createInitialState, dashboard, normalizeVin, parseDeliveredVins, removeDeliveredVehicles } from "./stockyardLogic.js";

globalThis.localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = String(value); },
};

const baseScan = {
  id: "scan-1",
  clientScanId: "client-1",
  vinRaw: "JTMBA38V70D123456",
  type: "in",
  yardId: "CO01B-1",
  gps: { latitude: 10.0529, longitude: 76.3157, accuracy: 20 },
  deviceId: "device-1",
  scannedAt: new Date().toISOString(),
  syncStatus: "synced",
};

// First scan: should be accepted normally
const firstScanResult = applyScan(createInitialState(), baseScan);
assert.equal(firstScanResult.accepted, true);
assert.equal(firstScanResult.state.vehicles.JTMBA38V70D123456.currentYardId, "CO01B-1");

// Second scan at the SAME yard: should be rejected silently
const sameYardDuplicate = applyScan(firstScanResult.state, { ...baseScan, clientScanId: "client-2" });
assert.equal(sameYardDuplicate.accepted, false);
assert.equal(sameYardDuplicate.message, "Vehicle is already IN at this yard.");
assert.equal(sameYardDuplicate.state.flags.some((flag) => flag.type === "duplicate_yard_status"), false);

// Third scan at a DIFFERENT yard: should be accepted as IN at new yard, update location, and raise duplicate_yard_status flag
const transferConflict = applyScan(firstScanResult.state, { ...baseScan, clientScanId: "client-3", yardId: "CO01A-1", gps: { latitude: 9.9369, longitude: 76.3149 } });
assert.equal(transferConflict.accepted, true);
assert.equal(transferConflict.state.vehicles.JTMBA38V70D123456.currentYardId, "CO01A-1");
assert.equal(transferConflict.state.vehicles.JTMBA38V70D123456.currentStatus, "in");
assert.equal(transferConflict.state.flags.some((flag) => flag.type === "duplicate_yard_status"), true);

// OUT scan with no prior IN (using a completely new state and VIN)
const outNoIn = applyScan(createInitialState(), { ...baseScan, clientScanId: "client-4", vinRaw: "AAAAAAAAAAAAAAAAA", type: "out", outRemark: "customer_acquisition" });
assert.equal(outNoIn.accepted, true);
assert.equal(outNoIn.state.flags.some((flag) => flag.type === "unverified_in"), true);

// Invalid VIN
const invalid = applyScan(createInitialState(), { ...baseScan, clientScanId: "client-5", vinRaw: "BADVIN" });
assert.equal(invalid.accepted, true);
assert.equal(invalid.state.flags.some((flag) => flag.type === "invalid_vin"), true);

assert.equal(normalizeVin("https://yard.example/car?vin=JTMBA38V70D123456"), "JTMBA38V70D123456");

const deliveredVins = parseDeliveredVins("VIN\nJTMBA38V70D123456\nnot-a-vin\nJTMBA38V70D123456");
assert.deepEqual(deliveredVins, ["JTMBA38V70D123456"]);

// Fix the dashboard test to use a populated state instead of empty state
const stateWithVehicle = firstScanResult.state;
const globalStats = dashboard(stateWithVehicle);
assert.equal(globalStats.currentStock, 1);
assert.equal(globalStats.yards.length, 21);

const yardStats = dashboard(stateWithVehicle, "CO01B-1");
assert.equal(yardStats.currentStock, 1);
assert.equal(yardStats.totalCapacity, 200);
assert.equal(yardStats.openFlags, 0);

console.log("stockyard logic ok");
