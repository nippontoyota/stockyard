/**
 * Branch ↔ yard-code map. Shared by seed + syncYards.
 * Each code links every physical site under that code to the branch.
 */
export const NIPPON_BRANCHES = [
  { name: 'Enchakkal', yardCodes: ['TR01C'] },
  { name: 'Kazhakootam', yardCodes: ['TR01A'] },
  { name: 'Kochuveli', yardCodes: ['TR01B'] },
  { name: 'Kalamassery (Nippon Towers)', yardCodes: ['CO01B'] },
  { name: 'Nettoor', yardCodes: ['CO01A'] },
  { name: 'Muvattupuzha', yardCodes: ['MV01A'] },
  { name: 'Puzhakkal (Ayyanthole)', yardCodes: ['TI01A'] },
  { name: 'Nadathara', yardCodes: ['TI01B'] },
  { name: 'Chavakkad', yardCodes: ['TI01C'] },
  { name: 'Vellangallur (Irinjalakuda)', yardCodes: ['IR01A'] },
  { name: 'Nattakom', yardCodes: ['KT01A'] },
  { name: 'Thellakom', yardCodes: [] },
  { name: 'Pala', yardCodes: ['KT01B'] },
  { name: 'Kottiyam (Kollam)', yardCodes: ['KL01A', 'KL01B'] },
  { name: 'Pathanamthitta', yardCodes: ['PH01A'] },
  { name: 'Thiruvalla', yardCodes: ['TL01A'] },
  { name: 'Kayamkulam', yardCodes: ['KY01A'] },
] as const;

/** Legacy yard ids → new ids after the Jul 2026 master-sheet expansion */
export const LEGACY_YARD_REMAP: Record<string, string> = {
  // KL01B remapped to KL01A-3 historically; KL01B-1 is active again (Thazhuthla BP facility).
};
