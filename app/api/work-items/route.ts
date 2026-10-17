import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WorkItemService } from '@/lib/services/work-item.service';
import { IdempotencyService } from '@/lib/services/idempotency.service';
import { WorkItemCategory, WorkItemPriority, WorkItemStatus } from '@/lib/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  category: z.enum(['INCIDENT', 'PAYMENT_INVESTIGATION', 'COMPLIANCE_REVIEW', 'CUSTOMER_ESCALATION', 'OPERATIONAL_APPROVAL']),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  teamId: z.string().min(1, 'Team ID is required'),
  assignedTo: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const url = new URL(req.url);

    const teamId = url.searchParams.get('teamId') || undefined;
    const status = (url.searchParams.get('status') as WorkItemStatus) || undefined;
    const priority = (url.searchParams.get('priority') as WorkItemPriority) || undefined;
    const assignedTo = url.searchParams.get('assignedTo') || undefined;
    const slaStatus = url.searchParams.get('slaStatus') || undefined;
    const category = (url.searchParams.get('category') as WorkItemCategory) || undefined;
    const search = url.searchParams.get('search') || undefined;
    const cursor = url.searchParams.get('cursor') || undefined;
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 25;

    const result = WorkItemService.listWorkItems(db, {
      teamId,
      status,
      priority,
      assignedTo,
      slaStatus,
      category,
      search,
      cursor,
      limit,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const idempotencyKey = req.headers.get('x-idempotency-key') || undefined;
    const actorId = req.headers.get('x-user-id') || 'user_alex';

    const actor = db.prepare('SELECT * FROM users WHERE id = ?').get(actorId) as any;
    if (!actor) {
      return NextResponse.json({ error: `Actor user not found: ${actorId}` }, { status: 401 });
    }

    const body = await req.json();
    const validated = createSchema.parse(body);

    // Execute with Idempotency Protection
    const result = await IdempotencyService.executeWithIdempotency(
      db,
      idempotencyKey,
      '/api/work-items',
      validated,
      async () => {
        const item = WorkItemService.createWorkItem(db, {
          title: validated.title,
          description: validated.description,
          category: validated.category,
          priority: validated.priority,
          teamId: validated.teamId,
          assignedTo: validated.assignedTo,
          actor,
        });

        return { statusCode: 201, data: { item } };
      }
    );

    const headers: Record<string, string> = {};
    if (result.cached) {
      headers['X-Cache-Lookup'] = 'HIT-IDEMPOTENT';
    }

    return NextResponse.json(result.data, { status: result.statusCode, headers });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 });
    }
    if (err.message && err.message.startsWith('CONCURRENT_DUPLICATE_REQUEST')) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
