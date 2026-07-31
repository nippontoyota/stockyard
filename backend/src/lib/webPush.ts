import webpush from 'web-push';
import { db } from '../db/client.js';
import { pushSubscriptions } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BL9rJDXqSOkX-bSi1XfgrqQxbv0VazOVJfgJPXTqXpC3qC-FZJAKAL8vt2Tb90Nzd2olfpbjv6Py4dKIqSjF79I';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || 'IsxWBhTvT_QOorgwpLokuSd5BwInY3gKFUZv6UmlEuM';
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@nippontoyota.example.com';

webpush.setVapidDetails(subject, publicVapidKey, privateVapidKey);

export async function sendPushNotification(userId: string, payload: any) {
  try {
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.user_id, userId));
    
    for (const sub of subs) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys_p256dh,
          auth: sub.keys_auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
      } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          // Subscription has expired or is no longer valid
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          console.error('Error sending push notification', error);
        }
      }
    }
  } catch (err) {
    console.error('Push notification failed:', err);
  }
}

export async function notifyRoleAtBranch(role: string, branchId: string, payload: any) {
  try {
    const { credentials } = await import('../db/schema.js');
    const { and } = await import('drizzle-orm');
    const users = await db.select({ id: credentials.id })
      .from(credentials)
      .where(and(eq(credentials.role, role), eq(credentials.branch_id, branchId)));
      
    await Promise.all(users.map(u => sendPushNotification(u.id, payload)));
  } catch (err) {
    console.error('notifyRoleAtBranch failed:', err);
  }
}

export async function notifyAdmins(payload: { title: string; body: string; url?: string }) {
  try {
    const { credentials } = await import('../db/schema.js');
    const users = await db.select({ id: credentials.id })
      .from(credentials)
      .where(eq(credentials.role, 'admin'));

    await Promise.all(users.map((u) => sendPushNotification(u.id, payload)));
  } catch (err) {
    console.error('notifyAdmins failed:', err);
  }
}
