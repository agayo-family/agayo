"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type TicketRow = {
  id:string; public_id:string; event_slug:string; owner_name:string; category_name:string; status:string;
  zone:string|null; seat:string|null; used_at:string|null; created_at:string;
  email:string|null; phone:string|null; agayo_id:string|null;
  order_id:string; order_public_id:string; order_status:string; subtotal:number; total:number; refunded_amount:number; yookassa_payment_id:string|null; paid_at:string|null;
  order_ticket_count:number; event_starts_at:string|null; paid_share:number;
  refund_quote_percent:0|30|50|100; refund_quote_amount:number; refund_quote_label:string; days_before_event:number;
  ticket_refund_id:string|null; ticket_refund_yookassa_id:string|null; ticket_refund_percent:number|null; ticket_refund_amount:number; ticket_refund_status:string|null;
  npd_receipt_status:string; npd_receipt_id:string|null; npd_receipt_url:string|null; npd_receipt_amount:number;
};

type PermissionView = { canManageTickets:boolean; canRefund:boolean; canManageNpd:boolean };

function statusLabel(status:string) {
  if (status === "valid") return "ДЕЙСТВИТЕЛЕН";
  if (status === "used") return "ИСПОЛЬЗОВАН";
  if (status === "refunded") return "ВОЗВРАЩЁН";
  if (status === "cancelled") return "ОТМЕНЁН";
  return status.toUpperCase();
}

function npdLabel(status:string) {
  if(status==="required") return "НУЖЕН ЧЕК НПД";
  if(status==="registered") return "ЧЕК НПД СОХРАНЁН";
  if(status==="reissue_required") return "АННУЛИРОВАТЬ И ВЫДАТЬ НОВЫЙ";
  if(status==="cancel_required") return "АННУЛИРОВАТЬ ЧЕК НПД";
  if(status==="cancelled") return "ЧЕК НПД АННУЛИРОВАН";
  return "ЧЕК НЕ ТРЕБУЕТСЯ";
}

function money(value:number) {
  return new Intl.NumberFormat("ru-RU",{minimumFractionDigits:Number(value)%1?2:0,maximumFractionDigits:2}).format(Number(value || 0));
}

