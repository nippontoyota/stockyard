import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPdiPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPdiPassword(password: string, stored: string) {
  const [scheme, salt, hex] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hex || password.length > 128) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
