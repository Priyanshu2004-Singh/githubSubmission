import crypto from 'crypto';
import Database from 'better-sqlite3';
import { 
  WorkItem, 
  WorkItemCategory, 
  WorkItemPriority, 
  WorkItemStatus, 
  User, 
  WorkItemListResponse, 
  WorkItemApproval,
  Role,
  OCCConflictResponse
} from '../types';
import { AuditService } from './audit.service';
import { StateMachineEngine } from './state-machine';
import { OutboxService } from './outbox.worker';
import { eventBus } from './event-bus';

export class WorkItemService {
  /**
   * List work items with cursor-based pagination, multi-attribute filtering, and high-performance search.
   */
  static listWorkItems(
    db: Database.Database,
    params: {
      teamId?: string;
      status?: WorkItemStatus;
      priority?: WorkItemPriority;
      assignedTo?: string; // 'unassigned', user_id, or undefined
      slaStatus?: string;
      category?: WorkItemCategory;
      search?: string;
      cursor?: string; // encoded created_at:id
      limit?: number;
    }
  ): WorkItemListResponse {
    const limit = Math.min(params.limit || 25, 100);
    const conditions: string[] = [];
    const values: any[] = [];

    if (params.teamId) {
      conditions.push('w.team_id = ?');
      values.push(params.teamId);
    }
    if (params.status) {
      conditions.push('w.status = ?');
      values.push(params.status);
    }
    if (params.priority) {
      conditions.push('w.priority = ?');
      values.push(params.priority);
    }
    if (params.assignedTo === 'unassigned') {
      conditions.push('w.assigned_to IS NULL');
    } else if (params.assignedTo) {
      conditions.push('w.assigned_to = ?');
      values.push(params.assignedTo);
    }
    if (params.slaStatus) {
      conditions.push('w.sla_status = ?');
      values.push(params.slaStatus);
    }
    if (params.category) {
      conditions.push('w.category = ?');
      values.push(params.category);
    }
    if (params.search && params.search.trim()) {
      const term = `%${params.search.trim()}%`;
      conditions.push('(w.title LIKE ? OR w.description LIKE ? OR w.item_code LIKE ?)');
      values.push(term, term, term);
    }

    // Cursor pagination (keyset based on created_at DESC, id DESC)
    if (params.cursor) {
      try {
        const [cursorCreatedAt, cursorId] = Buffer.from(params.cursor, 'base64').toString('utf-8').split(':::');
        if (cursorCreatedAt && cursorId) {
          conditions.push('(w.created_at < ? OR (w.created_at = ? AND w.id < ?))');
          values.push(cursorCreatedAt, cursorCreatedAt, cursorId);
        }
      } catch (e) {
        // invalid cursor, ignore
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        w.*,
        t.name as team_name,
        t.slug as team_slug,
        u.name as assignee_name,
        u.avatar_url as assignee_avatar,
        c.name as creator_name,
        (SELECT COUNT(*) FROM work_item_approvals a WHERE a.work_item_id = w.id AND a.status = 'PENDING') as pending_approvals_count
      FROM work_items w
      JOIN teams t ON w.team_id = t.id
      JOIN users c ON w.created_by = c.id
      LEFT JOIN users u ON w.assigned_to = u.id
      ${whereClause}
      ORDER BY w.created_at DESC, w.id DESC
      LIMIT ?
    `;

    const rows = db.prepare(query).all(...values, limit + 1) as any[];

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const nextItem = rows.pop(); // Remove the extra peek element
      nextCursor = Buffer.from(`${nextItem.created_at}:::${nextItem.id}`).toString('base64');
    }

    // Compute active system-wide metrics
    const metricsRow = db.prepare(`
      SELECT 
        SUM(CASE WHEN priority = 'CRITICAL' AND status NOT IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) as critical_count,
        SUM(CASE WHEN assigned_to IS NULL AND status NOT IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) as unassigned_count,
        (SELECT COUNT(*) FROM work_item_approvals WHERE status = 'PENDING') as pending_approvals_count,
        SUM(CASE WHEN sla_status = 'WARNING' AND status NOT IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) as sla_warning_count,
        SUM(CASE WHEN sla_status = 'BREACHED' AND status NOT IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) as sla_breached_count,
        COUNT(*) as total_count
      FROM work_items
    `).get() as any;

    const items: WorkItem[] = rows.map((r) => ({
      ...r,
      has_pending_approval: Number(r.pending_approvals_count) > 0,
    }));

    return {
      items,
      next_cursor: nextCursor,
      total_count: metricsRow?.total_count || 0,
      metrics: {
        critical_count: metricsRow?.critical_count || 0,
        unassigned_count: metricsRow?.unassigned_count || 0,
        pending_approvals_count: metricsRow?.pending_approvals_count || 0,
        sla_warning_count: metricsRow?.sla_warning_count || 0,
        sla_breached_count: metricsRow?.sla_breached_count || 0,
      },
    };
  }

  /**
   * Get single work item by ID with full join, timeline, approvals, and live presence.
   */
  static getWorkItemById(db: Database.Database, id: string): (WorkItem & { activities: any[]; approvals: any[]; active_presence: any[] }) | null {
    const item = db.prepare(`
      SELECT 
        w.*,
        t.name as team_name,
        t.slug as team_slug,
        u.name as assignee_name,
        u.avatar_url as assignee_avatar,
        c.name as creator_name
      FROM work_items w
      JOIN teams t ON w.team_id = t.id
      JOIN users c ON w.created_by = c.id
      LEFT JOIN users u ON w.assigned_to = u.id
      WHERE w.id = ?
    `).get(id) as any;

    if (!item) return null;

    const activities = AuditService.getActivities(db, id);

    const approvals = db.prepare(`
      SELECT 
        a.*,
        req.name as requester_name,
        dec.name as decider_name
      FROM work_item_approvals a
      JOIN users req ON a.requested_by = req.id
      LEFT JOIN users dec ON a.decided_by = dec.id
      WHERE a.work_item_id = ?
      ORDER BY a.created_at ASC
    `).all(id) as any[];

    const activePresence = eventBus.getActivePresence(id);

    return {
      ...item,
      activities,
      approvals,
      active_presence: activePresence,
      has_pending_approval: approvals.some(a => a.status === 'PENDING'),
    };
  }

  /**
   * Create new work item inside an atomic transaction with audit and outbox event.
   */
  static createWorkItem(
    db: Database.Database,
    params: {
      title: string;
      description: string;
      category: WorkItemCategory;
      priority: WorkItemPriority;
      teamId: string;
      actor: User;
      assignedTo?: string | null;
    }
  ): WorkItem {
    const id = `item_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Fetch team SLA
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(params.teamId) as any;
    if (!team) throw new Error(`Invalid team ID: ${params.teamId}`);

    const slaHours = team.default_sla_hours || 24;
    const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

    // Generate readable code: OPS-{sequence}
    const maxCodeRow = db.prepare(`
      SELECT item_code FROM work_items ORDER BY rowid DESC LIMIT 1
    `).get() as any;
    let nextNum = 1001;
    if (maxCodeRow?.item_code) {
      const match = maxCodeRow.item_code.match(/\d+/);
      if (match) nextNum = parseInt(match[0], 10) + 1;
    }
    const itemCode = `OPS-${nextNum}`;

    const executeTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO work_items (
          id, item_code, title, description, category, status, priority, 
          team_id, assigned_to, created_by, version, sla_due_at, sla_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'TRIAGE', ?, ?, ?, ?, 1, ?, 'HEALTHY', ?, ?)
      `).run(
        id,
        itemCode,
        params.title,
        params.description,
        params.category,
        params.priority,
        params.teamId,
        params.assignedTo || null,
        params.actor.id,
        slaDueAt,
        now,
        now
      );

      // Audit log
      AuditService.recordActivity(db, {
        workItemId: id,
        actorId: params.actor.id,
        eventType: 'CREATED',
        comment: `Created work item [${itemCode}] for ${team.name} with priority ${params.priority}`,
      });

      // Outbox event for asynchronous processing
      OutboxService.enqueueEvent(db, 'WORK_ITEM_CREATED', {
        id,
        itemCode,
        title: params.title,
        category: params.category,
        priority: params.priority,
        teamId: params.teamId,
        slaDueAt,
      });
    });

    executeTx();

    const created = this.getWorkItemById(db, id)!;
    eventBus.publish('WORK_ITEM_CREATED', created);
    return created;
  }

  /**
   * CRITICAL GUARANTEE 1: Atomic Work Item Claiming.
   * Prevents two users from claiming the same work item concurrently.
   */
  static claimWorkItem(
    db: Database.Database,
    itemId: string,
    actor: User,
    expectedVersion?: number
  ): { success: boolean; item?: WorkItem; conflict?: any } {
    const now = new Date().toISOString();

    const claimTx = db.transaction(() => {
      // 1. Fetch current row state
      const current = db.prepare('SELECT * FROM work_items WHERE id = ?').get(itemId) as any;
      if (!current) {
        throw new Error(`Work item not found: ${itemId}`);
      }

      // Check if already assigned to someone else
      if (current.assigned_to) {
        if (current.assigned_to === actor.id) {
          // Already claimed by this same user
          return { success: true, item: current };
        }
        const claimer = db.prepare('SELECT name, avatar_url FROM users WHERE id = ?').get(current.assigned_to) as any;
        return {
          success: false,
          conflict: {
            error: 'ALREADY_CLAIMED',
            message: `Conflict: This work item has already been claimed by ${claimer?.name || 'another team member'}.`,
            claimed_by: claimer?.name,
            claimed_by_avatar: claimer?.avatar_url,
            current_version: current.version,
          },
        };
      }

      // 2. Atomic conditional update
      const versionCondition = expectedVersion !== undefined ? 'AND version = ?' : '';
      const query = `
        UPDATE work_items
        SET assigned_to = ?,
            version = version + 1,
            updated_at = ?,
            status = CASE WHEN status = 'TRIAGE' THEN 'INVESTIGATING' ELSE status END
        WHERE id = ? AND assigned_to IS NULL ${versionCondition}
      `;

      const params = expectedVersion !== undefined 
        ? [actor.id, now, itemId, expectedVersion]
        : [actor.id, now, itemId];

      const result = db.prepare(query).run(...params);

      if (result.changes === 0) {
        // Race condition occurred during write
        const refreshed = db.prepare('SELECT * FROM work_items WHERE id = ?').get(itemId) as any;
        if (refreshed.assigned_to) {
          const claimer = db.prepare('SELECT name, avatar_url FROM users WHERE id = ?').get(refreshed.assigned_to) as any;
          return {
            success: false,
            conflict: {
              error: 'ALREADY_CLAIMED',
              message: `Race Condition: Claimed simultaneously by ${claimer?.name || 'another user'}.`,
              claimed_by: claimer?.name,
              current_version: refreshed.version,
            },
          };
        }

        return {
          success: false,
          conflict: {
            error: 'OCC_VERSION_CONFLICT',
            message: 'Stale Version: The work item was modified by another user before your claim could complete.',
            expected_version: expectedVersion,
            current_version: refreshed.version,
          },
        };
      }

      // 3. Record Audit
      AuditService.recordActivity(db, {
        workItemId: itemId,
        actorId: actor.id,
        eventType: 'CLAIMED',
        comment: `${actor.name} claimed ownership of this work item. Status automatically moved to INVESTIGATING.`,
      });

      // 4. Outbox Event
      OutboxService.enqueueEvent(db, 'WORK_ITEM_CLAIMED', {
        itemId,
        actorId: actor.id,
        actorName: actor.name,
      });

      return { success: true };
    });

    const res = claimTx();
    if (!res.success) {
      return res;
    }

    const updated = this.getWorkItemById(db, itemId)!;
    eventBus.publish('WORK_ITEM_UPDATED', updated);
    return { success: true, item: updated };
  }

  /**
   * CRITICAL GUARANTEE 2: Optimistic Concurrency Control (OCC) with 3-Way Diff.
   * Prevents silent overwriting of remote updates.
   */
  static updateWorkItem(
    db: Database.Database,
    itemId: string,
    updates: Partial<Pick<WorkItem, 'title' | 'description' | 'priority' | 'team_id' | 'assigned_to' | 'resolution_notes'>>,
    actor: User,
    expectedVersion: number
  ): { success: boolean; item?: WorkItem; conflict?: OCCConflictResponse } {
    const current = db.prepare('SELECT * FROM work_items WHERE id = ?').get(itemId) as any;
    if (!current) {
      throw new Error(`Work item not found: ${itemId}`);
    }

    // OCC Check
    if (current.version !== expectedVersion) {
      const conflictingFields: string[] = [];
      for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
        if (updates[key] !== undefined && updates[key] !== current[key]) {
          conflictingFields.push(key);
        }
      }

      return {
        success: false,
        conflict: {
          error: 'OCC_VERSION_CONFLICT',
          message: `Concurrency Conflict: Work item has been modified by another user (Server version: ${current.version}, Your version: ${expectedVersion}). Please review changes.`,
          expected_version: expectedVersion,
          current_version: current.version,
          current_item: current,
          conflicting_fields: conflictingFields,
        },
      };
    }

    const now = new Date().toISOString();
    const newVersion = current.version + 1;

    // Build update statements
    const updateKeys = Object.keys(updates).filter(k => (updates as any)[k] !== undefined);
    if (updateKeys.length === 0) {
      return { success: true, item: current };
    }

    const setClauses = updateKeys.map(k => `${k} = :${k}`).join(', ');
    const query = `
      UPDATE work_items
      SET ${setClauses},
          version = :newVersion,
          updated_at = :now
      WHERE id = :id AND version = :expectedVersion
    `;

    const tx = db.transaction(() => {
      const res = db.prepare(query).run({
        ...updates,
        id: itemId,
        newVersion,
        now,
        expectedVersion,
      });

      if (res.changes === 0) {
        throw new Error('CONCURRENCY_RACE_OCCURRED');
      }

      // Compute field diff for audit trail
      const diff = AuditService.calculateDiff(current, { ...current, ...updates });
      if (diff) {
        AuditService.recordActivity(db, {
          workItemId: itemId,
          actorId: actor.id,
          eventType: 'UPDATED',
          diff,
          comment: `${actor.name} updated fields: ${Object.keys(diff).join(', ')}`,
        });
      }
    });

    tx();

    const updated = this.getWorkItemById(db, itemId)!;
    eventBus.publish('WORK_ITEM_UPDATED', updated);
    return { success: true, item: updated };
  }

  /**
   * CRITICAL GUARANTEE 4: Guarded Workflow State Machine Transition.
   */
  static transitionStatus(
    db: Database.Database,
    itemId: string,
    targetStatus: WorkItemStatus,
    reason: string | null | undefined,
    actor: User,
    expectedVersion: number
  ): { success: boolean; item?: WorkItem; error?: string; conflict?: OCCConflictResponse } {
    const item = this.getWorkItemById(db, itemId);
    if (!item) throw new Error(`Work item not found: ${itemId}`);

    // Check version
    if (item.version !== expectedVersion) {
      return {
        success: false,
        conflict: {
          error: 'OCC_VERSION_CONFLICT',
          message: `Stale Version: Work item changed from version ${expectedVersion} to ${item.version}. Please refresh.`,
          expected_version: expectedVersion,
          current_version: item.version,
          current_item: item,
          conflicting_fields: ['status'],
        },
      };
    }

    // Validate with State Machine Engine
    const validation = StateMachineEngine.validateTransition(
      item,
      targetStatus,
      actor.role,
      reason,
      item.approvals
    );

    if (!validation.allowed) {
      return {
        success: false,
        error: validation.error,
      };
    }

    const now = new Date().toISOString();
    const newVersion = item.version + 1;

    const tx = db.transaction(() => {
      const res = db.prepare(`
        UPDATE work_items
        SET status = ?,
            version = ?,
            updated_at = ?,
            resolution_notes = CASE WHEN ? = 'RESOLVED' AND ? IS NOT NULL THEN ? ELSE resolution_notes END
        WHERE id = ? AND version = ?
      `).run(targetStatus, newVersion, now, targetStatus, reason || null, reason || null, itemId, expectedVersion);

      if (res.changes === 0) {
        throw new Error('CONCURRENCY_RACE_OCCURRED');
      }

      // Record audit
      AuditService.recordActivity(db, {
        workItemId: itemId,
        actorId: actor.id,
        eventType: 'STATUS_CHANGED',
        diff: { status: { old: item.status, new: targetStatus } },
        comment: reason ? `Status moved to ${targetStatus}: ${reason}` : `Status moved to ${targetStatus}`,
      });

      // Outbox event
      OutboxService.enqueueEvent(db, 'STATUS_TRANSITIONED', {
        itemId,
        oldStatus: item.status,
        newStatus: targetStatus,
        actorId: actor.id,
      });
    });

    tx();

    const updated = this.getWorkItemById(db, itemId)!;
    eventBus.publish('WORK_ITEM_UPDATED', updated);
    return { success: true, item: updated };
  }

  /**
   * Request an operational approval sign-off.
   */
  static requestApproval(
    db: Database.Database,
    itemId: string,
    approverRoleRequired: Role,
    reason: string,
    actor: User
  ): WorkItemApproval {
    const id = `appr_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO work_item_approvals (
          id, work_item_id, requested_by, approver_role_required, status, decision_reason, created_at
        ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
      `).run(id, itemId, actor.id, approverRoleRequired, reason, now);

      // Transition to AWAITING_APPROVAL if not already
      db.prepare(`
        UPDATE work_items
        SET status = 'AWAITING_APPROVAL',
            version = version + 1,
            updated_at = ?
        WHERE id = ?
      `).run(now, itemId);

      AuditService.recordActivity(db, {
        workItemId: itemId,
        actorId: actor.id,
        eventType: 'APPROVAL_REQUESTED',
        comment: `Requested sign-off from ${approverRoleRequired}: "${reason}"`,
      });

      OutboxService.enqueueEvent(db, 'APPROVAL_REQUESTED', {
        approvalId: id,
        itemId,
        approverRoleRequired,
        requestedBy: actor.name,
      });
    });

    tx();

    const updated = this.getWorkItemById(db, itemId)!;
    eventBus.publish('WORK_ITEM_UPDATED', updated);
    return updated.approvals.find((a: any) => a.id === id)!;
  }

  /**
   * Approve or reject a pending approval request.
   */
  static decideApproval(
    db: Database.Database,
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string,
    actor: User
  ): { success: boolean; error?: string } {
    const approval = db.prepare('SELECT * FROM work_item_approvals WHERE id = ?').get(approvalId) as any;
    if (!approval) return { success: false, error: 'Approval request not found' };
    if (approval.status !== 'PENDING') return { success: false, error: 'Approval has already been decided' };

    // Role verification
    const allowedRoles = ['ADMIN', approval.approver_role_required];
    if (approval.approver_role_required === 'LEAD') allowedRoles.push('MANAGER');

    if (!allowedRoles.includes(actor.role)) {
      return {
        success: false,
        error: `Permission Denied: Decision requires role '${approval.approver_role_required}', but your role is '${actor.role}'.`,
      };
    }

    const now = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE work_item_approvals
        SET status = ?,
            decision_reason = ?,
            decided_by = ?,
            decided_at = ?
        WHERE id = ?
      `).run(decision, reason, actor.id, now, approvalId);

      // If approved, transition status to IN_PROGRESS
      const nextStatus = decision === 'APPROVED' ? 'IN_PROGRESS' : 'INVESTIGATING';
      db.prepare(`
        UPDATE work_items
        SET status = ?,
            version = version + 1,
            updated_at = ?
        WHERE id = ?
      `).run(nextStatus, now, approval.work_item_id);

      AuditService.recordActivity(db, {
        workItemId: approval.work_item_id,
        actorId: actor.id,
        eventType: 'APPROVAL_DECIDED',
        comment: `${decision} by ${actor.name} (${actor.role}): "${reason}". Status moved to ${nextStatus}.`,
      });

      OutboxService.enqueueEvent(db, 'APPROVAL_DECIDED', {
        approvalId,
        itemId: approval.work_item_id,
        decision,
        decidedBy: actor.name,
      });
    });

    tx();

    const updated = this.getWorkItemById(db, approval.work_item_id)!;
    eventBus.publish('WORK_ITEM_UPDATED', updated);
    return { success: true };
  }
}
