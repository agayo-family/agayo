import { randomUUID } from 'node:crypto';

export function emailConfiguration() {
  const key = String(process.env.EMAIL_PROVIDER_API_KEY || '').trim();
  const from = String(process.env.EMAIL_FROM || '').trim();
  const address = (from.match(/<([^<>]+)>$/)?.[1] || from).trim();
  const validSender = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address);
  const senderDomain = validSender ? address.split('@')[1].toLowerCase() : null;
  const sandbox = senderDomain === 'resend.dev';
  return { key, from, configured: Boolean(key && validSender), senderDomain, sandbox,
    productionReady: Boolean(key && validSender && !sandbox) };
}

const hints: Record<string, string> = {
  configuration: 'Проверь EMAIL_PROVIDER_API_KEY и EMAIL_FROM в Production и выполни redeploy.',
  test_domain: 'Отправитель resend.dev работает только для тестов. Подтверди домен agayo.ru в Resend, укажи EMAIL_FROM на этом домене и выполни redeploy.',
  unverified_domain: 'Домен EMAIL_FROM не подтверждён в Resend. Проверь DNS, статус домена и аккаунт, которому принадлежит ключ.',
  authentication: 'Resend отклонил ключ. Проверь production-ключ и его право отправлять с выбранного домена.',
  daily_quota_exceeded: 'Исчерпан дневной лимит Resend. Дождись сброса лимита или измени тариф, затем повтори доставку.',
  monthly_quota_exceeded: 'Исчерпан месячный лимит Resend. Проверь лимит аккаунта перед повтором доставки.',
  rate_limit_exceeded: 'Resend ограничил частоту запросов. Доставка будет повторена с тем же ключом.',
  invalid_idempotent_request: 'Resend уже видел этот ключ с другим содержимым. Нужна сверка в Resend; новый ключ автоматически не создаётся.',
  idempotency_expired: 'У прежней попытки неизвестен результат, а срок защиты Resend от дубликатов истёк. Сначала сверь письмо в Resend; автоматическая отправка остановлена.',
  concurrent_idempotent_requests: 'Предыдущая отправка ещё обрабатывается Resend. Повтори проверку позже.',
  invalid_attachment: 'Resend отклонил вложение. Проверь формат и размер файла билета.',
  invalid_response: 'Resend не вернул идентификатор письма. Результат не подтверждён; повтор использует прежний ключ.',
  network: 'Не получен ответ Resend. Повтор использует прежний ключ, чтобы не создавать дубликат.',
  ambiguous: 'Одна из попыток могла быть принята Resend без ответа. Повтор использует прежний ключ; после срока идемпотентности нужна ручная сверка.',
  provider: 'Почтовый провайдер не подтвердил отправку. Проверь журнал Resend и настройки production.',
};

export class EmailDeliveryError extends Error {
  uncertain = false;
  constructor(public code: string, public status: number | null = null, public retryable = false) {
    super(`[email:${code}${status ? `:${status}` : ''}] ${hints[code] || hints.provider}`);
    this.name = 'EmailDeliveryError';
  }
}

// Persist classifications, never API response bodies (which may contain an
// account email), API keys, ticket URLs or network errors with credentials.
export function emailErrorMessage(error: unknown) {
  if (error instanceof EmailDeliveryError) return `${error.uncertain ? '[email:ambiguous] ' : ''}${error.message}`;
  return '[email:delivery] Отправка билета не подтверждена. Проверь журнал провайдера и повтори доставку.';
}

export function explainStoredEmailError(value: unknown) {
  const message = String(value || '');
  const known = /\[email:([a-z_]+)(?::\d+)?\]/.exec(message)?.[1];
  const code = known && hints[known] ? known
    : /resend\.dev|only send testing/i.test(message) ? 'test_domain'
    : /not verified/i.test(message) ? 'unverified_domain'
    : /daily.*quota|daily_quota/i.test(message) ? 'daily_quota_exceeded'
    : /monthly.*quota|monthly_quota/i.test(message) ? 'monthly_quota_exceeded'
    : /429|rate.limit/i.test(message) ? 'rate_limit_exceeded'
    : /401|403|api.key/i.test(message) ? 'authentication'
    : /409|idempoten/i.test(message) ? 'invalid_idempotent_request'
    : /not configured/i.test(message) ? 'configuration' : 'provider';
  return { code, hint: hints[code] };
}

