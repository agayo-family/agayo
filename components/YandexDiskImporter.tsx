"use client";

import { useEffect, useMemo, useState } from "react";

type YandexResource = { path:string; name:string; size:number; mime_type:string };
type Checkpoint = { publicUrl:string; eventSlug:string; done:string[]; total:number; updatedAt:number };

const checkpointKey = "agayo:yandex-import:v134";
const resourceKey = (resource:YandexResource) => `${resource.path}::${resource.name}`;

export default function YandexDiskImporter() {
  const [publicUrl,setPublicUrl]=useState("");
  const [eventSlug,setEventSlug]=useState("");
  const [eventName,setEventName]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [progress,setProgress]=useState("");
  const [checkpoint,setCheckpoint]=useState<Checkpoint|null>(null);

  useEffect(()=>{
    try { const raw=localStorage.getItem(checkpointKey); if(raw){const saved=JSON.parse(raw);if(saved?.publicUrl&&saved?.eventSlug&&Array.isArray(saved.done)) setCheckpoint(saved);} } catch {}
    const select = document.querySelector<HTMLSelectElement>(".admin-media-section:first-of-type .admin-media-create select");
    if (!select) return;
    const sync=()=>{ setEventSlug(select.value); setEventName(select.options[select.selectedIndex]?.text || select.value); };
    sync(); select.addEventListener("change",sync); return ()=>select.removeEventListener("change",sync);
  },[]);

  function saveCheckpoint(next:Checkpoint|null){ setCheckpoint(next); try { if(next)localStorage.setItem(checkpointKey,JSON.stringify(next)); else localStorage.removeItem(checkpointKey); } catch {} }

  const resumable = useMemo(()=>Boolean(checkpoint && checkpoint.done.length < checkpoint.total),[checkpoint]);

  async function importPhotos(useSaved=false) {
    const link=(useSaved?checkpoint?.publicUrl:publicUrl)?.trim()||"";
    const slug=(useSaved?checkpoint?.eventSlug:eventSlug)||"";
    if (!link) { setMessage("Вставь публичную ссылку Яндекс Диска"); return; }
    if (!slug) { setMessage("Сначала выбери мероприятие выше"); return; }
    setBusy(true); setMessage(""); setProgress("Проверяем ссылку…");
    try {
      const listResponse=await fetch("/api/admin/media/yandex",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"list",publicUrl:link,eventSlug:slug})});
      const listData=await listResponse.json(); if(!listResponse.ok) throw new Error(listData.error||"Не удалось открыть Яндекс Диск");
      const resources:YandexResource[]=listData.resources||[]; if(!resources.length) throw new Error("По этой ссылке не найдено поддерживаемых фотографий");
      const previous = checkpoint && checkpoint.publicUrl===link && checkpoint.eventSlug===slug ? new Set<string>(checkpoint.done) : new Set<string>();
      const next:Checkpoint={publicUrl:link,eventSlug:slug,done:[...previous],total:resources.length,updatedAt:Date.now()}; saveCheckpoint(next);
      let imported=0, skipped=0;
      for(let index=0;index<resources.length;index++){
        const resource=resources[index]; const key=resourceKey(resource);
        if(previous.has(key)){skipped++;continue;}
        setProgress(`Файл ${index+1} / ${resources.length}: ${resource.name}`);
        const response=await fetch("/api/admin/media/yandex",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"import",publicUrl:link,eventSlug:slug,path:resource.path,name:resource.name})});
        const data=await response.json(); if(!response.ok) throw new Error(`${resource.name}: ${data.error||"ошибка импорта"}`);
        previous.add(key); if(data.skipped) skipped++; else imported++;
        saveCheckpoint({...next,done:[...previous],updatedAt:Date.now()});
      }
      saveCheckpoint(null); setProgress(""); setPublicUrl(""); setMessage(`Готово: добавлено ${imported}, уже было ${skipped}.`);
      window.setTimeout(()=>window.location.reload(),900);
    }catch(error){setMessage(`${error instanceof Error?error.message:"Ошибка импорта"}. Прогресс сохранён — можно продолжить позже.`);setProgress("");}
    finally{setBusy(false);}
  }

  async function deleteEventPhotos(){
    if(!eventSlug){setMessage("Сначала выбери мероприятие выше");return;}
    if(!confirm(`Удалить ВСЕ фотографии мероприятия «${eventName||eventSlug}»? Это действие нельзя отменить.`)) return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/admin/media/event-photos",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventSlug})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось удалить фотографии");
      if(checkpoint?.eventSlug===eventSlug) saveCheckpoint(null);
      setMessage(`Удалено фотографий: ${data.deleted||0}.`); window.setTimeout(()=>window.location.reload(),700);
    }catch(error){setMessage(error instanceof Error?error.message:"Ошибка удаления");}finally{setBusy(false);}
  }

  return <div className="admin-yandex-import-v133 admin-yandex-import-v134">
    <div className="admin-yandex-import-title-v133"><div><span>ЯНДЕКС ДИСК</span><b>Импорт фотографий по публичной ссылке</b></div><small>{eventName ? `В мероприятие: ${eventName}` : "Выбери мероприятие выше"}</small></div>
    <div className="admin-yandex-import-form-v133">
      <input value={publicUrl} disabled={busy} onChange={(event)=>setPublicUrl(event.target.value)} placeholder="https://disk.yandex.ru/d/… или публичная ссылка на файл" />
      <button className="admin-primary" type="button" disabled={busy} onClick={()=>void importPhotos(false)}>{busy?"РАБОТАЕМ…":"Загрузить из Диска"}</button>
    </div>
    {resumable?<div className="admin-yandex-resume-v134"><span>Незавершённая загрузка: {checkpoint!.done.length} / {checkpoint!.total}</span><button className="admin-secondary" disabled={busy} type="button" onClick={()=>void importPhotos(true)}>Продолжить загрузку</button><button className="admin-secondary" disabled={busy} type="button" onClick={()=>saveCheckpoint(null)}>Сбросить очередь</button></div>:null}
    <div className="admin-yandex-danger-v134"><p>Файлы копируются в Vercel Blob AGAYO. Повторный запуск не создаёт дубли. Прогресс импорта с Диска сохраняется в этом браузере.</p><button className="admin-danger" disabled={busy||!eventSlug} type="button" onClick={()=>void deleteEventPhotos()}>Удалить все фото этого мероприятия</button></div>
    {progress?<strong>{progress}</strong>:null}{message?<strong>{message}</strong>:null}
  </div>;
}
