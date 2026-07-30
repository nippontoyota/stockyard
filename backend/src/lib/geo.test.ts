import { describe, it, expect } from 'vitest';
import { haversineMeters } from './geo.js';

describe('haversineMeters', () => {
  it('returns 0 for same coordinates', () => {
    expect(haversineMeters(12.97, 77.59, 12.97, 77.59)).toBe(0);
  });

  it('returns distance between Bidadi and Yelahanka', () => {
    const d = haversineMeters(12.8013, 77.4719, 13.1017, 77.5962);
    expect(d).toBeGreaterThan(30000);
    expect(d).toBeLessThan(40000);
  });

  it('returns ~0m for same point with high precision', () => {
    const d = haversineMeters(12.9715987, 77.5945627, 12.9715987, 77.5945627);
    expect(d).toBe(0);
  });

  it('returns distance between Bengaluru and Mysore', () => {
    const d = haversineMeters(12.9716, 77.5946, 12.2958, 76.6394);
    expect(d).toBeGreaterThan(125000);
    expect(d).toBeLessThan(135000);
  });
});
