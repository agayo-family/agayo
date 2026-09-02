"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { AgayoEvent } from "@/lib/events";
import { formatPrice } from "@/lib/events";

type Props = { event: AgayoEvent; initialCategory?: string };

export default function CheckoutExperience({ event, initialCategory }: Props) {
  const [categoryId, setCategoryId] = useState(initialCategory || event.tickets[0]?.id || "");
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [promo, setPromo] = useState("");

  const category = event.tickets.find((item) => item.id === categoryId) ?? event.tickets[0];
  const total = (category?.price ?? 0) * quantity;
  const theme = event.ticketTheme ?? { primary: "#111111", secondary: "#4b0f19", accent: "#c21f39" };
  const style = {
    "--event-primary": theme.primary,
    "--event-secondary": theme.secondary,
    "--event-accent": theme.accent,
  } as CSSProperties;

  const canContinue = useMemo(() => email.includes("@") && name.trim().length > 1 && !!category, [email, name, category]);

  return (
    <div className="checkout-experience" style={style}>
      <div className="checkout-progress" aria-label="Этапы покупки">
        <span className="is-active">01 БИЛЕТ</span><span>02 ДАННЫЕ</span><span>03 ОПЛАТА</span><span>04 ГОТОВО</span>
      </div>

      <div className="checkout-layout">
        <div className="checkout-main">
          <section className="checkout-panel">
            <div className="checkout-panel-head"><span>01</span><h2>ВЫБЕРИ БИЛЕТ</h2></div>
            <div className="checkout-ticket-options">
              {event.tickets.map((ticket, index) => (
                <button
                  type="button"
                  key={ticket.id}
                  className={`checkout-ticket-option ticket-tone-${index % 3} ${categoryId === ticket.id ? "is-selected" : ""}`}
                  onClick={() => setCategoryId(ticket.id)}
                >
                  <span>{ticket.name}</span><strong>{formatPrice(ticket.price)}</strong><small>{ticket.note}</small>
                </button>
              ))}
            </div>
            <div className="checkout-quantity"><span>КОЛИЧЕСТВО</span><div><button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><strong>{quantity}</strong><button type="button" onClick={() => setQuantity(Math.min(6, quantity + 1))}>+</button></div></div>
          </section>

          <section className="checkout-panel">
            <div className="checkout-panel-head"><span>02</span><h2>КУДА ОТПРАВИТЬ</h2></div>
            <p className="checkout-note">Билет придёт на указанную почту после подтверждения оплаты. Если аккаунта с этой почтой ещё нет, AGAYO автоматически создаст профиль и привяжет к нему заказ.</p>
            <div className="checkout-fields">
              <label><span>EMAIL *</span><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" autoComplete="email" /></label>
              <label><span>ИМЯ ВЛАДЕЛЬЦА *</span><input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Как к тебе обращаться" autoComplete="name" /></label>
              <label><span>ТЕЛЕФОН</span><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="+7 999 000-00-00" autoComplete="tel" /></label>
              <label><span>ПРОМОКОД</span><input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} type="text" placeholder="AGAYO" /></label>
            </div>
            <div className="checkout-delivery-channels"><span className="is-on">EMAIL · ВКЛЮЧЕНО</span><span>TELEGRAM · ПОСЛЕ ПРИВЯЗКИ</span></div>
          </section>

          <section className="checkout-panel checkout-payment-panel">
            <div className="checkout-panel-head"><span>03</span><h2>ОПЛАТА</h2></div>
            <p className="checkout-note">В рабочей версии кнопка создаст заказ на сервере и перенаправит в ЮKassa. Билет будет выпущен только после серверного подтверждения платежа.</p>
            <button className="checkout-pay-button" type="button" disabled={!canContinue}>ПЕРЕЙТИ К ОПЛАТЕ · {formatPrice(total)}</button>
            <small>Сейчас платёж отключён в прототипе — мы не имитируем успешную оплату без backend.</small>
          </section>
        </div>

        <aside className="checkout-summary">
          <div className="checkout-poster"><img src={event.posterImage ?? event.heroImage} alt={event.title} /></div>
          <span className="checkout-summary-kicker">ТВОЙ ЗАКАЗ</span>
          <h1>{event.title}</h1>
          <p>{event.dateLabel} · {event.timeLabel}<br />{event.city} · {event.ageLabel}</p>
          <div className="checkout-summary-lines">
            <div><span>{category?.name ?? "БИЛЕТ"} × {quantity}</span><strong>{formatPrice(total)}</strong></div>
            <div><span>СКИДКА</span><strong>—</strong></div>
            <div className="checkout-summary-total"><span>ИТОГО</span><strong>{formatPrice(total)}</strong></div>
          </div>
          <p className="checkout-account-hint">После покупки профиль создаётся автоматически по email. Войти в него можно будет без пароля — по одноразовому коду.</p>
          <Link href="/auth" className="checkout-auth-link">Уже есть профиль? Войти ↗</Link>
        </aside>
      </div>
    </div>
  );
}
