import { db } from './db';
import { resolveBlobToken } from './blob';
import { isSmsConfigured } from './sms';
import { isReceiptConfigurationReady, isYooKassaConfigured } from './yookassa';

export type SystemStatus = {
  database: { configured:boolean; reachable:boolean; schemaReady:boolean };
  auth: { configured:boolean };
  email: { configured:boolean };
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
  if (databaseConfigured) {
    try {
      const rows = await db()`
        SELECT
          1 AS ok,
          to_regclass('public.promo_code_reservations') IS NOT NULL AS promo_reservations,
          to_regclass('public.loyalty_levels') IS NOT NULL AS loyalty_levels,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='refunded_amount') AS refund_columns
      `;
      databaseReachable = Number(rows[0]?.ok) === 1;
      databaseSchemaReady = Boolean(rows[0]?.promo_reservations && rows[0]?.loyalty_levels && rows[0]?.refund_columns);
    } catch { databaseReachable = false; databaseSchemaReady = false; }
  }

  const authConfigured = String(process.env.AUTH_SECRET || '').length >= 32;
  const emailConfigured = Boolean(process.env.EMAIL_PROVIDER_API_KEY && process.env.EMAIL_FROM);
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
    database:{ configured:databaseConfigured,reachable:databaseReachable,schemaReady:databaseSchemaReady },
    auth:{ configured:authConfigured },
    email:{ configured:emailConfigured },
    blob:{ configured:blobConfigured },
    yookassa:{ configured:yookassaConfigured,paymentsEnabled },
    fiscal:{ required:fiscalRequired,configured:fiscalConfigured,confirmed:fiscalConfirmed,ready:fiscalReady },
    sms:{ configured:isSmsConfigured() },
    siteUrl:{ configured:siteUrlConfigured,https:siteUrlHttps },
    owner:{ configured:ownerConfigured },
    readyForSales:databaseReachable && databaseSchemaReady && authConfigured && emailConfigured && blobConfigured && yookassaConfigured && fiscalReady && siteUrlConfigured && siteUrlHttps && ownerConfigured && paymentsEnabled,
  };
}
