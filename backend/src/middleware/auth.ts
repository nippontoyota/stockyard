import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Supabase JWKS — keys are cached automatically by jose
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export interface AuthUser {
  id: string;
  role: 'stockyard' | 'admin';
  yard_id: string | null;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Verify Supabase JWT from Authorization header.
 * Reads role and yard_id from app_metadata in the JWT claims.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  // Mock token support for local dev without Supabase
  if (token === 'mock-admin') {
    req.user = { id: 'mock-admin-id', role: 'admin', yard_id: null };
    return next();
  }
  if (token.startsWith('mock-yard-')) {
    req.user = { id: 'mock-yard-id', role: 'stockyard', yard_id: token.slice(10) };
    return next();
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${process.env.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });

    const appMeta = (payload as Record<string, unknown>).app_metadata as
      | { role?: string; yard_id?: string }
      | undefined;

    req.user = {
      id: payload.sub!,
      role: (appMeta?.role as AuthUser['role']) ?? 'stockyard',
      yard_id: appMeta?.yard_id ?? null,
    };

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
}

/**
 * Require a specific role. Use after authenticate().
 */
export function requireRole(role: AuthUser['role']) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
