import { describe, expect, it } from 'vitest';
import { locationString } from './syncNipponstockLocations.js';

describe('locationString', () => {
  const yard = { code: 'CO01B', name: 'Towers- 7th floor, Kalamassery', id: 'CO01B-3' };

  it('formats in / transit / out', () => {
    expect(locationString('in', yard)).toBe('CO01B · Towers- 7th floor, Kalamassery');
    expect(locationString('transit', yard)).toBe(
      'In transit → CO01B · Towers- 7th floor, Kalamassery',
    );
    expect(locationString('out', yard)).toBe('OUT · CO01B · Towers- 7th floor, Kalamassery');
  });

  it('returns null without yard', () => {
    expect(locationString('in', null)).toBeNull();
  });
});
