import crypto from 'crypto';
import Database from 'better-sqlite3';
import { getDb } from '../db';
import { eventBus } from './event-bus';

export class OutboxService {
  /**
   * Enqueues an event atomically inside an existing database transaction.
   */
  static enqueueEvent(db: Database.Database, eventType: string, payload: any): string {
    const id = `outbox_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO outbox_events (id, event_type, payload, status, attempts, max_attempts, next_retry_at, created_at)
      VALUES (?, ?, ?, 'PENDING', 0, 5, ?, ?)
    `).run(id, eventType, JSON.stringify(payload), now, now);

    return id;
  }

  /**
   * Processes a batch of pending outbox events with exponential backoff and DLQ routing.
   */
  static processPendingEvents(db: Database.Database, batchSize: number = 10): { processed: number; failed: number } {
    const now = new Date().toISOString();

    const pendingEvents = db.prepare(`
      SELECT * FROM outbox_events
      WHERE status = 'PENDING' AND next_retry_at <= ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(now, batchSize) as any[];

    let processed = 0;
    let failed = 0;

    for (const event of pendingEvents) {
      try {
        // Mark as PROCESSING
        db.prepare("UPDATE outbox_events SET status = 'PROCESSING' WHERE id = ?").run(event.id);

        const payload = JSON.parse(event.payload);

        // Execute asynchronous side-effects (e.g. simulated webhooks, external notifications)
        this.dispatchHandler(event.event_type, payload);

        // Mark as PROCESSED
        const processedAt = new Date().toISOString();
        db.prepare(`
          UPDATE outbox_events
          SET status = 'PROCESSED',
              processed_at = ?,
              error_log = NULL
          WHERE id = ?
        `).run(processedAt, event.id);

        processed++;
      } catch (err: any) {
        failed++;
        const nextAttempts = event.attempts + 1;
        const isDeadLetter = nextAttempts >= event.max_attempts;

        // Exponential backoff: 2s, 4s, 8s, 16s...
        const backoffSeconds = Math.pow(2, nextAttempts);
        const nextRetry = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        db.prepare(`
          UPDATE outbox_events
          SET status = ?,
              attempts = ?,
              next_retry_at = ?,
              error_log = ?
          WHERE id = ?
        `).run(
          isDeadLetter ? 'FAILED' : 'PENDING',
          nextAttempts,
          nextRetry,
          err.message || String(err),
          event.id
        );
      }
    }

    return { processed, failed };
  }

  /**
   * Scans active work items and updates SLA status (WARNING or BREACHED)
   */
  static checkSLABreaches(db: Database.Database): number {
    const now = new Date();
    const nowIso = now.toISOString();
    const warningThresholdIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // 1 hour warning

    let updatedCount = 0;

    // 1. Mark Breached Items
    const breachedItems = db.prepare(`
      SELECT id, item_code, title, sla_due_at
      FROM work_items
      WHERE status NOT IN ('RESOLVED', 'CLOSED')
        AND sla_due_at <= ?
        AND sla_status != 'BREACHED'
    `).all(nowIso) as any[];

    for (const item of breachedItems) {
      db.prepare(`
        UPDATE work_items
        SET sla_status = 'BREACHED',
            updated_at = ?
        WHERE id = ?
      `).run(nowIso, item.id);

      eventBus.publish('SLA_BREACHED', {
        itemId: item.id,
        itemCode: item.item_code,
        title: item.title,
        slaDueAt: item.sla_due_at,
      });

      updatedCount++;
    }

    // 2. Mark Warning Items
    const warningItems = db.prepare(`
      SELECT id, item_code, title, sla_due_at
      FROM work_items
      WHERE status NOT IN ('RESOLVED', 'CLOSED')
        AND sla_due_at > ?
        AND sla_due_at <= ?
        AND sla_status = 'HEALTHY'
    `).all(nowIso, warningThresholdIso) as any[];

    for (const item of warningItems) {
      db.prepare(`
        UPDATE work_items
        SET sla_status = 'WARNING',
            updated_at = ?
        WHERE id = ?
      `).run(nowIso, item.id);

      eventBus.publish('SLA_WARNING', {
        itemId: item.id,
        itemCode: item.item_code,
        title: item.title,
        slaDueAt: item.sla_due_at,
      });

      updatedCount++;
    }

    return updatedCount;
  }

  private static dispatchHandler(eventType: string, payload: any) {
    // Simulated mock external dispatcher
    if (eventType === 'CHAOS_FORCE_FAILURE') {
      throw new Error('Simulated network delivery failure for Chaos Testing');
    }

    // Broadcast outbox success
    eventBus.publish('OUTBOX_EVENT_PROCESSED', {
      eventType,
      payload,
    });
  }
}

// Global background runner
let workerTimer: NodeJS.Timeout | null = null;

export function startOutboxWorker(intervalMs: number = 3000) {
  if (workerTimer) return;

  workerTimer = setInterval(() => {
    try {
      const db = getDb();
      OutboxService.processPendingEvents(db);
      OutboxService.checkSLABreaches(db);
    } catch (e) {
      // Don't crash main process on background tick error
      console.error('Outbox worker error:', e);
    }
  }, intervalMs);

  if (workerTimer.unref) workerTimer.unref();
}
