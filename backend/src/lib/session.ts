import { createHmac, timingSafeEqual } from 'crypto';
import type { AuthUser } from '../middleware/auth.js';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.DATABASE_URL;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production');
  }
  return secret || 'dev-session-secret';
}

export function mapCredentialRole(role: string): AuthUser['role'] {
  if (role === 'yard') return 'stockyard';
  return role as AuthUser['role'];
}

export function signSessionToken(user: {
  id: string;
  role: string;
  yard_id: string | null;
  branch_id: string | null;
}): string {
  const payload = {
    sub: user.id,
    role: mapCredentialRole(user.role),
    yard_id: user.yard_id,
    branch_id: user.branch_id,
    exp: Date.now() + TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `stk.${body}.${sig}`;
}

export function verifySessionToken(token: string): AuthUser | null {
  if (!token.startsWith('stk.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const body = parts[1];
  const sig = parts[2];
  const expected = createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  try {
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
      sub: string;
      role: AuthUser['role'];
      yard_id: string | null;
      branch_id: string | null;
      exp: number;
    };
    if (!payload.exp || payload.exp < Date.now()) return null;
    return {
      id: payload.sub,
      role: payload.role,
      yard_id: payload.yard_id ?? null,
      branch_id: payload.branch_id ?? null,
    };
  } catch {
    return null;
  }
}
