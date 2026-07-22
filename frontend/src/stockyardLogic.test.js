import assert from "node:assert/strict";
import { applyScan, createInitialState, parseDeliveredVins, removeDeliveredVehicles } from "./stockyardLogic.js";

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

const duplicate = applyScan(createInitialState(), baseScan);
assert.equal(duplicate.accepted, false);
assert.equal(duplicate.state.vehicles.JTMBA38V70D123456.currentYardId, "CO01B-1");

const transferConflict = applyScan(createInitialState(), { ...baseScan, clientScanId: "client-2", yardId: "CO01A-1", gps: { latitude: 9.9369, longitude: 76.3149 } });
assert.equal(transferConflict.accepted, true);
assert.equal(transferConflict.state.flags.some((flag) => flag.type === "duplicate_yard_status"), true);

const outNoIn = applyScan(createInitialState(), { ...baseScan, clientScanId: "client-3", vinRaw: "AAAAAAAAAAAAAAAAA", type: "out", outRemark: "customer_acquisition" });
assert.equal(outNoIn.accepted, true);
assert.equal(outNoIn.state.flags.some((flag) => flag.type === "unverified_in"), true);

const invalid = applyScan(createInitialState(), { ...baseScan, clientScanId: "client-4", vinRaw: "BADVIN" });
assert.equal(invalid.accepted, true);
assert.equal(invalid.state.flags.some((flag) => flag.type === "invalid_vin"), true);

const deliveredVins = parseDeliveredVins("VIN\nJTMBA38V70D123456\nnot-a-vin\nJTMBA38V70D123456");
assert.deepEqual(deliveredVins, ["JTMBA38V70D123456"]);
const deliveredState = removeDeliveredVehicles(createInitialState(), deliveredVins);
assert.equal(deliveredState.vehicles.JTMBA38V70D123456, undefined);
assert.equal(deliveredState.delivered.length, 1);

console.log("stockyard logic ok");
