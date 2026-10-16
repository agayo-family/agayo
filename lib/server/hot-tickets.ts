import type postgres from 'postgres';

const HOT_SCHEMA_LOCK = 714206018;

/** A rolling promotion batch is separate from the actual category inventory. */
export function hotBatchRemaining(enabled: boolean, paidUnits: unknown, actualRemaining: number | null | undefined) {
  if (!enabled || (actualRemaining != null && (!Number.isFinite(actualRemaining) || actualRemaining <= 0))) return undefined;
  const sold = Number(paidUnits ?? 0);
  if (!Number.isFinite(sold) || sold < 0) return undefined;
  const batch = 5 - (Math.floor(sold) % 5);
  return actualRemaining == null ? batch : Math.min(batch, Math.floor(actualRemaining));
}

/** Only authenticated event writers call this, before their business transaction. */
export async function ensureHotTicketSchema(sql: postgres.Sql) {
  // Commit the schema lock before taking any event/category business locks.
  // Otherwise ALTER(category) followed by FOR UPDATE(event) in one transaction
  // can deadlock with a checkout holding event and waiting for category.
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(${HOT_SCHEMA_LOCK})`;
    const [schema] = await tx`SELECT EXISTS (SELECT 1 FROM pg_attribute
      WHERE attrelid='public.event_ticket_categories'::regclass AND attname='hot_batch_started_at' AND NOT attisdropped) AS ready`;
    if (!schema?.ready) await tx`ALTER TABLE public.event_ticket_categories ADD COLUMN IF NOT EXISTS hot_batch_started_at timestamptz`;
  });
}
