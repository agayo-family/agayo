"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type OrderStatus = {
  orderId: string;
  status: string;
  eventSlug: string;
  paidAt?: string | null;
  refundedAt?: string | null;
  refundedAmount?: number;
  ticketCount: number;
  delivery: { total: number; sent: number; failed: number };
};

export default function CheckoutStatus({ orderPublicId }: { orderPublicId?: string }) {
  const [data, setData] = useState<OrderStatus | null>(null);
  const [error, setError] = useState("");
  const [stalled, setStalled] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!orderPublicId) {
      setError("В адресе страницы нет номера заказа. Вернись к мероприятиям или открой билет из AGAYO ID.");
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let failures = 0;
    const maxAutomaticChecks = 30;

    async function check() {
      attempts += 1;
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderPublicId!)}/status`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Не удалось проверить заказ");
        if (stopped) return;
        failures = 0;
        setData(result);
        setError("");

        if (result.status === "pending") {
          if (attempts >= maxAutomaticChecks) {
            setStalled(true);
            return;
          }
          timer = setTimeout(check, 2200);
        } else {
          setStalled(false);
        }
      } catch (cause) {
        if (stopped) return;
        failures += 1;
        setError(cause instanceof Error ? cause.message : "Не удалось проверить заказ");
        if (failures >= 6) {
          setStalled(true);
          return;
        }
        timer = setTimeout(check, 3500);
      }
    }

    setStalled(false);
    void check();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderPublicId, refreshKey]);

  const view = useMemo(() => {
    if (!orderPublicId) {
      return {
        mark: "!",
        title: "ЗАКАЗ\nНЕ УКАЗАН",
        text: "Эта страница не может проверить оплату без номера заказа.",
      };
    }
    const status = data?.status || "pending";
    if (status === "paid") {
      const failed = Number(data?.delivery.failed || 0);
      const mailPending = Boolean(data && data.ticketCount > 0 && data.delivery.sent < data.ticketCount);
      return {
        mark: "✓",
        title: "ОПЛАТА\nПРОШЛА",
        text: failed > 0
          ? "Билет уже выпущен и сохранён в AGAYO ID. С отправкой письма возникла ошибка, но сам билет не потерян — страница безопасно повторяет доставку при проверке статуса."
          : mailPending
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
        text: "AGAYO получил подтверждение возврата. Билеты этого заказа недействительны; срок появления денег на счёте зависит от банка покупателя.",
      };
    }
    return {
      mark: "…",
      title: stalled ? "ПЛАТЁЖ\nЕЩЁ ПРОВЕРЯЕТСЯ" : "ПЛАТЁЖ\nПРОВЕРЯЕТСЯ",
      text: stalled
        ? "Подтверждение занимает дольше обычного. Нажми «Проверить ещё раз» — AGAYO снова запросит актуальный статус напрямую у YooKassa."
        : "AGAYO сверяет статус напрямую с YooKassa. После подтверждения билет выпустится автоматически.",
    };
  }, [data, orderPublicId, stalled]);

  const eventHref = data?.eventSlug ? `/events/${encodeURIComponent(data.eventSlug)}` : "/events";
  const retryHref = data?.eventSlug ? `/events/${encodeURIComponent(data.eventSlug)}/checkout` : "/events";
  const isClosed = data?.status === "cancelled" || data?.status === "expired";
  const pending = Boolean(orderPublicId && (!data || data.status === "pending"));

  return (
    <section className="checkout-success-shell">
      <div className="section-label">ОПЛАТА / AGAYO</div>
      <span className="checkout-success-mark">{view.mark}</span>
      <h1>{view.title.split("\n").map((line, index) => <span key={`${line}-${index}`}>{index ? <br /> : null}{line}</span>)}</h1>
      <p>{view.text}</p>

      {orderPublicId ? <div className="checkout-success-order"><span>ЗАКАЗ</span><strong>{orderPublicId}</strong></div> : null}
      {error ? <p className="checkout-error" role="alert">{error}</p> : null}

      <div className="checkout-success-actions">
        {pending && (stalled || error) ? <button className="button-link button-link-accent checkout-refresh-v133" type="button" onClick={()=>{setError("");setRefreshKey((value)=>value+1);}}>Проверить ещё раз <b>↻</b></button> : null}
        {isClosed ? (
          <Link href={retryHref} className="button-link">Попробовать снова <b>↗</b></Link>
        ) : data?.status === "paid" ? (
          <Link href="/profile" className="button-link">Открыть AGAYO ID <b>↗</b></Link>
        ) : null}
        <Link href={eventHref} className="text-link">К мероприятию</Link>
      </div>
    </section>
  );
}
