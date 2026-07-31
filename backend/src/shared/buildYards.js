import yardRows from "./yardRows.json" with { type: "json" };

export const YARD_REGIONS = ["Cochin", "Thrissur", "Kottayam", "Trivandrum"];

function buildYardData() {
  const counters = new Map();
  return yardRows.map((row) => {
    const n = (counters.get(row.code) ?? 0) + 1;
    counters.set(row.code, n);
    return {
      id: `${row.code}-${n}`,
      code: row.code,
      name: `${row.site}, ${row.area}`,
      city: row.district,
      capacity: row.capacity ?? 50,
    };
  });
}

export const YARD_DATA = buildYardData();
