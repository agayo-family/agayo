import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!client) client = postgres(process.env.DATABASE_URL, {
    ssl: "require", max: 5, idle_timeout: 20, connect_timeout: 10,
    // Compatible with transaction-mode poolers (e.g. Neon -pooler endpoint).
    prepare: false,
  });
  return client;
}
