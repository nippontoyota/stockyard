import { Router, Request, Response } from 'express';
import { db } from '../db/client.js';
import { credentials, yards, branches } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  ADMIN_USERNAME,
  ADMIN_DEFAULT_PASSWORD,
  DELIVERY_DEFAULT_PASSWORD,
  yardUsername,
  deliveryUsername,
  defaultPasswordForRole,
  normalizeUsername,
  legacyUsername,
} from '../lib/credentials.js';
import { signSessionToken } from '../lib/session.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export const authRouter = Router();

async function seedDefaultCredentials() {
  try {
    // One-time legacy username/password cleanup — safe to skip on every boot.
    // Production credentials already exist; this only fills gaps on empty DBs.
    const existing = await db.select({ username: credentials.username }).from(credentials);
    const existingUsernames = new Set(existing.map((row) => row.username));

    const allYards = await db.select().from(yards).where(eq(yards.active, true));
    const allBranches = await db.select().from(branches);

    const defaultRows = [
      {
        username: ADMIN_USERNAME,
        password: ADMIN_DEFAULT_PASSWORD,
        role: 'admin',
        yard_id: null as string | null,
        branch_id: null as string | null,
      },
      ...allYards.map((y) => ({
        username: yardUsername(y.id),
        password: defaultPasswordForRole('yard', y.code),
        role: 'yard',
        yard_id: y.id,
        branch_id: null as string | null,
      })),
      ...allBranches.map((b) => ({
        username: deliveryUsername(b.id),
        password: DELIVERY_DEFAULT_PASSWORD,
        role: 'delivery_incharge',
        yard_id: null as string | null,
        branch_id: b.id,
      })),
    ].filter((row) => !existingUsernames.has(row.username));

    if (defaultRows.length > 0) {
      await db.insert(credentials).values(defaultRows).onConflictDoNothing();
    }
  } catch (err) {
    console.error('Credentials seed warning:', err);
  }
}

/** Fill missing default credentials once per process (admin path only). */
let credentialsReady: Promise<void> | null = null;
function ensureCredentialsReady() {
  if (!credentialsReady) {
    credentialsReady = seedDefaultCredentials().catch((err) => {
      credentialsReady = null;
      throw err;
    });
  }
  return credentialsReady;
}

function resolveLoginUsername(rawUsername: string) {
  const normalized = normalizeUsername(rawUsername);
  return [normalized, legacyUsername(normalized)];
}

/**
 * POST /api/auth/login
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanPassword = String(password).trim();
    const usernameCandidates = resolveLoginUsername(String(username));

    // Login is a single indexed credentials lookup — never seed/migrate here.

    let found: (typeof credentials.$inferSelect)[] = [];
    for (const candidate of usernameCandidates) {
      found = await db.select().from(credentials).where(eq(credentials.username, candidate));
      if (found.length > 0) break;
    }

    if (found.length > 0) {
      const user = found[0];
      // Case-insensitive: UI treats yard codes as case-insensitive, and mobile
      // keyboards often lowercase the password field.
      const passwordOk =
        user.password === cleanPassword ||
        user.password.toLowerCase() === cleanPassword.toLowerCase();
      if (passwordOk) {
        return res.json({
          success: true,
          token: signSessionToken({
            id: user.id,
            role: user.role,
            yard_id: user.yard_id,
            branch_id: user.branch_id,
          }),
          user: {
            username: user.username,
            role: user.role,
            yardId: user.yard_id,
            branch_id: user.branch_id,
          },
        });
      }
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    return res.status(401).json({ error: 'Invalid username or password.' });
  } catch (err: any) {
    console.error('Auth login DB error:', err);
    return res.status(500).json({ error: 'Service temporarily unavailable. Please try again.' });
  }
});

/**
 * GET /api/admin/credentials
 */
authRouter.get('/credentials', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await ensureCredentialsReady();
    const rows = await db.select().from(credentials);
    const yardList = await db.select().from(yards);
    const branchList = await db.select().from(branches);

    const yardMap = new Map<string, { id: string; name: string; code: string }>(
      yardList.map((y) => [y.id, y]),
    );
    const branchMap = new Map(branchList.map((b) => [b.id, b]));

    const result = rows.map((row) => {
      const yard = row.yard_id ? yardMap.get(row.yard_id) : null;
      const branch = row.branch_id ? branchMap.get(row.branch_id) : null;
      const defaultPassword = defaultPasswordForRole(row.role, yard?.code);

      return {
        id: row.id,
        username: row.username,
        password: row.password,
        role: row.role,
        yardId: row.yard_id,
        yardCode: yard?.code ?? null,
        branchId: row.branch_id,
        yardName:
          yard?.name ??
          branch?.name ??
          (row.role === 'admin' ? 'System Administrator' : 'Account'),
        isDefault: row.password === defaultPassword,
        updatedAt: row.updated_at,
      };
    });

    return res.json({ credentials: result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/credentials/update
 */
authRouter.post('/credentials/update', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and new password are required' });
    }

    const cleanUsername = normalizeUsername(String(username));
    const cleanPassword = String(password).trim();

    const existing = await db.select().from(credentials).where(eq(credentials.username, cleanUsername));

    if (existing.length > 0) {
      await db
        .update(credentials)
        .set({ password: cleanPassword, updated_at: new Date() })
        .where(eq(credentials.username, cleanUsername));
    } else {
      const yardList = await db.select().from(yards);
      const branchList = await db.select().from(branches);
      const yard = yardList.find((y) => y.id === cleanUsername);
      const branch = branchList.find((b) => b.id === cleanUsername);

      let role = 'yard';
      let yardId: string | null = null;
      let branchId: string | null = null;

      if (cleanUsername === ADMIN_USERNAME) {
        role = 'admin';
      } else if (branch) {
        role = 'delivery_incharge';
        branchId = branch.id;
      } else if (yard) {
        yardId = yard.id;
      }

      await db.insert(credentials).values({
        username: cleanUsername,
        password: cleanPassword,
        role,
        yard_id: yardId,
        branch_id: branchId,
      });
    }

    return res.json({ success: true, message: `Password updated successfully.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
