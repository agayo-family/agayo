"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AdminTicketsManager from "./AdminTicketsManager";
import YandexDiskImporter from "./YandexDiskImporter";

type Targets = { tickets:HTMLElement|null; media:HTMLElement|null };

export default function AdminDashboardEnhancements() {
  const [targets,setTargets]=useState<Targets>({tickets:null,media:null});

  useEffect(()=>{
    let previousTickets:HTMLElement|null=null;
    const sync=()=>{
      const app=document.querySelector<HTMLElement>(".admin-app");
      if(!app) return;
      const title=document.querySelector<HTMLElement>(".admin-top h1")?.textContent?.trim().toLowerCase()||"";
      const section=document.querySelector<HTMLElement>(".admin-main > .admin-content");

      if(previousTickets && (title!=="билеты" || section!==previousTickets)) previousTickets.classList.remove("admin-ticket-section-enhanced-v133");
      const tickets=title==="билеты"&&section?section:null;
      if(tickets){tickets.classList.add("admin-ticket-section-enhanced-v133");previousTickets=tickets;}

      const mediaHost=title==="фото и отзывы" ? document.querySelector<HTMLElement>(".admin-media-section:first-of-type .admin-media-create") : null;
      setTargets((current)=>current.tickets===tickets&&current.media===mediaHost?current:{tickets,media:mediaHost});
    };

    sync();
    const observer=new MutationObserver(sync);
    const root=document.querySelector(".admin-app");
    if(root) observer.observe(root,{childList:true,subtree:true,characterData:true});
    const timer=window.setInterval(sync,700);
    return()=>{observer.disconnect();window.clearInterval(timer);previousTickets?.classList.remove("admin-ticket-section-enhanced-v133");};
  },[]);

  return <>
    {targets.tickets ? createPortal(<AdminTicketsManager />,targets.tickets, "agayo-v133-tickets") : null}
    {targets.media ? createPortal(<YandexDiskImporter />,targets.media, "agayo-v133-yandex") : null}
  </>;
}
