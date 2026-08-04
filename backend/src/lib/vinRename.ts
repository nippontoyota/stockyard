import { isValidVin } from './vin.js';

export type VinRenamePrep =
  | { ok: true; changed: false }
  | { ok: true; changed: true; vin: string }
  | { ok: false; status: 400 | 409; error: string };

/**
 * Pure prep for admin VIN typo correction.
 * Caller must pass `takenByOther` after looking up the candidate VIN.
 */
export function prepareVinRename(
  currentVin: string,
  requestedVin: string | undefined,
  takenByOther = false,
): VinRenamePrep {
  if (requestedVin === undefined) {
    return { ok: true, changed: false };
  }

  const current = String(currentVin || '').trim().toUpperCase();
  const next = String(requestedVin || '').trim().toUpperCase();

  if (!next || next === current) {
    return { ok: true, changed: false };
  }

  if (!isValidVin(next)) {
    return { ok: false, status: 400, error: 'Invalid VIN format' };
  }

  if (takenByOther) {
    return { ok: false, status: 409, error: 'VIN already exists' };
  }

  return { ok: true, changed: true, vin: next };
}
