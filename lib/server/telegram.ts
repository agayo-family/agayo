import { db } from "./db";
import { hash, randomToken, safeEqual } from "./security";

type Sql = any;
type TelegramConfig = { token: string; username: string; webhookSecret: string };
export class TelegramError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

export function telegramConfig(): TelegramConfig | null {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const username = String(process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
  const webhookSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (!/^[0-9]+:[A-Za-z0-9_-]{20,}$/.test(token) || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) || !/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret)) return null;
  return { token, username, webhookSecret };
}

function missingSchema(error: unknown) { return ["42P01", "42703"].includes(String((error as { code?: unknown })?.code)); }
export function acceptsTelegramWebhook(secret: string | null) {
  const config = telegramConfig();
  return Boolean(config && secret && safeEqual(config.webhookSecret, secret));
}

export async function telegramProfile(userId: string, sql: Sql = db()) {
  if (!telegramConfig()) return { available: false, linked: false, preference: "email" as const };
  try {
    const [user] = await sql`SELECT telegram_chat_id,ticket_delivery_preference FROM users WHERE id=${userId} LIMIT 1`;
    if (!user) throw new TelegramError("Профиль не найден", 404);
    // Reading the optional table also verifies the migration is installed before
    // offering a link which could not be consumed by the bot.
    await sql`SELECT token_hash FROM telegram_link_tokens WHERE user_id=${userId} LIMIT 1`;
    return { available: true, linked: Boolean(user.telegram_chat_id), preference: user.telegram_chat_id && user.ticket_delivery_preference === "telegram" ? "telegram" as const : "email" as const };
  } catch (error) {
    if (missingSchema(error)) return { available: false, linked: false, preference: "email" as const };
    throw error;
  }
}

