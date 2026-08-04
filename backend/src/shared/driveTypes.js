/**
 * Drive-type catalogue — shared by frontend dropdowns and backend validation.
 * DB column is free text; this list only gates API/UI acceptance.
 */

export const DRIVE_TYPES = Object.freeze([
  { value: "neo_drive", label: "Neo Drive" },
  { value: "hybrid", label: "Hybrid" },
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "cng", label: "CNG" },
  { value: "electric", label: "Electric" },
]);

export const DRIVE_TYPE_VALUES = Object.freeze(DRIVE_TYPES.map((d) => d.value));

const VALUE_SET = new Set(DRIVE_TYPE_VALUES);

export function isDriveType(value) {
  return VALUE_SET.has(String(value || "").trim());
}

export function driveTypeLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const found = DRIVE_TYPES.find((d) => d.value === raw);
  if (found) return found.label;
  return raw.replace(/_/g, " ");
}
