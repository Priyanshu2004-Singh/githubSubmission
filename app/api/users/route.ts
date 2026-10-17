import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT 
        u.*,
        GROUP_CONCAT(t.name) as teams_list
      FROM users u
      LEFT JOIN user_teams ut ON u.id = ut.user_id
      LEFT JOIN teams t ON ut.team_id = t.id
      GROUP BY u.id
      ORDER BY u.name ASC
    `).all() as any[];

    const formattedUsers = users.map(u => ({
      ...u,
      teams: u.teams_list ? u.teams_list.split(',') : []
    }));

    return NextResponse.json({ users: formattedUsers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