export default function AdminTicketsManager() {
  const [tickets,setTickets]=useState<TicketRow[]>([]);
  const [permissions,setPermissions]=useState<PermissionView>({canManageTickets:false,canRefund:false,canManageNpd:false});
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [busyId,setBusyId]=useState("");
  const [npdInputs,setNpdInputs]=useState<Record<string,string>>({});

  const load = useCallback(async (search = "") => {
    setLoading(true); setMessage("");
    try {
      const suffix = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const response = await fetch(`/api/admin/tickets${suffix}`, { cache:"no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить билеты");
      setTickets(data.tickets || []);
      setPermissions(data.permissions || {canManageTickets:false,canRefund:false,canManageNpd:false});
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось загрузить билеты"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const uniqueOrders=useMemo(()=>new Set(tickets.map((ticket)=>ticket.order_id)).size,[tickets]);

  async function action(ticket:TicketRow, name:"cancel_ticket"|"restore_ticket"|"reset_scan"|"refund_order"|"refund_ticket_policy") {
    let confirmText = "";
    if (name === "cancel_ticket") confirmText = `Отменить билет ${ticket.public_id}?\n\nДеньги покупателю НЕ возвращаются. Билет просто станет недействительным.`;
    if (name === "restore_ticket") confirmText = `Восстановить билет ${ticket.public_id}?`;
    if (name === "reset_scan") confirmText = `Сбросить отметку о проходе для ${ticket.public_id}?\n\nПосле этого QR снова сможет пройти контроль.`;
    if (name === "refund_ticket_policy") confirmText = `Вернуть ${ticket.refund_quote_percent}% стоимости билета ${ticket.public_id}?\n\nК возврату: ${money(ticket.refund_quote_amount)} ₽.\n${ticket.refund_quote_label}\n\nПосле успешного возврата этот билет станет недействительным.`;
    if (name === "refund_order") {
      const remaining=Math.max(0,Number(ticket.total)-Number(ticket.refunded_amount||0));
      confirmText = `Вернуть ВЕСЬ оставшийся платёж по заказу ${ticket.order_public_id}?\n\nК возврату: ${money(remaining)} ₽. Все билеты этого заказа станут недействительными. Используй это действие для отмены мероприятия или полного возврата организатором.`;
    }
    if (!window.confirm(confirmText)) return;

    setBusyId(ticket.id); setMessage("");
    try {
      const response = await fetch("/api/admin/tickets/action", { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticketId:ticket.id,action:name}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Действие не выполнено");
      setMessage(data.message || "Готово");
      await load(query);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Действие не выполнено"); }
    finally { setBusyId(""); }
  }

  async function saveNpd(ticket:TicketRow,mode:"register"|"cancelled"|"reset") {
    setBusyId(`npd-${ticket.order_id}`);setMessage("");
    try{
      const value=(npdInputs[ticket.order_id]||"").trim();
      const isUrl=/^https?:\/\//i.test(value);
      const response=await fetch("/api/admin/npd",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId:ticket.order_id,action:mode,receiptUrl:isUrl?value:"",receiptId:!isUrl?value:""})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось обновить чек НПД");
      setMessage(data.message||"Статус чека НПД обновлён");setNpdInputs((current)=>({...current,[ticket.order_id]:""}));await load(query);
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось обновить чек НПД");}
    finally{setBusyId("");}
  }

  return <div className="admin-tickets-v133 admin-tickets-v134">
    <div className="admin-ticket-toolbar-v133">
      <form onSubmit={(event)=>{event.preventDefault();void load(query);}}><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Билет, заказ, имя, email, телефон, AGAYO ID, категория или событие"/><button className="admin-secondary" disabled={loading} type="submit">{loading?"ЗАГРУЖАЕМ…":"Найти"}</button></form>
      <button className="admin-secondary" type="button" disabled={loading} onClick={()=>{setQuery("");void load("");}}>Все билеты</button>
      <button className="admin-secondary" type="button" disabled={loading} onClick={()=>void load(query)}>Обновить</button>
    </div>

    {message?<div className="admin-ticket-message-v133" role="status">{message}</div>:null}

    <div className="admin-ticket-list-card-v133">
      <div className="admin-ticket-list-head-v133"><div><span>БИЛЕТЫ</span><b>{tickets.length}</b></div><small>{uniqueOrders} заказов · список прокручивается независимо от страницы</small></div>
      {loading&&!tickets.length?<div className="admin-table-empty"><strong>ЗАГРУЖАЕМ БИЛЕТЫ…</strong></div>:tickets.length?(
        <div className="admin-ticket-scroll-v133">
          {tickets.map((ticket)=><article className={`admin-ticket-card-v133 status-${ticket.status}`} key={ticket.id}>
            <div className="admin-ticket-main-v133">
              <div><small>БИЛЕТ</small><b>{ticket.public_id}</b><span>{ticket.category_name}</span></div>
              <div><small>СОБЫТИЕ</small><b>{ticket.event_slug}</b><span>{ticket.event_starts_at?new Intl.DateTimeFormat("ru-RU",{dateStyle:"short",timeStyle:"short"}).format(new Date(ticket.event_starts_at)):"—"}</span></div>
              <div><small>ВЛАДЕЛЕЦ</small><b>{ticket.owner_name}</b><span>{ticket.agayo_id||"—"}</span></div>
              <div><small>СТАТУС</small><b>{statusLabel(ticket.status)}</b>{ticket.used_at?<span>Проход: {new Intl.DateTimeFormat("ru-RU",{dateStyle:"short",timeStyle:"short"}).format(new Date(ticket.used_at))}</span>:null}</div>
              <div><small>КОНТАКТ</small><b>{ticket.email||ticket.phone||"—"}</b><span>{ticket.phone||(ticket.email?"email":"")}</span></div>
              <div><small>ЗАКАЗ</small><b>{ticket.order_public_id}</b><span>{permissions.canRefund?`${money(ticket.paid_share)} ₽ за билет · `:""}{ticket.order_ticket_count} шт.</span></div>
            </div>

            {permissions.canRefund?<div className="admin-refund-policy-v134"><span>ВОЗВРАТ ПО ПРАВИЛАМ</span><b>{ticket.refund_quote_label}</b>{ticket.ticket_refund_status?<small>Этот билет: {ticket.ticket_refund_status==="succeeded"?`возвращено ${money(ticket.ticket_refund_amount)} ₽ (${ticket.ticket_refund_percent}%)`:ticket.ticket_refund_status==="pending"?"возврат обрабатывается":"предыдущая попытка возврата не завершилась"}</small>:ticket.refund_quote_percent>0?<small>Расчёт: {money(ticket.refund_quote_amount)} ₽ от фактически оплаченной доли билета</small>:<small>Автоматический добровольный возврат сейчас равен 0%.</small>}</div>:null}

            <div className="admin-ticket-actions-v133">
              {permissions.canManageTickets&&ticket.status==="valid"?<button className="admin-secondary" type="button" disabled={busyId===ticket.id} onClick={()=>void action(ticket,"cancel_ticket")}>Отменить билет</button>:null}
              {permissions.canManageTickets&&ticket.status==="cancelled"&&ticket.order_status==="paid"&&!ticket.ticket_refund_id?<button className="admin-secondary" type="button" disabled={busyId===ticket.id} onClick={()=>void action(ticket,"restore_ticket")}>Восстановить</button>:null}
              {permissions.canManageTickets&&ticket.status==="used"?<button className="admin-secondary" type="button" disabled={busyId===ticket.id} onClick={()=>void action(ticket,"reset_scan")}>Сбросить проход</button>:null}
              {permissions.canRefund&&ticket.order_status==="paid"&&ticket.yookassa_payment_id&&['valid','cancelled'].includes(ticket.status)&&ticket.refund_quote_percent>0&&ticket.ticket_refund_status!=="succeeded"&&ticket.ticket_refund_status!=="pending"?<button className="admin-refund-button-v133" type="button" disabled={busyId===ticket.id} onClick={()=>void action(ticket,"refund_ticket_policy")}>{busyId===ticket.id?"ОБРАБОТКА…":`Вернуть ${ticket.refund_quote_percent}% · ${money(ticket.refund_quote_amount)} ₽`}</button>:null}
              {ticket.ticket_refund_status==="pending"?<button className="admin-secondary" type="button" disabled={busyId===ticket.id} onClick={()=>void action(ticket,"refund_ticket_policy")}>Проверить возврат</button>:null}
              {ticket.order_status==="refunded"?<span className="admin-ticket-order-refunded-v133">ЗАКАЗ ВОЗВРАЩЁН</span>:null}
              {permissions.canRefund&&ticket.order_status==="paid"&&ticket.yookassa_payment_id?<details className="admin-ticket-more-v134"><summary>Доп. действия</summary><button className="admin-danger" type="button" disabled={busyId===ticket.id} onClick={()=>void action(ticket,"refund_order")}>Вернуть весь остаток заказа</button></details>:null}
            </div>

            {permissions.canManageNpd?<details className={`admin-npd-v134 status-${ticket.npd_receipt_status}`}>
              <summary><span>НПД / МОЙ НАЛОГ</span><b>{npdLabel(ticket.npd_receipt_status)}</b>{ticket.npd_receipt_amount>0?<small>{money(ticket.npd_receipt_amount)} ₽</small>:null}</summary>
              <div>
                {['required','reissue_required'].includes(ticket.npd_receipt_status)?<><p>{ticket.npd_receipt_status==="reissue_required"?"После частичного возврата аннулируй прежний чек в «Мой налог» с причиной возврата и сформируй новый на оставшуюся сумму.":"Сформируй чек НПД на сумму заказа и передай его покупателю."}</p><input value={npdInputs[ticket.order_id]||""} onChange={(event)=>setNpdInputs((current)=>({...current,[ticket.order_id]:event.target.value}))} placeholder="Ссылка или номер чека из «Мой налог»"/><button className="admin-primary" type="button" disabled={busyId===`npd-${ticket.order_id}`} onClick={()=>void saveNpd(ticket,"register")}>Чек сформирован</button></>:null}
                {ticket.npd_receipt_status==="registered"?<><p>Чек НПД отмечен как выданный покупателю.</p>{ticket.npd_receipt_url?<a href={ticket.npd_receipt_url} target="_blank" rel="noreferrer">Открыть сохранённую ссылку ↗</a>:ticket.npd_receipt_id?<code>{ticket.npd_receipt_id}</code>:null}<button className="admin-secondary" type="button" onClick={()=>void saveNpd(ticket,"reset")}>Сбросить отметку</button></>:null}
                {ticket.npd_receipt_status==="cancel_required"?<><p>Деньги возвращены полностью. Аннулируй исходный чек в «Мой налог» с причиной «Возврат средств», затем подтверди здесь.</p><button className="admin-primary" type="button" disabled={busyId===`npd-${ticket.order_id}`} onClick={()=>void saveNpd(ticket,"cancelled")}>Чек аннулирован</button></>:null}
                {ticket.npd_receipt_status==="cancelled"?<p>Аннулирование чека зафиксировано. Доход по этому заказу после полного возврата — 0 ₽.</p>:null}
                {ticket.npd_receipt_status==="not_required"?<p>По текущему состоянию заказа чек НПД не требуется.</p>:null}
              </div>
            </details>:null}
          </article>)}
        </div>
      ):<div className="admin-table-empty"><strong>БИЛЕТОВ НЕ НАЙДЕНО</strong><p>Очисти поиск, чтобы снова показать полный список.</p></div>}
    </div>
  </div>;
}
