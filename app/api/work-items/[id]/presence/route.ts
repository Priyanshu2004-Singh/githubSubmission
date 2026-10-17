import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { eventBus } from '@/lib/services/event-bus';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const db = getDb();
    const actorId = req.headers.get('x-user-id') || 'user_alex';

    const actor = db.prepare('SELECT id, name, avatar_url FROM users WHERE id = ?').get(actorId) as any;
    if (!actor) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let isEditing = false;
    try {
      const body = await req.json();
      isEditing = Boolean(body?.is_editing);
    } catch (e) {
      // Body optional
    }

    eventBus.setPresence(id, actor, isEditing);
    const active = eventBus.getActivePresence(id);

    return NextResponse.json({ active_presence: active });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const actorId = req.headers.get('x-user-id') || 'user_alex';

    eventBus.removePresence(id, actorId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
