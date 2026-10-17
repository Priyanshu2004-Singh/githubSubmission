import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/lib/db';
import { WorkItemService } from '@/lib/services/work-item.service';
import { IdempotencyService } from '@/lib/services/idempotency.service';
import { OutboxService } from '@/lib/services/outbox.worker';

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const scenario = body?.scenario;

    if (scenario === 'claim_race') {
      // 1. Create a fresh unclaimed test item
      const admin = db.prepare("SELECT * FROM users WHERE id = 'user_alex'").get() as any;
      const testItem = WorkItemService.createWorkItem(db, {
        title: `Race Test Item ${Date.now()}`,
        description: 'Simulated incident to test concurrent claiming by multiple operators.',
        category: 'INCIDENT',
        priority: 'CRITICAL',
        teamId: 'team_infra',
        actor: admin,
      });

      const userA = db.prepare("SELECT * FROM users WHERE id = 'user_marcus'").get() as any;
      const userB = db.prepare("SELECT * FROM users WHERE id = 'user_david'").get() as any;

      // 2. Fire simultaneous claims in parallel
      const startTime = performance.now();
      const [resA, resB] = await Promise.all([
        Promise.resolve().then(() => WorkItemService.claimWorkItem(db, testItem.id, userA, 1)),
        Promise.resolve().then(() => WorkItemService.claimWorkItem(db, testItem.id, userB, 1)),
      ]);
      const durationMs = (performance.now() - startTime).toFixed(2);

      return NextResponse.json({
        scenario: 'claim_race',
        item_id: testItem.id,
        duration_ms: `${durationMs}ms`,
        user_a_result: {
          user: userA.name,
          success: resA.success,
          conflict: resA.conflict || null,
        },
        user_b_result: {
          user: userB.name,
          success: resB.success,
          conflict: resB.conflict || null,
        },
        outcome: (resA.success && !resB.success) || (!resA.success && resB.success)
          ? 'SUCCESS: Exactly one user won the claim race. Zero double-assignment.'
          : 'UNEXPECTED: Race condition not handled properly.',
      });
    }

    if (scenario === 'idempotency_burst') {
      const idempotencyKey = `chaos-burst-${crypto.randomUUID()}`;
      const admin = db.prepare("SELECT * FROM users WHERE id = 'user_alex'").get() as any;

      const payload = {
        title: `Idempotency Test Item ${Date.now()}`,
        description: 'Rapid double-click simulation with identical Idempotency-Key.',
        category: 'CUSTOMER_ESCALATION',
        priority: 'HIGH',
        teamId: 'team_support',
      };

      // Execute 3 concurrent requests with the identical key
      const results = await Promise.all([
        IdempotencyService.executeWithIdempotency(db, idempotencyKey, '/api/work-items', payload, async () => {
          const item = WorkItemService.createWorkItem(db, { ...payload, actor: admin } as any);
          return { statusCode: 201, data: { item } };
        }),
        IdempotencyService.executeWithIdempotency(db, idempotencyKey, '/api/work-items', payload, async () => {
          const item = WorkItemService.createWorkItem(db, { ...payload, actor: admin } as any);
          return { statusCode: 201, data: { item } };
        }),
        IdempotencyService.executeWithIdempotency(db, idempotencyKey, '/api/work-items', payload, async () => {
          const item = WorkItemService.createWorkItem(db, { ...payload, actor: admin } as any);
          return { statusCode: 201, data: { item } };
        }),
      ]);

      const cachedCount = results.filter((r) => r.cached).length;
      const freshCount = results.filter((r) => !r.cached).length;

      return NextResponse.json({
        scenario: 'idempotency_burst',
        idempotency_key: idempotencyKey,
        total_requests: 3,
        fresh_executions: freshCount,
        cached_replays: cachedCount,
        outcome: freshCount === 1 && cachedCount === 2
          ? 'SUCCESS: Exactly 1 item was created. 2 duplicate requests replayed cached response with zero duplicate side-effects.'
          : 'FAILURE: Idempotency failed.',
      });
    }

    if (scenario === 'occ_collision') {
      const admin = db.prepare("SELECT * FROM users WHERE id = 'user_alex'").get() as any;
      const testItem = WorkItemService.createWorkItem(db, {
        title: `OCC Test Item ${Date.now()}`,
        description: 'Testing Optimistic Concurrency Control with conflicting updates.',
        category: 'INCIDENT',
        priority: 'MEDIUM',
        teamId: 'team_secops',
        actor: admin,
      });

      // User 1 updates priority to CRITICAL at version 1 -> version becomes 2
      const update1 = WorkItemService.updateWorkItem(
        db,
        testItem.id,
        { priority: 'CRITICAL' },
        admin,
        1 // expected_version: 1
      );

      // User 2 attempts update still thinking expected_version is 1
      const user2 = db.prepare("SELECT * FROM users WHERE id = 'user_elena'").get() as any;
      const update2 = WorkItemService.updateWorkItem(
        db,
        testItem.id,
        { description: 'User 2 stale update attempting to overwrite.' },
        user2,
        1 // stale expected_version
      );

      return NextResponse.json({
        scenario: 'occ_collision',
        item_id: testItem.id,
        update_1: {
          success: update1.success,
          new_version: update1.item?.version,
        },
        update_2: {
          success: update2.success,
          conflict: update2.conflict,
        },
        outcome: update1.success && !update2.success && update2.conflict?.error === 'OCC_VERSION_CONFLICT'
          ? 'SUCCESS: Stale update rejected with 409 Conflict. Data integrity preserved.'
          : 'FAILURE: OCC did not prevent stale overwrite.',
      });
    }

    if (scenario === 'outbox_chaos') {
      const eventId = OutboxService.enqueueEvent(db, 'CHAOS_FORCE_FAILURE', {
        timestamp: Date.now(),
        reason: 'Simulated flaky webhook recipient',
      });

      // Run processor once to simulate initial failure and exponential backoff
      const initialProcess = OutboxService.processPendingEvents(db, 10);

      const eventRow = db.prepare('SELECT * FROM outbox_events WHERE id = ?').get(eventId) as any;

      return NextResponse.json({
        scenario: 'outbox_chaos',
        event_id: eventId,
        initial_process: initialProcess,
        event_state: {
          status: eventRow.status,
          attempts: eventRow.attempts,
          next_retry_at: eventRow.next_retry_at,
          error_log: eventRow.error_log,
        },
        outcome: eventRow.attempts === 1 && eventRow.status === 'PENDING'
          ? 'SUCCESS: Transient failure caught. Exponential backoff retry scheduled automatically.'
          : 'FAILURE: Outbox retry failed.',
      });
    }

    return NextResponse.json({ error: 'Unknown scenario. Valid scenarios: claim_race, idempotency_burst, occ_collision, outbox_chaos' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
