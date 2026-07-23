import http from "node:https";

interface NhtsaVinResult {
  Make?: string;
  Model?: string;
  ModelYear?: string;
  BodyClass?: string;
  ErrorCode?: string;
  ErrorText?: string;
}

const vinCache = new Map<string, { make: string; model: string; year?: string }>();

/**
 * Decodes a 17-character VIN using the free NHTSA Public API.
 * Supports all global Toyota & Lexus VINs.
 */
export async function decodeVinOnline(vin: string): Promise<{ make: string; model: string; year?: string } | null> {
  const normalizedVin = vin.toUpperCase().trim();
  if (normalizedVin.length !== 17) return null;

  if (vinCache.has(normalizedVin)) {
    return vinCache.get(normalizedVin)!;
  }

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${normalizedVin}?format=json`;

  try {
    const data = await new Promise<string>((resolve, reject) => {
      const req = http.get(url, { timeout: 3000 }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("NHTSA API timeout"));
      });
    });

    const parsed = JSON.parse(data);
    const result: NhtsaVinResult = parsed?.Results?.[0];

    if (result && result.Make && result.Model && result.Make !== "0") {
      const decoded = {
        make: result.Make.trim(),
        model: result.Model.trim(),
        year: result.ModelYear?.trim(),
      };
      vinCache.set(normalizedVin, decoded);
      return decoded;
    }
  } catch (err) {
    // API network failure or timeout - fallback to local offline decoder gracefully
  }

  return null;
}
