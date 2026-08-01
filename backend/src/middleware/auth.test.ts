import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth.js';
import { signSessionToken } from '../lib/session.js';

function mockReqRes(headers?: Record<string, string>) {
  const req = { headers: headers || {} } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('authenticate', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'test-session-secret';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('rejects missing auth header', async () => {
    const { req, res, next } = mockReqRes({});
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects non-Bearer token', async () => {
    const { req, res, next } = mockReqRes({ authorization: 'Basic abc' });
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('accepts signed session token', async () => {
    const token = signSessionToken({
      id: 'user-1',
      role: 'admin',
      yard_id: null,
      branch_id: null,
    });
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${token}` });
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.role).toBe('admin');
  });

  it('accepts mock-admin token in non-production', async () => {
    process.env.NODE_ENV = 'development';
    const { req, res, next } = mockReqRes({ authorization: 'Bearer mock-admin' });
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.role).toBe('admin');
  });

  it('rejects mock-admin token in production', async () => {
    process.env.NODE_ENV = 'production';
    const { req, res, next } = mockReqRes({ authorization: 'Bearer mock-admin' });
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('accepts mock-yard-{id} token in development', async () => {
    process.env.NODE_ENV = 'development';
    const { req, res, next } = mockReqRes({ authorization: 'Bearer mock-yard-yard1' });
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.role).toBe('stockyard');
    expect(req.user?.yard_id).toBe('yard1');
  });
});
