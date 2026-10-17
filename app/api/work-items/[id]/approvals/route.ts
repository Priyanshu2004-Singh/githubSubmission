import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WorkItemService } from '@/lib/services/work-item.service';
import { Role } from '@/lib/types';
import { z } from 'zod';

const approvalRequestSchema = z.object({
  action: z.literal('REQUEST'),
  approver_role_required: z.enum(['ADMIN', 'MANAGER', 'LEAD']),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

const approvalDecideSchema = z.object({
  action: z.literal('DECIDE'),
  approval_id: z.string().min(1),
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
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

    if (body?.action === 'REQUEST') {
      const validated = approvalRequestSchema.parse(body);
      const approval = WorkItemService.requestApproval(
        db,
        id,
        validated.approver_role_required as Role,
        validated.reason,
        actor
      );
      return NextResponse.json({ approval }, { status: 201 });
    } else if (body?.action === 'DECIDE') {
      const validated = approvalDecideSchema.parse(body);
      const result = WorkItemService.decideApproval(
        db,
        validated.approval_id,
        validated.decision,
        validated.reason,
        actor
      );

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 403 });
      }

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: "Invalid action. Must be 'REQUEST' or 'DECIDE'" }, { status: 400 });
    }
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
