import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb } from '@/lib/db';
import { WorkItemService } from '@/lib/services/work-item.service';
import { StateMachineEngine } from '@/lib/services/state-machine';

describe('Guarded State Machine Tests', () => {
  let db: any;
  let admin: any;
  let operator: any;
  let manager: any;

  beforeEach(() => {
    db = resetTestDb();
    db.prepare("INSERT INTO teams (id, slug, name, description, default_sla_hours) VALUES ('team_ops', 'ops', 'Operations', 'Core Ops', 4)").run();
    admin = { id: 'u_admin', name: 'Admin', email: 'admin@ops.com', role: 'ADMIN', avatar_url: '' };
    operator = { id: 'u_op', name: 'Operator', email: 'op@ops.com', role: 'OPERATOR', avatar_url: '' };
    manager = { id: 'u_mgr', name: 'Manager', email: 'mgr@ops.com', role: 'MANAGER', avatar_url: '' };

    for (const u of [admin, operator, manager]) {
      db.prepare("INSERT INTO users (id, name, email, role, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
        .run(u.id, u.name, u.email, u.role, u.avatar_url);
    }
  });

  it('rejects invalid state jumps', () => {
    const item = WorkItemService.createWorkItem(db, {
      title: 'Triage Task',
      description: 'Testing state transitions',
      category: 'CUSTOMER_ESCALATION',
      priority: 'LOW',
      teamId: 'team_ops',
      actor: admin,
    });

    expect(item.status).toBe('TRIAGE');

    // Attempt invalid jump directly from TRIAGE to RESOLVED
    const res = WorkItemService.transitionStatus(db, item.id, 'RESOLVED', null, operator, 1);
    expect(res.success).toBe(false);
    expect(res.error).toContain("cannot move from 'TRIAGE' to 'RESOLVED'");
  });

  it('requires justification reason when closing directly from TRIAGE', () => {
    const item = WorkItemService.createWorkItem(db, {
      title: 'Obsolete Alert',
      description: 'False alarm to be discarded',
      category: 'INCIDENT',
      priority: 'LOW',
      teamId: 'team_ops',
      actor: admin,
    });

    // Attempt closing without reason
    const res1 = WorkItemService.transitionStatus(db, item.id, 'CLOSED', '', operator, 1);
    expect(res1.success).toBe(false);
    expect(res1.error).toContain('reason (e.g. duplicate, invalid, or obsolete) is required');

    // Attempt closing with reason
    const res2 = WorkItemService.transitionStatus(db, item.id, 'CLOSED', 'Duplicate of OPS-1002, closing out.', operator, 1);
    expect(res2.success).toBe(true);
    expect(res2.item?.status).toBe('CLOSED');
  });

  it('blocks resolution of high-priority payment investigations without manager approval', () => {
    const item = WorkItemService.createWorkItem(db, {
      title: 'High Risk Transfer',
      description: 'Flagged by fraud engine',
      category: 'PAYMENT_INVESTIGATION',
      priority: 'CRITICAL',
      teamId: 'team_ops',
      actor: admin,
    });

    // Move to INVESTIGATING
    WorkItemService.transitionStatus(db, item.id, 'INVESTIGATING', null, operator, 1);
    // Move to IN_PROGRESS
    WorkItemService.transitionStatus(db, item.id, 'IN_PROGRESS', null, operator, 2);

    // Operator attempts to resolve without sign-off
    const attempt = WorkItemService.transitionStatus(db, item.id, 'RESOLVED', 'Seems fine', operator, 3);
    expect(attempt.success).toBe(false);
    expect(attempt.error).toContain('Resolution Blocked: High-priority PAYMENT INVESTIGATION work items require an approved sign-off');

    // Request Approval
    const approval = WorkItemService.requestApproval(db, item.id, 'MANAGER', 'Customer verified by phone', operator);
    expect(approval.status).toBe('PENDING');

    // Manager approves
    const decideRes = WorkItemService.decideApproval(db, approval.id, 'APPROVED', 'Verified by Finance Lead', manager);
    expect(decideRes.success).toBe(true);

    // Now resolution succeeds
    const refreshed = WorkItemService.getWorkItemById(db, item.id)!;
    const resolveRes = WorkItemService.transitionStatus(db, item.id, 'RESOLVED', 'Signed off and verified', operator, refreshed.version);
    expect(resolveRes.success).toBe(true);
    expect(resolveRes.item?.status).toBe('RESOLVED');
  });
});
