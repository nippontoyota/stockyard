import { Router, Request, Response } from 'express';
import { db } from '../db/client.js';
import { credentials, yards } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const authRouter = Router();

// Seed initial default passwords into database if empty
async function seedDefaultCredentials() {
  try {
    const existing = await db.select().from(credentials);
    if (existing.length === 0) {
      const allYards = await db.select().from(yards);
      const defaultRows = [
        {
          username: 'ADMIN123@nippon.com',
          password: 'ADMIN123@nippon.com',
          role: 'admin',
          yard_id: null as string | null,
        },
        ...allYards.map((y: { id: string }) => ({
          username: `${y.id}@nippon.com`,
          password: `${y.id}@nippon.com`,
          role: 'yard',
          yard_id: y.id,
        })),
      ];
      await db.insert(credentials).values(defaultRows).onConflictDoNothing();
    }
  } catch (err) {
    console.error('Credentials seed warning:', err);
  }
}

seedDefaultCredentials();

/**
 * POST /api/auth/login
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = String(username).trim();
    const cleanPassword = String(password).trim();

    // Check DB
    const found = await db.select().from(credentials).where(eq(credentials.username, cleanUsername));
    
    if (found.length > 0) {
      const user = found[0];
      if (user.password === cleanPassword) {
        return res.json({
          success: true,
          user: {
            username: user.username,
            role: user.role,
            yardId: user.yard_id,
          },
        });
      }
      return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });
    }

    // Default fallback check for dynamic validation if DB table is unpopulated
    if (cleanUsername === 'ADMIN123@nippon.com' && cleanPassword === 'ADMIN123@nippon.com') {
      return res.json({
        success: true,
        user: { username: cleanUsername, role: 'admin', yardId: null },
      });
    }

    if (cleanUsername.endsWith('@nippon.com')) {
      const yardCode = cleanUsername.replace('@nippon.com', '');
      if (cleanPassword === cleanUsername || cleanPassword === yardCode) {
        return res.json({
          success: true,
          user: { username: cleanUsername, role: 'yard', yardId: yardCode },
        });
      }
    }

    return res.status(401).json({ error: 'Invalid username or password.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/credentials
 */
authRouter.get('/credentials', async (req: Request, res: Response) => {
  try {
    await seedDefaultCredentials();
    const rows = await db.select().from(credentials);
    const yardList = await db.select().from(yards);

    const yardMap = new Map<string, { id: string; name: string; code: string }>(
      yardList.map((y: { id: string; name: string; code: string }) => [y.id, y])
    );

    const result = rows.map((row: { id: string; username: string; password: string; role: string; yard_id: string | null; updated_at: Date }) => {
      const yard = row.yard_id ? yardMap.get(row.yard_id) : null;
      return {
        id: row.id,
        username: row.username,
        password: row.password,
        role: row.role,
        yardId: row.yard_id,
        yardName: yard ? yard.name : (row.role === 'admin' ? 'System Administrator' : 'Stockyard Account'),
        isDefault: row.password === row.username,
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
authRouter.post('/credentials/update', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and new password are required' });
    }

    const cleanUsername = String(username).trim();
    const cleanPassword = String(password).trim();

    const existing = await db.select().from(credentials).where(eq(credentials.username, cleanUsername));

    if (existing.length > 0) {
      await db
        .update(credentials)
        .set({ password: cleanPassword, updated_at: new Date() })
        .where(eq(credentials.username, cleanUsername));
    } else {
      const role = cleanUsername === 'ADMIN123@nippon.com' ? 'admin' : 'yard';
      const yardId = cleanUsername.endsWith('@nippon.com') ? cleanUsername.replace('@nippon.com', '') : null;
      await db.insert(credentials).values({
        username: cleanUsername,
        password: cleanPassword,
        role,
        yard_id: yardId,
      });
    }

    return res.json({ success: true, message: `Password for ${cleanUsername} updated successfully.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
