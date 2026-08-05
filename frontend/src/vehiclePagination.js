/** Page size for vehicle sync. Backend max is 10000 — use it so admin gets the full fleet in one request. */
export const VEHICLE_PAGE_SIZE = 10000;
/** Hard stop if fleet ever exceeds page size × max pages (10000 × 50 = 500k). */
export const VEHICLE_MAX_PAGES = 50;

/**
 * Keep requesting pages until a short/empty page arrives (or maxPages).
 * Used so admin/unscoped sync never silently drops vehicles past the first page.
 */
export async function fetchAllVehiclePages(fetchPage, {
  pageSize = VEHICLE_PAGE_SIZE,
  maxPages = VEHICLE_MAX_PAGES,
} = {}) {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const chunk = await fetchPage(page);
    if (!Array.isArray(chunk) || chunk.length === 0) return all;
    all.push(...chunk);
    if (chunk.length < pageSize) return all;
  }
  console.warn(
    `getVehicles: stopped after ${maxPages} pages (${all.length} rows) — raise VEHICLE_MAX_PAGES if fleet grew`
  );
  return all;
}
