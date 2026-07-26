import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';

/**
 * F9 — Write an immutable audit log entry.
 * All mutating endpoints should call this after their operation.
 */
export async function logAudit(
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string | null,
  details: Record<string, unknown> = {},
  ipAddress?: string,
) {
  try {
    await db.insert(auditLogs).values({
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: details && Object.keys(details).length > 0 ? JSON.stringify(details) : null,
      ip_address: ipAddress ?? null,
    });
  } catch (err) {
    // Audit logging should never break the main operation
    console.error('[audit] Failed to write audit log:', err);
  }
}
