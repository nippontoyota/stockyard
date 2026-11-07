import assert from "node:assert/strict";
import { fetchAllVehiclePages, VEHICLE_PAGE_SIZE } from "./vehiclePagination.js";

// Empty first page → []
assert.deepEqual(await fetchAllVehiclePages(async () => [], { pageSize: 3 }), []);

// Short first page → that page only
assert.deepEqual(
  await fetchAllVehiclePages(async (page) => {
    assert.equal(page, 1);
    return ["a", "b"];
  }, { pageSize: 3 }),
  ["a", "b"]
);

// Full pages then short → concatenates all
const pages = {
  1: [1, 2, 3],
  2: [4, 5, 6],
  3: [7],
};
assert.deepEqual(
  await fetchAllVehiclePages(async (page) => pages[page] || [], { pageSize: 3 }),
  [1, 2, 3, 4, 5, 6, 7]
);

// Exact full last page then empty → stops on empty (no infinite loop)
const exact = {
  1: ["x", "y"],
  2: ["z", "w"],
  3: [],
};
assert.deepEqual(
  await fetchAllVehiclePages(async (page) => exact[page] ?? [], { pageSize: 2 }),
  ["x", "y", "z", "w"]
);

// maxPages hard stop
let calls = 0;
const capped = await fetchAllVehiclePages(
  async () => {
    calls += 1;
    return [calls, calls];
  },
  { pageSize: 2, maxPages: 3 }
);
assert.equal(calls, 3);
assert.deepEqual(capped, [1, 1, 2, 2, 3, 3]);

assert.equal(VEHICLE_PAGE_SIZE, 10000);
console.log("api vehicle pagination tests passed");
