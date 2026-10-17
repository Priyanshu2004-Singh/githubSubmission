import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb } from '@/lib/db';
import { WorkItemService } from '@/lib/services/work-item.service';

describe('Critical Concurrency Tests', () => {
  let db: any;
  let admin: any;
  let userA: any;
  let userB: any;

  beforeEach(() => {
    db = resetTestDb();

    // Setup teams & users
    db.prepare("INSERT INTO teams (id, slug, name, description, default_sla_hours) VALUES ('team_ops', 'ops', 'Operations', 'Core Ops', 4)").run();

    admin = { id: 'u_admin', name: 'Admin', email: 'admin@ops.com', role: 'ADMIN', avatar_url: '' };
    userA = { id: 'u_alice', name: 'Alice', email: 'alice@ops.com', role: 'OPERATOR', avatar_url: '' };
    userB = { id: 'u_bob', name: 'Bob', email: 'bob@ops.com', role: 'OPERATOR', avatar_url: '' };

    for (const u of [admin, userA, userB]) {
      db.prepare("INSERT INTO users (id, name, email, role, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
        .run(u.id, u.name, u.email, u.role, u.avatar_url);
    }
  });

  it('guarantees atomic claiming under simultaneous race conditions (exactly 1 winner)', async () => {
    // Create unassigned test item
    const item = WorkItemService.createWorkItem(db, {
      title: 'High Pressure Production Alert',
      description: 'Multiple users attempt to claim this item at the exact same time.',
      category: 'INCIDENT',
      priority: 'CRITICAL',
      teamId: 'team_ops',
      actor: admin,
    });

    expect(item.assigned_to).toBeNull();
    expect(item.status).toBe('TRIAGE');

    // Fire 2 parallel claims simultaneously
    const [resultA, resultB] = await Promise.all([
      Promise.resolve().then(() => WorkItemService.claimWorkItem(db, item.id, userA, 1)),
      Promise.resolve().then(() => WorkItemService.claimWorkItem(db, item.id, userB, 1)),
    ]);

    // One MUST succeed and one MUST fail with 409 conflict
    const successCount = (resultA.success ? 1 : 0) + (resultB.success ? 1 : 0);
    const failureCount = (!resultA.success ? 1 : 0) + (!resultB.success ? 1 : 0);

    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);

    const loser = !resultA.success ? resultA : resultB;
    expect(loser.conflict).toBeDefined();
    expect(loser.conflict.error).toBe('ALREADY_CLAIMED');

    // Verify DB state is consistent
    const finalItem = WorkItemService.getWorkItemById(db, item.id);
    expect(finalItem?.assigned_to).toBeDefined();
    expect(['u_alice', 'u_bob']).toContain(finalItem?.assigned_to);
    expect(finalItem?.status).toBe('INVESTIGATING');
    expect(finalItem?.version).toBe(2);
  });

  it('detects and rejects stale updates via Optimistic Concurrency Control (OCC)', () => {
    const item = WorkItemService.createWorkItem(db, {
      title: 'Payment Anomaly',
      description: 'Test OCC collision prevention',
      category: 'PAYMENT_INVESTIGATION',
      priority: 'MEDIUM',
      teamId: 'team_ops',
      actor: admin,
    });

    expect(item.version).toBe(1);

    // User A updates item at version 1 -> bumps to version 2
    const updateA = WorkItemService.updateWorkItem(
      db,
      item.id,
      { priority: 'CRITICAL' },
      userA,
      1 // expected_version
    );

    expect(updateA.success).toBe(true);
    expect(updateA.item?.version).toBe(2);
    expect(updateA.item?.priority).toBe('CRITICAL');

    // User B tries to update using stale expected_version 1
    const updateB = WorkItemService.updateWorkItem(
      db,
      item.id,
      { description: 'Stale overwrite attempt from Bob' },
      userB,
      1 // STALE expected_version
    );

    expect(updateB.success).toBe(false);
    expect(updateB.conflict).toBeDefined();
    expect(updateB.conflict?.error).toBe('OCC_VERSION_CONFLICT');
    expect(updateB.conflict?.expected_version).toBe(1);
    expect(updateB.conflict?.current_version).toBe(2);
    expect(updateB.conflict?.conflicting_fields).toContain('description');

    // Ensure database remained protected
    const finalItem = WorkItemService.getWorkItemById(db, item.id);
    expect(finalItem?.version).toBe(2);
    expect(finalItem?.priority).toBe('CRITICAL');
    expect(finalItem?.description).toBe('Test OCC collision prevention');
  });
});