export async function createTelegramLink(userId: string, sql: Sql = db()) {
  const config = telegramConfig();
  if (!config) throw new TelegramError("Telegram ещё не подключён организатором. Билеты доставляются по email", 503);
  const token = `agayo_${randomToken(32)}`;
  await sql.begin(async (tx: Sql) => {
    const [user] = await tx`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
    if (!user) throw new TelegramError("Профиль не найден", 404);
    const [recent] = await tx`SELECT created_at > now()-interval '30 seconds' AS too_recent FROM telegram_link_tokens WHERE user_id=${userId} ORDER BY created_at DESC LIMIT 1`;
    if (recent?.too_recent) throw new TelegramError("Подожди 30 секунд перед созданием новой ссылки", 429);
    await tx`DELETE FROM telegram_link_tokens WHERE user_id=${userId}`;
    await tx`INSERT INTO telegram_link_tokens(token_hash,user_id,expires_at) VALUES(${hash(token)},${userId},now()+interval '10 minutes')`;
  });
  return { url: `https://t.me/${config.username}?start=${token}`, expiresIn: 600 };
}

export function telegramStart(update: unknown): { token: string; chatId: string } | null {
  const message = (update as any)?.message;
  const chat = message?.chat, from = message?.from;
  if (chat?.type !== "private" || from?.is_bot || !Number.isSafeInteger(chat?.id) || chat.id <= 0 || chat.id !== from?.id) return null;
  const token = /^\/start(?:@[A-Za-z0-9_]+)?\s+(agayo_[A-Za-z0-9_-]{43})$/.exec(String(message?.text || "").trim())?.[1];
  return token ? { token, chatId: String(chat.id) } : null;
}

export async function consumeTelegramLink(token: string, chatId: string, sql: Sql = db()) {
  if (!/^agayo_[A-Za-z0-9_-]{43}$/.test(token) || !/^[1-9][0-9]{0,15}$/.test(chatId)) return false;
  try {
    return await sql.begin(async (tx: Sql) => {
      const [candidate] = await tx`SELECT user_id FROM telegram_link_tokens WHERE token_hash=${hash(token)}`;
      if (!candidate) return false;
      // All link mutations lock the user before tokens (including regeneration
      // and unlink), avoiding an inverted lock order during a simultaneous click.
      const [user] = await tx`SELECT id FROM users WHERE id=${candidate.user_id} FOR UPDATE`;
      if (!user) return false;
      const [link] = await tx`SELECT user_id,consumed_at,expires_at > now() AS active FROM telegram_link_tokens WHERE token_hash=${hash(token)} FOR UPDATE`;
      if (!link || link.user_id !== candidate.user_id || link.consumed_at || !link.active) return false;
      const [other] = await tx`SELECT id FROM users WHERE telegram_chat_id=${chatId} AND id<>${link.user_id} LIMIT 1`;
      if (other) return false;
      await tx`UPDATE users SET telegram_chat_id=${chatId},telegram_linked_at=now(),ticket_delivery_preference='telegram',updated_at=now() WHERE id=${link.user_id}`;
      await tx`UPDATE telegram_link_tokens SET consumed_at=now() WHERE token_hash=${hash(token)}`;
      return true;
    });
  } catch (error) {
    // The unique chat constraint also covers simultaneous links from two users.
    if ((error as { code?: unknown })?.code === "23505") return false;
    throw error;
  }
}

export async function setTelegramPreference(userId: string, preference: "email" | "telegram", sql: Sql = db()) {
  const rows = await sql`UPDATE users SET ticket_delivery_preference=${preference},updated_at=now() WHERE id=${userId} AND (${preference}='email' OR telegram_chat_id IS NOT NULL) RETURNING id`;
  if (!rows.length) throw new TelegramError("Сначала привяжи Telegram", 409);
}

export async function unlinkTelegram(userId: string, sql: Sql = db()) {
  await sql.begin(async (tx: Sql) => {
    await tx`UPDATE users SET telegram_chat_id=NULL,telegram_linked_at=NULL,ticket_delivery_preference='email',updated_at=now() WHERE id=${userId}`;
    await tx`DELETE FROM telegram_link_tokens WHERE user_id=${userId}`;
  });
}

async function telegramRequest(method: "sendDocument" | "sendMessage", body: FormData | Record<string, unknown>, config: TelegramConfig, fetcher: typeof fetch) {
  try {
    const multipart = body instanceof FormData;
    const response = await fetcher(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: "POST", signal: AbortSignal.timeout(8000),
      ...(multipart ? {} : { headers: { "Content-Type": "application/json" } }),
      body: multipart ? body : JSON.stringify(body),
    });
    let data: any;
    try { data = await response.json(); } catch { return { state: "uncertain" as const }; }
    if (response.ok && data?.ok === true && Number.isSafeInteger(data.result?.message_id) && data.result.message_id > 0) return { state: "sent" as const, messageId: data.result.message_id as number };
    if (response.status < 500 && data?.ok === false && Number.isInteger(data.error_code)) return { state: "failed" as const, code: `telegram_${data.error_code}` };
    return { state: "uncertain" as const };
  } catch {
    // Fetch errors can include the bot URL. Never persist or log the raw error.
    return { state: "uncertain" as const };
  }
}

export async function confirmTelegramLink(chatId: string, fetcher: typeof fetch = fetch) {
  const config = telegramConfig();
  if (!config) return;
  await telegramRequest("sendMessage", { chat_id: chatId, text: "Telegram подключён к AGAYO ID. Новые билеты будут приходить сюда после оплаты. Способ доставки и отвязка доступны в профиле сайта. При явном отказе бота попробуем email. Все билеты также остаются в профиле AGAYO." }, config, fetcher);
}

export type TelegramTicket = { ticketId: string; ticketUrl: string; caption: string; qrBuffer: Buffer; deliveryKey?: string };

export async function deliverTicketTelegram(to: string, input: TelegramTicket, options: { sql?: Sql; fetcher?: typeof fetch } = {}): Promise<{ handled: boolean }> {
  const config = telegramConfig();
  if (!config || (!process.env.DATABASE_URL && !options.sql)) return { handled: false };
  const sql = options.sql ?? db();
  const deliveryKey = input.deliveryKey || `AGAYO-TICKET-${input.ticketId}`;
  let ticketUrl: URL;
  try { ticketUrl = new URL(input.ticketUrl); } catch { throw new TelegramError("Некорректная ссылка билета"); }
  if (ticketUrl.protocol !== "https:" || ticketUrl.username || ticketUrl.password) throw new TelegramError("Некорректная ссылка билета");
  let claim: { state: "send"; chatId: string } | { state: "sent" } | { state: "fallback" } | { state: "pending" };
  try {
    claim = await sql.begin(async (tx: Sql) => {
      // Route only the ticket's real owner. An email supplied for an unrelated
      // ticket can never redirect it to another account's Telegram chat.
      const [target] = await tx`SELECT u.id,t.id AS ticket_id,u.telegram_chat_id,u.ticket_delivery_preference FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.public_id=${input.ticketId} AND lower(u.email)=${to.trim().toLowerCase()} FOR UPDATE OF u`;
      if (!target?.telegram_chat_id || target.ticket_delivery_preference !== "telegram") return { state: "fallback" as const };
      const [existing] = await tx`SELECT status,ticket_id,claimed_at < now()-interval '2 minutes' AS stale FROM telegram_ticket_deliveries WHERE delivery_key=${deliveryKey} FOR UPDATE`;
      if (existing && String(existing.ticket_id) !== String(target.ticket_id)) throw new TelegramError("Конфликт ключа доставки Telegram", 409);
      if (existing?.status === "sent") return { state: "sent" as const };
      if (existing?.status === "failed") return { state: "fallback" as const };
      if (existing) {
        if (existing.status === "sending" && existing.stale) await tx`UPDATE telegram_ticket_deliveries SET status='uncertain',error_code='response_unknown' WHERE delivery_key=${deliveryKey} AND status='sending'`;
        // Throw after COMMIT, so a stale claim is durably marked uncertain.
        return { state: "pending" as const };
      }
      await tx`INSERT INTO telegram_ticket_deliveries(delivery_key,ticket_id,destination_chat_id,status) VALUES(${deliveryKey},${target.ticket_id},${String(target.telegram_chat_id)},'sending')`;
      return { state: "send" as const, chatId: String(target.telegram_chat_id) };
    });
  } catch (error) {
    if (missingSchema(error)) return { handled: false };
    throw new TelegramError("Не удалось проверить доставку Telegram. Повтори позже");
  }
  if (claim.state === "pending") throw new TelegramError("Доставка Telegram ожидает подтверждения. Автоматическая повторная отправка остановлена", 409);
  if (claim.state === "sent") return { handled: true };
  if (claim.state === "fallback") return { handled: false };
  const form = new FormData();
  form.set("chat_id", claim.chatId);
  form.set("document", new Blob([new Uint8Array(input.qrBuffer)], { type: "image/png" }), `AGAYO-${input.ticketId.replace(/[^A-Za-z0-9_-]/g, "")}-QR.png`);
  form.set("caption", Array.from(input.caption).slice(0, 1000).join(""));
  form.set("reply_markup", JSON.stringify({ inline_keyboard: [[{ text: "Открыть актуальный билет ↗", url: ticketUrl.href }]] }));
  const result = await telegramRequest("sendDocument", form, config, options.fetcher ?? fetch);
  if (result.state === "sent") {
    await sql`UPDATE telegram_ticket_deliveries SET status='sent',sent_at=now(),telegram_message_id=${result.messageId},error_code=NULL WHERE delivery_key=${deliveryKey} AND status IN ('sending','uncertain')`;
    return { handled: true };
  }
  if (result.state === "failed") {
    await sql`UPDATE telegram_ticket_deliveries SET status='failed',error_code=${result.code} WHERE delivery_key=${deliveryKey} AND status='sending'`;
    return { handled: false };
  }
  await sql`UPDATE telegram_ticket_deliveries SET status='uncertain',error_code='response_unknown' WHERE delivery_key=${deliveryKey} AND status='sending'`;
  throw new TelegramError("Telegram не подтвердил доставку. Повторная отправка остановлена до проверки", 409);
}