export function assertEmailRetrySafe(delivery: { status: string; created_at: unknown; last_error?: unknown }) {
  if (delivery.status === 'sent') return;
  const message = String(delivery.last_error || '');
  if (/\[email:(?:idempotency_expired|invalid_idempotent_request)/.test(message)) {
    throw new EmailDeliveryError(message.includes('invalid_idempotent_request') ? 'invalid_idempotent_request' : 'idempotency_expired');
  }
  const created = new Date(String(delivery.created_at)).getTime();
  // Resend retains idempotency for 24h. Stop conservatively before that window
  // when an earlier request might have been accepted but its result was lost.
  if (!Number.isFinite(created) || Date.now() - created < 23 * 3600000) return;
  const confirmedRejection = !message.includes('[email:ambiguous]') && (/\[email:(?:configuration|test_domain|unverified_domain|authentication|daily_quota_exceeded|monthly_quota_exceeded|rate_limit_exceeded|invalid_attachment)(?::|\])/.test(message)
    || /Email provider error: (?:400|401|403|422|429)\b/.test(message));
  if (!confirmedRejection) throw new EmailDeliveryError('idempotency_expired');
}

function responseError(status: number, data: any) {
  const name = String(data?.name || '');
  const message = String(data?.message || '');
  const code = /only send testing/i.test(message) ? 'test_domain'
    : /domain.*not verified/i.test(message) ? 'unverified_domain'
    : Object.hasOwn(hints, name) ? name
    : /daily.*quota/i.test(message) ? 'daily_quota_exceeded'
    : /monthly.*quota/i.test(message) ? 'monthly_quota_exceeded'
    : status === 401 || status === 403 ? 'authentication'
    : status === 429 ? 'rate_limit_exceeded' : 'provider';
  return new EmailDeliveryError(code, status,
    status >= 500 || code === 'rate_limit_exceeded' || code === 'concurrent_idempotent_requests');
}

export async function sendProviderEmail(payload: Record<string, unknown>, idempotencyKey?: string, options: {
  fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void>;
} = {}) {
  const config = emailConfiguration();
  if (!config.configured) throw new EmailDeliveryError('configuration');
  // One immutable body and key across retries, including a lost HTTP response.
  const body = JSON.stringify({ from: config.from, ...payload });
  const key = idempotencyKey || `AGAYO-MAIL-${randomUUID()}`;
  const fetcher = options.fetcher || fetch;
  const sleep = options.sleep || ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let uncertain = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let error: EmailDeliveryError;
    let retryAfter = 1200;
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body,
      });
      let data: any;
      try { data = await response.json(); } catch { data = null; }
      if (response.ok) {
        if (typeof data?.id === 'string' && data.id.trim()) return { channel: 'email' as const, providerId: data.id as string };
        throw new EmailDeliveryError('invalid_response', response.status, true);
      }
      error = responseError(response.status, data);
      const raw = response.headers.get('retry-after');
      if (raw) retryAfter = Math.max(0, Number.isFinite(Number(raw)) ? Number(raw) * 1000 : Date.parse(raw) - Date.now());
    } catch (cause) {
      error = cause instanceof EmailDeliveryError ? cause : new EmailDeliveryError('network', null, true);
    }
    uncertain ||= error.code === 'network' || error.code === 'invalid_response' || Number(error.status) >= 500;
    error.uncertain = uncertain;
    // Long quota waits belong to the durable delivery retry, not a Function.
    if (!error.retryable || attempt === 1 || !Number.isFinite(retryAfter) || retryAfter > 2500) throw error;
    await sleep(retryAfter);
  }
  throw new EmailDeliveryError('provider');
}
