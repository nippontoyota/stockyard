const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * Check if a VIN matches the standard 17-character format.
 * Excludes I, O, Q as per ISO 3779.
 */
export function isValidVin(vin: string): boolean {
  return VIN_REGEX.test(vin.toUpperCase());
}

// Toyota India model map from VIN positions 4-6 (VDS) and WMI patterns
const MODEL_MAP: Record<string, string> = {
  KUN: "Innova Crysta",
  GUN: "Fortuner",
  GD6: "Hilux",
  ASK: "Camry Hybrid",
  AGH: "Vellfire",
  AAH: "Vellfire",
  GRJ: "Land Cruiser 300",
  FJA: "Land Cruiser 300",
  NSP: "Glanza",
  NHP: "Urban Cruiser Hyryder",
  MSP: "Rumion",
  MXA: "Innova Hycross",
  MXP: "Innova Hycross",
  TAA: "Urban Cruiser Taisor",
  ZSA: "Urban Cruiser",
};

/**
 * Automatically detect Toyota India model from VIN structure or keywords.
 * Default fallback is "Toyota Vehicle".
 */
export function detectModel(vin: string): string {
  const text = vin.toUpperCase().trim();
  const key = text.substring(3, 6);
  if (MODEL_MAP[key]) return MODEL_MAP[key];

  if (text.includes("HYCROSS")) return "Innova Hycross";
  if (text.includes("CRYSTA") || text.includes("INNOVA")) return "Innova Crysta";
  if (text.includes("FORTUNER") || text.includes("LEGENDER")) return "Fortuner";
  if (text.includes("HYRYDER")) return "Urban Cruiser Hyryder";
  if (text.includes("GLANZA")) return "Glanza";
  if (text.includes("HILUX") || text.startsWith("JTMBA")) return "Hilux";
  if (text.includes("RUMION")) return "Rumion";
  if (text.includes("TAISOR")) return "Urban Cruiser Taisor";
  if (text.includes("CAMRY")) return "Camry Hybrid";
  if (text.includes("VELLFIRE")) return "Vellfire";
  if (text.includes("CRUISER") || text.includes("LAND")) return "Land Cruiser 300";

  return "Toyota Vehicle";
}
