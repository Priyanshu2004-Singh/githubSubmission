import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WorkItemService } from '@/lib/services/work-item.service';
import { WorkItemStatus } from '@/lib/types';
import { z } from 'zod';

const transitionSchema = z.object({
  target_status: z.enum(['TRIAGE', 'INVESTIGATING', 'AWAITING_APPROVAL', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED']),
  expected_version: z.number().int().min(1),
  reason: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const db = getDb();
    const actorId = req.headers.get('x-user-id') || 'user_alex';

    const actor = db.prepare('SELECT * FROM users WHERE id = ?').get(actorId) as any;
    if (!actor) {
      return NextResponse.json({ error: `Actor user not found: ${actorId}` }, { status: 401 });
    }

    const body = await req.json();
    const validated = transitionSchema.parse(body);

    const result = WorkItemService.transitionStatus(
      db,
      id,
      validated.target_status as WorkItemStatus,
      validated.reason,
      actor,
      validated.expected_version
    );

    if (!result.success) {
      if (result.conflict) {
        return NextResponse.json(result.conflict, { status: 409 });
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ item: result.item });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
