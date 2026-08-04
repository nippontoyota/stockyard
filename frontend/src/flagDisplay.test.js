import assert from "node:assert/strict";
import { displayFlagMessage } from "./components/admin/flagDisplay.js";
import { formatYardLabel, findYardById } from "./stockyardLogic.js";

assert.equal(formatYardLabel("TR01C-1"), "TR01C · Showroom, Enchakkal");
assert.equal(formatYardLabel(findYardById("TR01C-2")), "TR01C · Showroom adjacent area, Enchakkal");
assert.equal(formatYardLabel(null, "x"), "x");

// Legacy duplicate message with bare shared code — new yard from scan id resolves to name
const legacyFlag = {
  type: "duplicate_yard_status",
  vin: "MBHJWC13STGD43111",
  yardId: "TR01C-1",
  message: "Vehicle was IN at yard TR01C, now scanned IN at TR01C",
  createdAt: "2026-08-04T08:42:00.000Z",
};
const stateWithPrior = {
  scans: [
    {
      vin: "MBHJWC13STGD43111",
      type: "in",
      yardId: "TR01C-2",
      scannedAt: "2026-08-04T08:00:00.000Z",
    },
    {
      vin: "MBHJWC13STGD43111",
      type: "in",
      yardId: "TR01C-1",
      scannedAt: "2026-08-04T08:41:00.000Z",
    },
  ],
};
assert.equal(
  displayFlagMessage(legacyFlag, stateWithPrior),
  "Vehicle was IN at TR01C · Showroom adjacent area, Enchakkal, now scanned IN at TR01C · Showroom, Enchakkal"
);

// Dwell legacy site id
assert.equal(
  displayFlagMessage(
    { type: "dwell_exceeded", message: "Vehicle has been IN for 45 days at yard TR01C-1" },
    {}
  ),
  "Vehicle has been IN for 45 days at TR01C · Showroom, Enchakkal"
);

// Already formatted — keep stable when scan yard is same text
assert.match(
  displayFlagMessage(
    {
      type: "duplicate_yard_status",
      yardId: "TR01C-1",
      message: "Vehicle was IN at TR01C · Showroom adjacent area, Enchakkal, now scanned IN at TR01C · Showroom, Enchakkal",
    },
    {}
  ),
  /TR01C · Showroom/
);

console.log("yard label / flag display tests passed");
