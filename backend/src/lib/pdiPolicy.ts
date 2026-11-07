import { z } from 'zod';
import type { AuthUser } from '../middleware/auth.js';

export const pdiEnabled = () => process.env.PDI_ENABLED === 'true';

export const inspectionBody = z.object({
  submission_id: z.string().uuid(),
  expected_latest_id: z.string().uuid().nullable(),
  expected_yard_id: z.string().min(1),
  checking_completed: z.literal(true),
  result: z.enum(['ok', 'repair_required']),
  remarks: z.string().trim().max(2000).default(''),
}).strict().refine(body => body.result !== 'repair_required' || body.remarks.length > 0, {
  message: 'Describe the repair required.', path: ['remarks'],
});

export function pdiRouteAllowed(path: string, method: string) {
  const pathname = path.split('?')[0].replace(/\/$/, '');
  return pathname.startsWith('/api/pdi/') || pathname === '/api/pdi'
    || (pathname === '/api/auth/me' && method === 'GET');
}

export function canReadPdi(user: AuthUser, yardId: string | null, branchYardIds: string[]) {
  if (user.role === 'admin') return true;
  if (!yardId) return false;
  if (user.role === 'stockyard') return user.yard_id === yardId;
  return (user.role === 'pdi' || user.role === 'delivery_incharge')
    && !!user.branch_id && branchYardIds.includes(yardId);
}
