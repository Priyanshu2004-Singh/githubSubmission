import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb } from '@/lib/db';
import { OutboxService } from '@/lib/services/outbox.worker';
import { WorkItemService } from '@/lib/services/work-item.service';

describe('Transactional Outbox & SLA Worker Tests', () => {
  let db: any;
  let admin: any;

  beforeEach(() => {
    db = resetTestDb();
    db.prepare("INSERT INTO teams (id, slug, name, description, default_sla_hours) VALUES ('team_ops', 'ops', 'Operations', 'Core Ops', 4)").run();
    admin = { id: 'u_admin', name: 'Admin', email: 'admin@ops.com', role: 'ADMIN', avatar_url: '' };
    db.prepare("INSERT INTO users (id, name, email, role, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
      .run(admin.id, admin.name, admin.email, admin.role, admin.avatar_url);
  });

  it('processes pending outbox events and marks them PROCESSED', () => {
    const eventId = OutboxService.enqueueEvent(db, 'NOTIFICATION_DISPATCH', { recipient: 'slack-ops', text: 'Alert created' });

    const before = db.prepare('SELECT status FROM outbox_events WHERE id = ?').get(eventId);
    expect(before.status).toBe('PENDING');

    const result = OutboxService.processPendingEvents(db);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    const after = db.prepare('SELECT status, processed_at FROM outbox_events WHERE id = ?').get(eventId);
    expect(after.status).toBe('PROCESSED');
    expect(after.processed_at).toBeDefined();
  });

  it('applies exponential backoff on transient failure and routes to DLQ on max attempts', () => {
    const eventId = OutboxService.enqueueEvent(db, 'CHAOS_FORCE_FAILURE', { test: true });

    // Process once - should fail and schedule retry
    const res1 = OutboxService.processPendingEvents(db);
    expect(res1.failed).toBe(1);

    const ev1 = db.prepare('SELECT status, attempts, error_log FROM outbox_events WHERE id = ?').get(eventId);
    expect(ev1.status).toBe('PENDING');
    expect(ev1.attempts).toBe(1);
    expect(ev1.error_log).toContain('Simulated network delivery failure');

    // Simulate 4 more attempts directly to reach max_attempts (5)
    db.prepare("UPDATE outbox_events SET attempts = 4, next_retry_at = datetime('now', '-1 minute') WHERE id = ?").run(eventId);

    const res2 = OutboxService.processPendingEvents(db);
    expect(res2.failed).toBe(1);

    const evFinal = db.prepare('SELECT status, attempts FROM outbox_events WHERE id = ?').get(eventId);
    expect(evFinal.status).toBe('FAILED'); // Dead Letter Queue
    expect(evFinal.attempts).toBe(5);
  });

  it('detects and marks SLA breaches for overdue work items', () => {
    // Create an item with past SLA
    const pastSla = new Date(Date.now() - 3600 * 1000).toISOString();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO work_items (
        id, item_code, title, description, category, status, priority,
        team_id, created_by, version, sla_due_at, sla_status, created_at, updated_at
      ) VALUES ('item_past', 'OPS-999', 'Late Item', 'Desc', 'INCIDENT', 'INVESTIGATING', 'CRITICAL', 'team_ops', 'u_admin', 1, ?, 'HEALTHY', ?, ?)
    `).run(pastSla, now, now);

    const count = OutboxService.checkSLABreaches(db);
    expect(count).toBeGreaterThan(0);

    const item = db.prepare('SELECT sla_status FROM work_items WHERE id = ?').get('item_past');
    expect(item.sla_status).toBe('BREACHED');
  });
});
