import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb } from '@/lib/db';
import { IdempotencyService } from '@/lib/services/idempotency.service';
import { WorkItemService } from '@/lib/services/work-item.service';

describe('Idempotency Service Tests', () => {
  let db: any;
  let admin: any;

  beforeEach(() => {
    db = resetTestDb();
    db.prepare("INSERT INTO teams (id, slug, name, description, default_sla_hours) VALUES ('team_ops', 'ops', 'Operations', 'Core Ops', 4)").run();
    admin = { id: 'u_admin', name: 'Admin', email: 'admin@ops.com', role: 'ADMIN', avatar_url: '' };
    db.prepare("INSERT INTO users (id, name, email, role, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
      .run(admin.id, admin.name, admin.email, admin.role, admin.avatar_url);
  });

  it('executes operation once and returns cached response on subsequent identical requests', async () => {
    const idempotencyKey = 'key-test-uuid-9901';
    const payload = {
      title: 'Urgent Wire Hold',
      description: 'Customer wire verification required',
      category: 'PAYMENT_INVESTIGATION',
      priority: 'HIGH',
      teamId: 'team_ops',
    };

    let executionCount = 0;

    const op = async () => {
      executionCount++;
      const item = WorkItemService.createWorkItem(db, { ...payload, actor: admin } as any);
      return { statusCode: 201, data: { item } };
    };

    // First request
    const firstResult = await IdempotencyService.executeWithIdempotency(
      db,
      idempotencyKey,
      '/api/work-items',
      payload,
      op
    );

    expect(firstResult.cached).toBe(false);
    expect(firstResult.statusCode).toBe(201);
    expect(firstResult.data.item.title).toBe('Urgent Wire Hold');
    expect(executionCount).toBe(1);

    // Second request (e.g. browser retry or network repeat)
    const secondResult = await IdempotencyService.executeWithIdempotency(
      db,
      idempotencyKey,
      '/api/work-items',
      payload,
      op
    );

    expect(secondResult.cached).toBe(true);
    expect(secondResult.statusCode).toBe(201);
    expect(secondResult.data.item.id).toBe(firstResult.data.item.id);
    expect(executionCount).toBe(1); // Function was NOT re-executed!

    // Verify exactly 1 work item was created in DB
    const count = db.prepare('SELECT COUNT(*) as count FROM work_items').get().count;
    expect(count).toBe(1);
  });
});
