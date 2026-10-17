import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WorkItemService } from '@/lib/services/work-item.service';
import { z } from 'zod';

const updateSchema = z.object({
  expected_version: z.number().int().min(1, 'expected_version is required for Optimistic Concurrency Control'),
  title: z.string().min(5).optional(),
  description: z.string().min(10).optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  team_id: z.string().optional(),
  assigned_to: z.string().nullable().optional(),
  resolution_notes: z.string().nullable().optional(),
});

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const db = getDb();
    const item = WorkItemService.getWorkItemById(db, id);

    if (!item) {
      return NextResponse.json({ error: `Work item not found: ${id}` }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const db = getDb();
    const actorId = req.headers.get('x-user-id') || 'user_alex';

    const actor = db.prepare('SELECT * FROM users WHERE id = ?').get(actorId) as any;
    if (!actor) {
      return NextResponse.json({ error: `Actor user not found: ${actorId}` }, { status: 401 });
    }

    const body = await req.json();
    const validated = updateSchema.parse(body);

    const result = WorkItemService.updateWorkItem(
      db,
      id,
      {
        title: validated.title,
        description: validated.description,
        priority: validated.priority,
        team_id: validated.team_id,
        assigned_to: validated.assigned_to,
        resolution_notes: validated.resolution_notes,
      },
      actor,
      validated.expected_version
    );

    if (!result.success) {
      // Return 409 Conflict with full OCC details
      return NextResponse.json(result.conflict, { status: 409 });
    }

    return NextResponse.json({ item: result.item });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
