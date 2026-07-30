export const ADMIN_USERNAME = 'admin';
export const ADMIN_DEFAULT_PASSWORD = 'ADMIN123';
export const DELIVERY_DEFAULT_PASSWORD = 'delivery123';

export const LEGACY_ADMIN_USERNAME = 'ADMIN123@nippon.com';

export function yardUsername(yardId: string) {
  return yardId;
}

export function deliveryUsername(branchId: string) {
  return branchId;
}

export function defaultPasswordForRole(role: string, yardCode?: string | null) {
  if (role === 'admin') return ADMIN_DEFAULT_PASSWORD;
  if (role === 'delivery_incharge') return DELIVERY_DEFAULT_PASSWORD;
  return yardCode || '';
}

export function normalizeUsername(raw: string) {
  const trimmed = raw.trim();
  if (trimmed === LEGACY_ADMIN_USERNAME) return ADMIN_USERNAME;
  if (trimmed.endsWith('@nippon.com')) return trimmed.replace('@nippon.com', '');
  return trimmed;
}

export function legacyUsername(raw: string) {
  const normalized = normalizeUsername(raw);
  if (normalized === ADMIN_USERNAME) return LEGACY_ADMIN_USERNAME;
  return `${normalized}@nippon.com`;
}
