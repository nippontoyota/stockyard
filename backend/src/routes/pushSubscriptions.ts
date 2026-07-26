import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pushSubscriptions } from '../db/schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const subscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

router.post('/subscribe', authenticate, async (req, res, next) => {
  try {
    const { endpoint, keys } = subscribeBody.parse(req.body);
    const userId = req.user!.id; // we can use user id from auth token

    await db.insert(pushSubscriptions)
      .values({
        user_id: userId,
        endpoint,
        keys_p256dh: keys.p256dh,
        keys_auth: keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { user_id: userId, keys_p256dh: keys.p256dh, keys_auth: keys.auth },
      });

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/unsubscribe', authenticate, async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.user_id, req.user!.id)));
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
