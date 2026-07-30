import { db } from '../db/client.js';
import { branchYards } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '../middleware/auth.js';

/** Resolve branch_id from JWT or yard → branch_yards mapping (stockyard mock auth). */
export async function resolveBranchId(user: AuthUser): Promise<string | null> {
  if (user.branch_id) return user.branch_id;
  if (user.yard_id) {
    const [row] = await db
      .select({ branch_id: branchYards.branch_id })
      .from(branchYards)
      .where(eq(branchYards.yard_id, user.yard_id))
      .limit(1);
    return row?.branch_id ?? null;
  }
  return null;
}
