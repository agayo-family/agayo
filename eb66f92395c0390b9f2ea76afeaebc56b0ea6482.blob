import type postgres from 'postgres';

export async function readProfileTicketPage(sql: postgres.Sql, userId: string, page = 1, activePage = 1) {
  const [history, active, memories, counts] = await Promise.all([
    sql`SELECT public_id,qr_token,status,event_slug,category_name,created_at FROM tickets WHERE user_id=${userId} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`,
    sql`SELECT public_id,qr_token,status,event_slug,category_name,created_at FROM tickets WHERE user_id=${userId} AND status='valid' ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ${(activePage - 1) * 50}`,
    sql`SELECT public_id,qr_token,status,event_slug,category_name,created_at FROM tickets WHERE user_id=${userId} AND status='used' ORDER BY used_at DESC NULLS LAST,created_at DESC,id DESC LIMIT 6`,
    sql`SELECT count(*)::int AS total,count(*) FILTER (WHERE status='used')::int AS visits,count(*) FILTER (WHERE status='valid')::int AS active FROM tickets WHERE user_id=${userId}`,
  ]);
  return { history, active, memories, total: Number(counts[0].total), visits: Number(counts[0].visits), activeTotal: Number(counts[0].active) };
}
