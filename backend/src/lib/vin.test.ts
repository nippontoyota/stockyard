import { describe, it, expect } from 'vitest';
import { isValidVin, decodeVinDetails, detectModel } from './vin.js';

describe('isValidVin', () => {
  it('accepts a valid 17-char VIN', () => {
    expect(isValidVin('MHYRV223035400146')).toBe(true);
  });

  it('rejects VIN with I,O,Q', () => {
    expect(isValidVin('MHYRVI23035400146')).toBe(false);
  });

  it('rejects short VIN', () => {
    expect(isValidVin('MHYRV223')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidVin('')).toBe(false);
  });

  it('handles uppercase conversion', () => {
    expect(isValidVin('mhyrv223035400146')).toBe(true);
  });
});

describe('decodeVinDetails', () => {
  it('returns Toyota Vehicle for short input', () => {
    const r = decodeVinDetails('ABC');
    expect(r.model).toContain('Toyota');
  });

  it('decodes Hyryder VIN', () => {
    const r = decodeVinDetails('MHYUR223035400146');
    expect(r.model).toContain('Hyryder');
  });

  it('decodes Fortuner VIN', () => {
    const r = decodeVinDetails('MBJDTG223035400146');
    expect(r.model).toContain('Fortuner');
  });

  it('decodes Innova Crysta VIN', () => {
    const r = decodeVinDetails('MBJAU223035400146');
    expect(r.model).toContain('Crysta');
  });

  it('detects Lexus from WMI', () => {
    const r = decodeVinDetails('JTHAJ223035400146');
    expect(r.model).toContain('Lexus');
  });

  it('returns variant with year', () => {
    const r = decodeVinDetails('MHYRV223035400146');
    expect(r.variant).toMatch(/MY$/);
  });

  it('returns colour with plant origin', () => {
    const r = decodeVinDetails('MHYRV223035400146');
    expect(r.colour).toBeTruthy();
    expect(typeof r.colour).toBe('string');
  });
});

describe('detectModel', () => {
  it('returns model name string', () => {
    const m = detectModel('MHYRV223035400146');
    expect(typeof m).toBe('string');
    expect(m.length).toBeGreaterThan(0);
  });
});
