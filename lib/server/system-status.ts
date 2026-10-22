import { db } from './db';
import { resolveBlobToken } from './blob';
import { isSmsConfigured } from './sms';
import { isReceiptConfigurationReady, isYooKassaConfigured } from './yookassa';
import { emailConfiguration } from './email-transport';

export type SystemStatus = {
  database: { configured:boolean; reachable:boolean; schemaReady:boolean; missingMigrations:string[] };
  auth: { configured:boolean };
  email: { configured:boolean; sandbox:boolean; productionReady:boolean };
  blob: { configured:boolean };
  yookassa: { configured:boolean; paymentsEnabled:boolean };
  fiscal: { required:boolean; configured:boolean; confirmed:boolean; ready:boolean };
  sms: { configured:boolean };
  siteUrl: { configured:boolean; https:boolean };
  owner: { configured:boolean };
  readyForSales: boolean;
};

export async function getSystemStatus(): Promise<SystemStatus> {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  let databaseReachable = false;
  let databaseSchemaReady = false;
  let missingMigrations: string[] = [];
  if (databaseConfigured) {
    try {
      const rows = await db()`
        SELECT
          1 AS ok,
          to_regclass('public.promo_code_reservations') IS NOT NULL AS promo_reservations,
          to_regclass('public.loyalty_levels') IS NOT NULL AS loyalty_levels,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='refunded_amount') AS refund_columns,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='loyalty_levels' AND column_name='conditions_text') AS flexible_loyalty,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='loyalty_override_level') AS loyalty_override,
          to_regclass('public.ticket_refunds') IS NOT NULL AS ticket_refunds,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='npd_receipt_status') AS npd_receipts,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='loyalty_levels' AND column_name='visual_mode') AS loyalty_visuals,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='media_photos' AND column_name='source_key') AS media_resume,
          to_regclass('public.site_pages') IS NOT NULL AS site_content,
          to_regclass('public.personal_ticket_grants') IS NOT NULL AS personal_tickets,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='deleted_at') AS event_retirement,
          to_regclass('public.admin_refund_requests') IS NOT NULL AS refund_requests,
          to_regclass('public.event_gallery_sources') IS NOT NULL AS external_gallery,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='event_ticket_categories' AND column_name='hot_batch_started_at') AS hot_batches
      `;
      databaseReachable = Number(rows[0]?.ok) === 1;
      const required = [
        ['008', 'promo_reservations'], ['008', 'loyalty_levels'], ['008', 'refund_columns'],
        ['009', 'flexible_loyalty'], ['010', 'loyalty_override'], ['011', 'ticket_refunds'],
        ['011', 'npd_receipts'], ['011', 'loyalty_visuals'], ['012', 'site_content'],
        ['013', 'personal_tickets'], ['014', 'event_retirement'], ['015', 'refund_requests'],
        ['016', 'external_gallery'], ['018', 'hot_batches'],
      ];
      missingMigrations = [...new Set(required.filter(([, field]) => !rows[0]?.[field]).map(([migration]) => migration))];
      databaseSchemaReady = missingMigrations.length === 0 && Boolean(rows[0]?.media_resume);
    } catch { databaseReachable = false; databaseSchemaReady = false; }
  }

  const authConfigured = String(process.env.AUTH_SECRET || '').length >= 32;
  const email = emailConfiguration();
  const emailConfigured = email.productionReady;
  const blobConfigured = Boolean(resolveBlobToken());
  const yookassaConfigured = isYooKassaConfigured();
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === '1';
  const fiscalRequired = process.env.YOOKASSA_RECEIPT_REQUIRED === '1';
  const fiscalConfigured = !fiscalRequired || isReceiptConfigurationReady();
  const fiscalConfirmed = process.env.FISCALIZATION_CONFIRMED === '1';
  const fiscalReady = fiscalConfigured && fiscalConfirmed;
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  const siteUrlConfigured = Boolean(siteUrl);
  const siteUrlHttps = /^https:\/\//i.test(siteUrl);
  const ownerConfigured = Boolean(process.env.AGAYO_OWNER_EMAIL);

  return {
    database:{ configured:databaseConfigured,reachable:databaseReachable,schemaReady:databaseSchemaReady,missingMigrations },
    auth:{ configured:authConfigured },
    email:{ configured:email.configured, sandbox:email.sandbox, productionReady:email.productionReady },
    blob:{ configured:blobConfigured },
    yookassa:{ configured:yookassaConfigured,paymentsEnabled },
    fiscal:{ required:fiscalRequired,configured:fiscalConfigured,confirmed:fiscalConfirmed,ready:fiscalReady },
    sms:{ configured:isSmsConfigured() },
    siteUrl:{ configured:siteUrlConfigured,https:siteUrlHttps },
    owner:{ configured:ownerConfigured },
    readyForSales:databaseReachable && databaseSchemaReady && authConfigured && emailConfigured && blobConfigured && yookassaConfigured && fiscalReady && siteUrlConfigured && siteUrlHttps && ownerConfigured && paymentsEnabled,
  };
}
