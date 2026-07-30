import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth.js';

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

  it('accepts mock-admin token', async () => {
    const { req, res, next } = mockReqRes({ authorization: 'Bearer mock-admin' });
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.role).toBe('admin');
  });

  it('accepts mock-yard-{id} token', async () => {
    const { req, res, next } = mockReqRes({ authorization: 'Bearer mock-yard-yard1' });
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.role).toBe('stockyard');
    expect(req.user?.yard_id).toBe('yard1');
  });

  it('accepts mock-delivery-{branchId} token', async () => {
    const { req, res, next } = mockReqRes({ authorization: 'Bearer mock-delivery-branch-uuid' });
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.role).toBe('delivery_incharge');
    expect(req.user?.branch_id).toBe('branch-uuid');
  });
});
