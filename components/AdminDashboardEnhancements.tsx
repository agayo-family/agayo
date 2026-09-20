"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AdminTicketsManager from "./AdminTicketsManager";
import YandexDiskImporter from "./YandexDiskImporter";
import LoyaltyVisualAdmin from "./LoyaltyVisualAdmin";

type Targets = { tickets:HTMLElement|null; media:HTMLElement|null; loyalty:HTMLElement|null; settings:HTMLElement|null };

function NpdSettingsNote(){
  return <div className="admin-npd-settings-v134"><b>НПД / МОЙ НАЛОГ</b><p>Для ИП на НПД кассовые «Чеки от ЮKassa» должны оставаться выключены. AGAYO после оплаты помечает заказ как требующий чек НПД, а после возврата подсказывает, когда чек нужно переоформить или аннулировать. Отметка о чеке хранится в заказе.</p><code>YOOKASSA_RECEIPT_REQUIRED=0</code></div>;
}

export default function AdminDashboardEnhancements() {
  const [targets,setTargets]=useState<Targets>({tickets:null,media:null,loyalty:null,settings:null});

  useEffect(()=>{
    let previousTickets:HTMLElement|null=null;
    const sync=()=>{
      const app=document.querySelector<HTMLElement>(".admin-app"); if(!app) return;
      const title=document.querySelector<HTMLElement>(".admin-top h1")?.textContent?.trim().toLowerCase()||"";
      const section=document.querySelector<HTMLElement>(".admin-main > .admin-content");
      if(previousTickets && (title!=="билеты" || section!==previousTickets)) previousTickets.classList.remove("admin-ticket-section-enhanced-v133");
      const tickets=title==="билеты"&&section?section:null; if(tickets){tickets.classList.add("admin-ticket-section-enhanced-v133");previousTickets=tickets;}
      const media=title==="фото и отзывы" ? document.querySelector<HTMLElement>(".admin-media-section:first-of-type .admin-media-create") : null;
      const loyalty=title==="покупатели"&&section?section:null;
      const settings=title==="настройки"&&section?section:null;

      if(settings){
        const articles=[...settings.querySelectorAll<HTMLElement>(".admin-settings-list article")];
        const fiscal=articles.find(article=>article.querySelector("b")?.textContent?.trim()==="Фискализация");
        if(fiscal){const name=fiscal.querySelector("b");const note=fiscal.querySelector("p");if(name)name.textContent="Чеки НПД / Мой налог";if(note)note.textContent="Операционный контроль чеков НПД. YOOKASSA_RECEIPT_REQUIRED остаётся 0; FISCALIZATION_CONFIRMED включается только после теста процесса.";}
      }
      setTargets(current=>current.tickets===tickets&&current.media===media&&current.loyalty===loyalty&&current.settings===settings?current:{tickets,media,loyalty,settings});
    };
    sync(); const observer=new MutationObserver(sync); const root=document.querySelector(".admin-app"); if(root)observer.observe(root,{childList:true,subtree:true,characterData:true}); const timer=window.setInterval(sync,700);
    return()=>{observer.disconnect();window.clearInterval(timer);previousTickets?.classList.remove("admin-ticket-section-enhanced-v133");};
  },[]);

  return <>
    {targets.tickets ? createPortal(<AdminTicketsManager />,targets.tickets, "agayo-v134-tickets") : null}
    {targets.media ? createPortal(<YandexDiskImporter />,targets.media, "agayo-v134-yandex") : null}
    {targets.loyalty ? createPortal(<LoyaltyVisualAdmin />,targets.loyalty, "agayo-v134-loyalty") : null}
    {targets.settings ? createPortal(<NpdSettingsNote />,targets.settings, "agayo-v134-npd") : null}
  </>;
}
