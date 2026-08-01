import type { Request, Response, NextFunction } from 'express';
import { verifySessionToken } from '../lib/session.js';

export interface AuthUser {
  id: string;
  role: 'stockyard' | 'admin' | 'delivery_incharge';
  yard_id: string | null;
  branch_id: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const isDev = () => process.env.NODE_ENV !== 'production';

function resolveMockUser(token: string): AuthUser | null {
  if (!isDev()) return null;
  if (token === 'mock-admin') {
    return { id: 'mock-admin-id', role: 'admin', yard_id: null, branch_id: null };
  }
  if (token.startsWith('mock-yard-')) {
    return { id: 'mock-yard-id', role: 'stockyard', yard_id: token.slice(10), branch_id: null };
  }
  if (token.startsWith('mock-delivery-')) {
    return { id: 'mock-delivery-id', role: 'delivery_incharge', yard_id: null, branch_id: token.slice(14) };
  }
  return null;
}

function resolveUser(token: string): AuthUser | null {
  return verifySessionToken(token) ?? resolveMockUser(token);
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const user = resolveUser(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(role: AuthUser['role']) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    const user = resolveUser(token);
    if (user) req.user = user;
  }

  next();
}
