import type postgres from "postgres";

export class ContentConflictError extends Error {
  constructor() { super("Страницу уже изменили в другом окне. Скопируй свои правки и обнови редактор."); }
}

export async function readSitePage(sql: postgres.Sql, key: string) {
  const tables = await sql`SELECT to_regclass('public.site_pages') IS NOT NULL AS ready`;
  if (!tables[0]?.ready) return null;
  const rows = await sql`SELECT content,version,updated_at FROM public.site_pages WHERE page_key=${key}`;
  return rows[0] ?? null;
}

export async function saveSitePage(sql: postgres.Sql, key: string, content: unknown, expectedVersion: number, actorUserId: string) {
  return sql.begin(async (tx) => {
    // First authenticated publication can initialize this additive migration.
    // Public requests and opening the editor never execute DDL. Serialize the
    // first two writers before CREATE TABLE to avoid PostgreSQL catalog races.
    await tx`SELECT pg_advisory_xact_lock(714206012)`;
    await tx`
      CREATE TABLE IF NOT EXISTS public.site_pages (
        page_key text PRIMARY KEY,
        content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
        version integer NOT NULL DEFAULT 1 CHECK (version > 0),
        updated_by uuid REFERENCES public.users(id),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    const rows = expectedVersion === 0
      ? await tx`INSERT INTO public.site_pages(page_key,content,updated_by)
          VALUES(${key},${JSON.stringify(content)}::jsonb,${actorUserId})
          ON CONFLICT (page_key) DO NOTHING RETURNING version,updated_at`
      : await tx`UPDATE public.site_pages SET content=${JSON.stringify(content)}::jsonb,
          version=version+1,updated_by=${actorUserId},updated_at=now()
          WHERE page_key=${key} AND version=${expectedVersion} RETURNING version,updated_at`;
    if (!rows[0]) throw new ContentConflictError();
    // The edit and its audit entry commit together. Do not copy portrait URLs
    // or full page text into the audit log.
    await tx`INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,details)
      VALUES(${actorUserId},'site.page.publish','site_page',${key},${JSON.stringify({ version: rows[0].version })}::jsonb)`;
    return { version: Number(rows[0].version), updatedAt: rows[0].updated_at };
  });
}
