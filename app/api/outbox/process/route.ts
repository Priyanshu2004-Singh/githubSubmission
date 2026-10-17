import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { OutboxService } from '@/lib/services/outbox.worker';

export async function GET() {
  try {
    const db = getDb();
    const stats = db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) as processing_count,
        SUM(CASE WHEN status = 'PROCESSED' THEN 1 ELSE 0 END) as processed_count,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_dlq_count
      FROM outbox_events
    `).get();

    const recentEvents = db.prepare(`
      SELECT * FROM outbox_events ORDER BY created_at DESC LIMIT 10
    `).all();

    return NextResponse.json({ stats, recent_events: recentEvents });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const db = getDb();
    const outboxResult = OutboxService.processPendingEvents(db, 20);
    const slaUpdated = OutboxService.checkSLABreaches(db);

    return NextResponse.json({
      outbox_processed: outboxResult.processed,
      outbox_failed: outboxResult.failed,
      sla_items_updated: slaUpdated,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
