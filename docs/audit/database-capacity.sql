-- Read-only capacity inspection. Run on the existing production database.
-- No rows containing emails, phones, payment data or ticket tokens are returned.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

SELECT now() AS measured_at,
       pg_database_size(current_database()) AS database_bytes,
       pg_size_pretty(pg_database_size(current_database())) AS database_size;

SELECT schemaname, relname AS table_name,
       pg_total_relation_size(relid) AS total_bytes,
       pg_table_size(relid) AS table_and_toast_bytes,
       pg_indexes_size(relid) AS index_bytes,
       n_live_tup AS estimated_live_rows,
       n_dead_tup AS estimated_dead_rows,
       last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

SELECT current_setting('max_connections')::int AS server_max_connections,
       COUNT(*)::int AS current_backend_connections,
       COUNT(*) FILTER (WHERE state = 'active')::int AS active_backends,
       COUNT(*) FILTER (WHERE wait_event_type = 'Lock')::int AS backends_waiting_for_lock
FROM pg_stat_activity
WHERE datname = current_database();

COMMIT;

-- Provider storage quota, project-wide usage across databases/branches,
-- monthly compute/egress and pooled client limits are checked in Neon separately.
-- PostgreSQL backend count is not a count of pooler clients or website visitors.
-- Row estimates can be stale; do not divide by zero or treat them as exact counts.
