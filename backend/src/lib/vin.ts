import { decodeVinOnline } from "./vinDecoder.js";

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * Check if a VIN matches the standard 17-character format.
 * Excludes I, O, Q as per ISO 3779.
 */
export function isValidVin(vin: string): boolean {
  return VIN_REGEX.test(vin.toUpperCase());
}

// Toyota & Lexus India model map from VIN positions 4-6 (VDS) and WMI patterns
const MODEL_MAP: Record<string, string> = {
  // Toyota Lineup
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

  // Lexus Lineup (Japan CBU & TKM India assembly)
  BJ1: "Lexus ES 300h",
  HZ1: "Lexus RX 350h",
  AA1: "Lexus NX 350h",
  AH1: "Lexus LM 350h",
  URJ: "Lexus LX 600",
  VJA: "Lexus LX 600",
};

/**
 * Synchronous local pattern matcher for Toyota & Lexus India VINs.
 */
export function detectModel(vin: string): string {
  const text = vin.toUpperCase().trim();

  // 1. Lexus WMI & VDS check
  if (text.startsWith("JTH")) {
    const vds = text.substring(3, 6);
    return MODEL_MAP[vds] ? MODEL_MAP[vds] : "Lexus ES 300h";
  }
  if (text.startsWith("JTJ")) {
    const vds = text.substring(3, 6);
    return MODEL_MAP[vds] ? MODEL_MAP[vds] : "Lexus RX 350h";
  }

  // 2. Toyota VDS check
  const key = text.substring(3, 6);
  if (MODEL_MAP[key]) return MODEL_MAP[key];

  // 3. Keyword fallbacks for Toyota & Lexus models
  if (text.includes("LEXUS") || text.includes("RX350") || text.includes("RX500")) return "Lexus RX 350h";
  if (text.includes("NX350") || text.includes("NX250")) return "Lexus NX 350h";
  if (text.includes("ES300")) return "Lexus ES 300h";
  if (text.includes("LM350")) return "Lexus LM 350h";
  if (text.includes("LX600") || text.includes("LX570")) return "Lexus LX 600";
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

  // 4. Default fallback
  if (text.startsWith("JTH") || text.startsWith("JTJ")) return "Lexus Vehicle";
  return "Toyota Vehicle";
}

/**
 * Asynchronously resolves vehicle model by combining local pattern rules with online NHTSA API lookup for future-proofing.
 */
export async function resolveVehicleMetadata(vin: string): Promise<string> {
  const localDetected = detectModel(vin);
  if (localDetected !== "Toyota Vehicle" && localDetected !== "Lexus Vehicle") {
    return localDetected;
  }

  // Fallback to online NHTSA VIN API lookup for newly released Toyota/Lexus models
  const onlineData = await decodeVinOnline(vin);
  if (onlineData && onlineData.make && onlineData.model) {
    const make = onlineData.make.toUpperCase().includes("LEXUS") ? "Lexus" : "Toyota";
    return `${make} ${onlineData.model}`;
  }

  return localDetected;
}
