"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type OrderStatus = {
  orderId: string;
  status: string;
  eventSlug: string;
  ticketCount: number;
  delivery: { total: number; sent: number; failed: number };
};

export default function CheckoutStatus({ orderPublicId }: { orderPublicId?: string }) {
  const [data, setData] = useState<OrderStatus | null>(null);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    if (!orderPublicId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function check() {
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderPublicId!)}/status`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Не удалось проверить заказ");
        if (stopped) return;
        setData(result);
        setError("");
        setChecks((value) => value + 1);

        if (result.status === "pending") {
          timer = setTimeout(check, 2200);
        }
      } catch (e) {
        if (stopped) return;
        setError(e instanceof Error ? e.message : "Не удалось проверить заказ");
        setChecks((value) => value + 1);
        timer = setTimeout(check, 3500);
      }
    }

    void check();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderPublicId]);

  const view = useMemo(() => {
    const status = data?.status || "pending";
    if (status === "paid") {
      const mailPending = data && data.ticketCount > 0 && data.delivery.sent < data.ticketCount;
      return {
        mark: "✓",
        title: "ОПЛАТА\nПРОШЛА",
        text: mailPending
          ? "Билет уже выпущен и сохранён в AGAYO ID. Письмо ещё отправляется — сам билет от этого не потеряется."
          : "Билет выпущен, сохранён в AGAYO ID и отправлен на почту из заказа.",
      };
    }
    if (status === "cancelled" || status === "expired") {
      return {
        mark: "×",
        title: "ОПЛАТА\nНЕ ПРОШЛА",
        text: "Заказ закрыт, а зарезервированные билеты снова доступны. Можно вернуться к мероприятию и попробовать ещё раз.",
      };
    }
    if (status === "refunded") {
      return {
        mark: "↩",
        title: "ВОЗВРАТ\nОФОРМЛЕН",
        text: "Этот заказ отмечен как возвращённый. Если деньги ещё не появились на счёте, срок зачисления зависит от банка.",
      };
    }
    return {
      mark: "…",
      title: "ПЛАТЁЖ\nПРОВЕРЯЕТСЯ",
      text: "AGAYO сверяет статус напрямую с YooKassa. После подтверждения билет выпустится автоматически.",
    };
  }, [data]);

  const eventHref = data?.eventSlug ? `/events/${encodeURIComponent(data.eventSlug)}` : "/events";
  const retryHref = data?.eventSlug ? `/events/${encodeURIComponent(data.eventSlug)}/checkout` : "/events";
  const isClosed = data?.status === "cancelled" || data?.status === "expired";

  return (
    <section className="checkout-success-shell">
      <div className="section-label">ОПЛАТА / AGAYO</div>
      <span className="checkout-success-mark">{view.mark}</span>
      <h1>{view.title.split("\n").map((line, index) => <span key={line}>{index ? <br /> : null}{line}</span>)}</h1>
      <p>{view.text}</p>

      {orderPublicId ? <div className="checkout-success-order"><span>ЗАКАЗ</span><strong>{orderPublicId}</strong></div> : null}
      {error ? <p className="checkout-error" role="alert">{error}</p> : null}
      {!data && !error && checks === 0 ? <small>Получаем актуальный статус…</small> : null}

      <div className="checkout-success-actions">
        {isClosed ? (
          <Link href={retryHref} className="button-link">Попробовать снова <b>↗</b></Link>
        ) : (
          <Link href="/profile" className="button-link">Открыть AGAYO ID <b>↗</b></Link>
        )}
        <Link href={eventHref} className="text-link">К мероприятию</Link>
      </div>
    </section>
  );
}
