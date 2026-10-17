import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const teams = db.prepare(`
      SELECT 
        t.*,
        COUNT(w.id) as active_items_count
      FROM teams t
      LEFT JOIN work_items w ON t.id = w.team_id AND w.status NOT IN ('RESOLVED', 'CLOSED')
      GROUP BY t.id
      ORDER BY t.name ASC
    `).all();

    return NextResponse.json({ teams });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
