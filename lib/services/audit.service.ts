import crypto from 'crypto';
import Database from 'better-sqlite3';
import { ActivityEventType, WorkItemActivity } from '../types';
import { eventBus } from './event-bus';

export class AuditService {
  /**
   * Calculate a field-by-field diff between two states of a work item.
   */
  static calculateDiff(oldObj: Record<string, any>, newObj: Record<string, any>): Record<string, { old: any; new: any }> | null {
    const diff: Record<string, { old: any; new: any }> = {};
    const ignoredFields = ['updated_at', 'version', 'team_name', 'assignee_name', 'assignee_avatar', 'creator_name'];

    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      if (ignoredFields.includes(key)) continue;
      if (oldObj[key] !== newObj[key]) {
        diff[key] = {
          old: oldObj[key] ?? null,
          new: newObj[key] ?? null,
        };
      }
    }

    return Object.keys(diff).length > 0 ? diff : null;
  }

  /**
   * Record an activity event in an append-only audit trail.
   */
  static recordActivity(
    db: Database.Database,
    params: {
      workItemId: string;
      actorId: string;
      eventType: ActivityEventType;
      diff?: Record<string, { old: any; new: any }> | null;
      comment?: string | null;
    }
  ): WorkItemActivity {
    const id = `act_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const diffJson = params.diff ? JSON.stringify(params.diff) : null;

    const stmt = db.prepare(`
      INSERT INTO work_item_activities (id, work_item_id, actor_id, event_type, payload_diff, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, params.workItemId, params.actorId, params.eventType, diffJson, params.comment || null, createdAt);

    // Fetch user details for the event
    const actor = db.prepare('SELECT name, role, avatar_url FROM users WHERE id = ?').get(params.actorId) as any;

    const activity: WorkItemActivity = {
      id,
      work_item_id: params.workItemId,
      actor_id: params.actorId,
      event_type: params.eventType,
      payload_diff: params.diff || null,
      comment: params.comment || null,
      created_at: createdAt,
      actor_name: actor?.name,
      actor_role: actor?.role,
      actor_avatar: actor?.avatar_url,
    };

    // Broadcast to SSE listeners
    eventBus.publish('ACTIVITY_RECORDED', {
      workItemId: params.workItemId,
      activity,
    });

    return activity;
  }

  /**
   * Get activity history for a specific work item.
   */
  static getActivities(db: Database.Database, workItemId: string): WorkItemActivity[] {
    const rows = db.prepare(`
      SELECT a.*, u.name as actor_name, u.role as actor_role, u.avatar_url as actor_avatar
      FROM work_item_activities a
      JOIN users u ON a.actor_id = u.id
      WHERE a.work_item_id = ?
      ORDER BY a.created_at DESC
    `).all(workItemId) as any[];

    return rows.map((r) => ({
      id: r.id,
      work_item_id: r.work_item_id,
      actor_id: r.actor_id,
      event_type: r.event_type as ActivityEventType,
      payload_diff: r.payload_diff ? JSON.parse(r.payload_diff) : null,
      comment: r.comment,
      created_at: r.created_at,
      actor_name: r.actor_name,
      actor_role: r.actor_role,
      actor_avatar: r.actor_avatar,
    }));
  }
}
