import { describe, expect, it } from 'vitest';
import { prepareVinRename } from './vinRename.js';

const CURRENT = 'JTMBA38V70D123456';
const OTHER = 'JTMBA38V70D654321';

describe('prepareVinRename', () => {
  it('no-ops when vin omitted', () => {
    expect(prepareVinRename(CURRENT, undefined)).toEqual({ ok: true, changed: false });
  });

  it('no-ops when normalized vin unchanged', () => {
    expect(prepareVinRename(CURRENT, '  jtmba38v70d123456  ')).toEqual({ ok: true, changed: false });
  });

  it('rejects invalid format', () => {
    expect(prepareVinRename(CURRENT, 'BADVIN')).toEqual({
      ok: false,
      status: 400,
      error: 'Invalid VIN format',
    });
    expect(prepareVinRename(CURRENT, 'JTMBA38V70D12345I')).toEqual({
      ok: false,
      status: 400,
      error: 'Invalid VIN format',
    });
  });

  it('rejects when target vin already taken', () => {
    expect(prepareVinRename(CURRENT, OTHER, true)).toEqual({
      ok: false,
      status: 409,
      error: 'VIN already exists',
    });
  });

  it('accepts free valid vin', () => {
    expect(prepareVinRename(CURRENT, OTHER, false)).toEqual({
      ok: true,
      changed: true,
      vin: OTHER,
    });
  });
});
