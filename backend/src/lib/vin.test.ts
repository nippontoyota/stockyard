import { describe, it, expect } from 'vitest';
import { isValidVin } from './vin.js';
import { CAR_MODELS, isCarModel } from '../shared/carModels.js';

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

describe('CAR_MODELS', () => {
  it('lists 13 Nippon Toyota models', () => {
    expect(CAR_MODELS).toHaveLength(13);
    expect(CAR_MODELS).toContain('Urban Cruiser HyRyder');
    expect(CAR_MODELS).toContain('Innova HyCross');
  });

  it('accepts catalogue names', () => {
    expect(isCarModel('Fortuner')).toBe(true);
  });

  it('rejects unknown models', () => {
    expect(isCarModel('Toyota Vehicle')).toBe(false);
    expect(isCarModel('')).toBe(false);
  });
});
