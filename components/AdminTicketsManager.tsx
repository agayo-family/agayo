"use client";

import { useCallback, useEffect, useState } from "react";

type TicketRow = {
  id:string; public_id:string; event_slug:string; owner_name:string; category_name:string; status:string;
  zone:string|null; seat:string|null; used_at:string|null; created_at:string;
  email:string|null; phone:string|null; agayo_id:string|null;
  order_public_id:string; order_status:string; total:number; refunded_amount:number; yookassa_payment_id:string|null; paid_at:string|null;
  order_ticket_count:number;
};

type PermissionView = { canManageTickets:boolean; canRefund:boolean };

function statusLabel(status:string) {
  if (status === "valid") return "ДЕЙСТВИТЕЛЕН";
  if (status === "used") return "ИСПОЛЬЗОВАН";
  if (status === "refunded") return "ВОЗВРАЩЁН";
  if (status === "cancelled") return "ОТМЕНЁН";
  return status.toUpperCase();
}

function money(value:number) {
  return new Intl.NumberFormat("ru-RU").format(Number(value || 0));
}

export default function AdminTicketsManager() {
  const [tickets,setTickets]=useState<TicketRow[]>([]);
  const [permissions,setPermissions]=useState<PermissionView>({canManageTickets:false,canRefund:false});
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [busyId,setBusyId]=useState("");

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setMessage("");
    try {
      const suffix = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const response = await fetch(`/api/admin/tickets${suffix}`, { cache:"no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить билеты");
      setTickets(data.tickets || []);
      setPermissions(data.permissions || {canManageTickets:false,canRefund:false});
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить билеты");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function action(ticket:TicketRow, name:"cancel_ticket"|"restore_ticket"|"reset_scan"|"refund_order") {
    let confirmText = "";
    if (name === "cancel_ticket") confirmText = `Отменить билет ${ticket.public_id}?\n\nДеньги покупателю НЕ возвращаются. Билет просто станет недействительным.`;
    if (name === "restore_ticket") confirmText = `Восстановить билет ${ticket.public_id}?`;
    if (name === "reset_scan") confirmText = `Сбросить отметку о проходе для ${ticket.public_id}?\n\nПосле этого QR снова сможет пройти контроль.`;
    if (name === "refund_order") {
      const extra = Number(ticket.order_ticket_count) > 1
        ? `\n\nВАЖНО: в заказе ${ticket.order_ticket_count} билета(ов). Возвратит ВСЮ сумму заказа и сделает недействительными все его билеты.`
        : "\n\nБудет возвращена вся сумма заказа, а билет станет недействительным.";
      confirmText = `Вернуть ${money(Number(ticket.total) - Number(ticket.refunded_amount || 0))} ₽ по заказу ${ticket.order_public_id}?${extra}`;
    }
    if (!window.confirm(confirmText)) return;

    setBusyId(ticket.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/tickets/action", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ticketId:ticket.id,action:name}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Действие не выполнено");
      setMessage(data.message || "Готово");
      await load(query);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Действие не выполнено");
    } finally {
      setBusyId("");
    }
  }

  return <div className="admin-tickets-v133">
    <div className="admin-ticket-toolbar-v133">
      <form onSubmit={(event)=>{event.preventDefault();void load(query);}}>
        <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Билет, заказ, имя, email, телефон, AGAYO ID или событие" />
        <button className="admin-secondary" disabled={loading} type="submit">{loading ? "ЗАГРУЖАЕМ…" : "Найти"}</button>
      </form>
      <button className="admin-secondary" type="button" disabled={loading} onClick={()=>{setQuery("");void load("");}}>Все билеты</button>
      <button className="admin-secondary" type="button" disabled={loading} onClick={()=>void load(query)}>Обновить</button>
    </div>

    {message ? <div className="admin-ticket-message-v133" role="status">{message}</div> : null}

    <div className="admin-ticket-list-card-v133">
      <div className="admin-ticket-list-head-v133"><div><span>БИЛЕТЫ</span><b>{tickets.length}</b></div><small>Список прокручивается независимо от страницы</small></div>
      {loading && !tickets.length ? <div className="admin-table-empty"><strong>ЗАГРУЖАЕМ БИЛЕТЫ…</strong></div> : tickets.length ? (
        <div className="admin-ticket-scroll-v133">
          {tickets.map((ticket)=><article className={`admin-ticket-card-v133 status-${ticket.status}`} key={ticket.id}>
            <div className="admin-ticket-main-v133">
              <div><small>БИЛЕТ</small><b>{ticket.public_id}</b><span>{ticket.category_name}</span></div>
              <div><small>СОБЫТИЕ</small><b>{ticket.event_slug}</b><span>{ticket.created_at ? new Intl.DateTimeFormat("ru-RU",{dateStyle:"short",timeStyle:"short"}).format(new Date(ticket.created_at)) : ""}</span></div>
              <div><small>ВЛАДЕЛЕЦ</small><b>{ticket.owner_name}</b><span>{ticket.agayo_id || "—"}</span></div>
              <div><small>СТАТУС</small><b>{statusLabel(ticket.status)}</b>{ticket.used_at ? <span>Проход: {new Intl.DateTimeFormat("ru-RU",{dateStyle:"short",timeStyle:"short"}).format(new Date(ticket.used_at))}</span> : null}</div>
              <div><small>КОНТАКТ</small><b>{ticket.email || ticket.phone || "—"}</b><span>{ticket.phone || (ticket.email ? "email" : "")}</span></div>
              <div><small>ЗАКАЗ</small><b>{ticket.order_public_id}</b><span>{permissions.canRefund ? `${money(ticket.total)} ₽ · ` : ""}{ticket.order_ticket_count} шт.</span></div>
            </div>

            <div className="admin-ticket-actions-v133">
              {permissions.canManageTickets && ticket.status === "valid" ? <button className="admin-secondary" type="button" disabled={busyId===ticket.id} onClick={()=>void action(ticket,"cancel_ticket")}>Отменить билет</button> : null}
              {permissions.canManageTickets && ticket.status === "cancelled" && ticket.order_status === "paid" ? <button className="admin-secondary" type="button" disabled={busyId===ticket.id} onClick={()=>void action(ticket,"restore_ticket")}>Восстановить</button> : null}
              {permissions.canManageTickets && ticket.status === "used" ? <button className="admin-secondary" type="button" disabled={busyId===ticket.id} onClick={()=>void action(ticket,"reset_scan")}>Сбросить проход</button> : null}
              {permissions.canRefund && ticket.order_status === "paid" && ticket.yookassa_payment_id ? <button className="admin-refund-button-v133" type="button" disabled={busyId===ticket.id} onClick={()=>void action(ticket,"refund_order")}>{busyId===ticket.id ? "ОБРАБОТКА…" : "Вернуть оплату"}</button> : null}
              {ticket.order_status === "refunded" ? <span className="admin-ticket-order-refunded-v133">ЗАКАЗ ВОЗВРАЩЁН</span> : null}
            </div>
          </article>)}
        </div>
      ) : <div className="admin-table-empty"><strong>БИЛЕТОВ НЕ НАЙДЕНО</strong><p>Очисти поиск, чтобы снова показать полный список.</p></div>}
    </div>
  </div>;
}
