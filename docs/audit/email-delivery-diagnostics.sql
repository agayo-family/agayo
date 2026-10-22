-- Read-only incident triage. No emails, QR tokens, sessions or keys are selected.
BEGIN READ ONLY;

SELECT status, count(*) AS orders, coalesce(sum(total),0) AS total_rub
FROM orders GROUP BY status ORDER BY status;

SELECT o.status AS order_status, t.status AS ticket_status,
       coalesce(d.status,'not_attempted') AS delivery_status, count(*) AS tickets
FROM tickets t JOIN orders o ON o.id=t.order_id
LEFT JOIN ticket_deliveries d ON d.ticket_id=t.id AND d.channel='email'
GROUP BY o.status,t.status,d.status ORDER BY o.status,t.status,d.status;

SELECT o.public_id AS order_id,t.public_id AS ticket_id,t.event_slug,
       coalesce(d.status,'not_attempted') AS delivery_status,coalesce(d.attempts,0) AS attempts,
       CASE
         WHEN d.last_error ILIKE '%only send testing%' OR d.last_error LIKE '%[email:test_domain%' THEN 'test_domain'
         WHEN d.last_error ILIKE '%not verified%' OR d.last_error LIKE '%[email:unverified_domain%' THEN 'unverified_domain'
         WHEN d.last_error LIKE '%daily_quota%' THEN 'daily_quota'
         WHEN d.last_error LIKE '%monthly_quota%' THEN 'monthly_quota'
         WHEN d.last_error LIKE '%429%' OR d.last_error LIKE '%rate_limit%' THEN 'rate_limit'
         WHEN d.last_error LIKE '%401%' OR d.last_error LIKE '%403%' THEN 'authentication_or_permissions'
         WHEN d.last_error LIKE '%409%' OR d.last_error LIKE '%idempoten%' THEN 'idempotency_reconciliation'
         WHEN d.last_error IS NULL THEN 'no_recorded_error'
         ELSE 'inspect_provider_privately'
       END AS error_class,
       d.created_at AS delivery_created_at
FROM tickets t JOIN orders o ON o.id=t.order_id
LEFT JOIN ticket_deliveries d ON d.ticket_id=t.id AND d.channel='email'
WHERE o.status='paid' AND t.status IN ('valid','used') AND (d.id IS NULL OR d.status<>'sent')
ORDER BY o.paid_at,t.created_at LIMIT 100;

SELECT o.public_id,o.event_slug,o.paid_at
FROM orders o LEFT JOIN tickets t ON t.order_id=o.id
WHERE o.status='paid' GROUP BY o.id HAVING count(t.id)=0 ORDER BY o.paid_at;

SELECT public_id,event_slug,created_at,
       yookassa_payment_id IS NOT NULL AS has_payment_id
FROM orders WHERE status='pending' AND created_at<now()-interval '30 minutes'
ORDER BY created_at LIMIT 100;

ROLLBACK;
