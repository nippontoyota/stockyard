const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * Check if a VIN matches the standard 17-character format.
 * Excludes I, O, Q as per ISO 3779.
 */
export function isValidVin(vin: string): boolean {
  return VIN_REGEX.test(vin.toUpperCase());
}

// ponytail: hardcoded TKM India model map from VIN positions 4-6.
// Move to a DB table when models change frequently or need admin editing.
const MODEL_MAP: Record<string, string> = {
  'KUN': 'Innova',
  'GUN': 'Fortuner',
  'GD6': 'Hilux',
  'ASK': 'Camry',
  'AGH': 'Vellfire',
  'GRJ': 'Land Cruiser',
  'NSP': 'Glanza',
  'NHP': 'Urban Cruiser Hyryder',
  'MSP': 'Rumion',
  'MXA': 'Innova Hycross',
  'MXP': 'Innova Hycross',
  'TAA': 'Urban Cruiser Taisor',
  'ZSA': 'Urban Cruiser',
};

/**
 * Attempt to detect the Toyota model from VIN positions 4-6.
 * Returns null if unrecognized — not an error, just unknown.
 */
export function detectModel(vin: string): string | null {
  const key = vin.substring(3, 6).toUpperCase();
  return MODEL_MAP[key] ?? null;
}
