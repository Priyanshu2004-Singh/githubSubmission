import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WorkItemService } from '@/lib/services/work-item.service';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const db = getDb();
    const actorId = req.headers.get('x-user-id') || 'user_alex';

    const actor = db.prepare('SELECT * FROM users WHERE id = ?').get(actorId) as any;
    if (!actor) {
      return NextResponse.json({ error: `Actor user not found: ${actorId}` }, { status: 401 });
    }

    let expectedVersion: number | undefined;
    try {
      const body = await req.json();
      if (body?.expected_version) {
        expectedVersion = Number(body.expected_version);
      }
    } catch (e) {
      // Body is optional
    }

    const result = WorkItemService.claimWorkItem(db, id, actor, expectedVersion);

    if (!result.success) {
      return NextResponse.json(result.conflict, { status: 409 });
    }

    return NextResponse.json({ item: result.item });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
