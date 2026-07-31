import { decodeVinOnline } from "./vinDecoder.js";
import { decodeVinDetails, detectModel } from "../shared/decodeVinDetails.js";

export { decodeVinDetails, detectModel };

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * Check if a VIN matches the standard 17-character format.
 * Excludes I, O, Q as per ISO 3779.
 */
export function isValidVin(vin: string): boolean {
  return VIN_REGEX.test(vin.toUpperCase());
}

/**
 * Asynchronously resolves vehicle model by combining local pattern rules with online NHTSA API lookup for future-proofing.
 */
export async function resolveVehicleMetadata(vin: string): Promise<string> {
  const localDetected = detectModel(vin);
  if (localDetected !== "Toyota Vehicle" && localDetected !== "Lexus Vehicle") {
    return localDetected;
  }

  const onlineData = await decodeVinOnline(vin);
  if (onlineData && onlineData.make && onlineData.model) {
    const make = onlineData.make.toUpperCase().includes("LEXUS") ? "Lexus" : "Toyota";
    return `${make} ${onlineData.model}`;
  }

  return localDetected;
}
