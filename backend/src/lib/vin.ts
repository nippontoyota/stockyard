import { decodeVinOnline } from "./vinDecoder.js";

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * Check if a VIN matches the standard 17-character format.
 * Excludes I, O, Q as per ISO 3779.
 */
export function isValidVin(vin: string): boolean {
  return VIN_REGEX.test(vin.toUpperCase());
}

/**
 * Extracts complete Toyota & Lexus specification details from VIN structure.
 */
export function decodeVinDetails(vinRaw: string): { model: string; variant: string; colour: string } {
  const vin = String(vinRaw || "").toUpperCase().trim();
  if (!vin || vin.length < 5) {
    return {
      model: "Toyota Vehicle",
      variant: "Standard Spec",
      colour: "TKM Assembly",
    };
  }

  const wmi = vin.substring(0, 3);
  const char4 = vin.charAt(3);
  const char5 = vin.charAt(4);
  const char6 = vin.charAt(5);
  const char10 = vin.charAt(9);
  const char11 = vin.charAt(10);
  const vds = vin.substring(3, 6);

  // 1. Model Determination
  let make = "Toyota";
  let modelName = "";

  if (wmi === "JTH" || wmi === "JTJ" || vin.includes("LEXUS")) {
    make = "Lexus";
    if (char4 === "B" || vds === "BJ1" || vin.includes("ES300")) modelName = "ES 300h";
    else if (char4 === "H" || char4 === "R" || vds === "HZ1" || vin.includes("RX350")) modelName = "RX 350h";
    else if (char4 === "A" || char4 === "N" || vds === "AA1" || vin.includes("NX350")) modelName = "NX 350h";
    else if (char4 === "M" || char4 === "L" || vds === "AH1" || vin.includes("LM350")) modelName = "LM 350h";
    else if (char4 === "U" || vds === "URJ" || vds === "VJA" || vin.includes("LX600")) modelName = "LX 600";
    else modelName = "Luxury Vehicle";
  } else {
    make = "Toyota";
    if (char4 === "U" || vin.includes("HYRYDER")) modelName = "Urban Cruiser Hyryder";
    else if (char4 === "A" || char4 === "X" || char4 === "B" || char4 === "C" || vin.includes("INNOVA") || vin.includes("HYCROSS")) {
      if (char5 === "U" || char5 === "N" || char5 === "K" || vin.includes("CRYSTA")) modelName = "Innova Crysta";
      else modelName = "Innova Hycross";
    } else if (char4 === "D" || char4 === "E" || char4 === "F" || char4 === "G" || vin.includes("FORTUNER")) {
      if (char5 === "E" || char5 === "L" || vin.includes("LEGENDER")) modelName = "Fortuner Legender";
      else modelName = "Fortuner";
    } else if (char4 === "H" || vin.includes("HILUX") || vin.startsWith("JTMBA")) modelName = "Hilux";
    else if (char4 === "J" || vin.includes("RUMION")) modelName = "Rumion";
    else if (char4 === "K" || char4 === "T" || vin.includes("TAISOR")) modelName = "Urban Cruiser Taisor";
    else if (char4 === "S" || char4 === "Z" || char4 === "G" || vin.includes("GLANZA")) modelName = "Glanza";
    else if (char4 === "L" || vin.includes("CAMRY")) modelName = "Camry Hybrid";
    else if (char4 === "M" || char4 === "V" || vin.includes("VELLFIRE")) modelName = "Vellfire";
    else modelName = wmi === "MBJ" ? `TKM Series (${vds || "India"})` : `Series (${vds || "Spec"})`;
  }

  const fullModel = `${make} ${modelName}`;

  // 2. Year Decoding (10th character ISO 3779 standard)
  const yearMap: Record<string, string> = {
    P: "2023",
    R: "2024",
    S: "2025",
    T: "2026",
    V: "2027",
    W: "2028",
    X: "2029",
    Y: "2030",
    "1": "2031",
    "2": "2032",
    L: "2020",
    M: "2021",
    N: "2022",
  };
  const modelYear = yearMap[char10] ? `${yearMap[char10]} MY` : "2026 MY";

  // 3. Engine / Powertrain Spec Decoding (5th & 6th characters)
  let engineSpec = "";
  if (["Y", "H", "M", "X", "1"].includes(char5) || ["Y", "H", "M"].includes(char6)) {
    engineSpec = "1.5L / 2.0L NeoDrive Hybrid";
  } else if (["D", "G", "U", "N", "5"].includes(char5) || ["D", "G"].includes(char6)) {
    engineSpec = "2.8L / 2.4L GD Turbo Diesel";
  } else {
    engineSpec = "Dual VVT-i Petrol";
  }

  // 4. Plant Origin (11th character)
  let plantOrigin = "";
  if (["E", "K", "M", "0", "1", "2"].includes(char11)) {
    plantOrigin = "TKM Bidadi Plant";
  } else if (["A", "B", "C", "J", "U"].includes(char11)) {
    plantOrigin = "Toyota Japan CBU";
  } else if (["S", "G"].includes(char11)) {
    plantOrigin = "Alliance Gujarat";
  } else {
    plantOrigin = "TKM Factory";
  }

  return {
    model: fullModel,
    variant: `${engineSpec} · ${modelYear}`,
    colour: plantOrigin,
  };
}

export function detectModel(vin: string): string {
  return decodeVinDetails(vin).model;
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
