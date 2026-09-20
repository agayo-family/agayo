"use client";

import { useEffect, useState } from "react";

type YandexResource = { path:string; name:string; size:number; mime_type:string };

export default function YandexDiskImporter() {
  const [publicUrl,setPublicUrl]=useState("");
  const [eventSlug,setEventSlug]=useState("");
  const [eventName,setEventName]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [progress,setProgress]=useState("");

  useEffect(()=>{
    const select = document.querySelector<HTMLSelectElement>(".admin-media-section:first-of-type .admin-media-create select");
    if (!select) return;
    const sync=()=>{
      setEventSlug(select.value);
      setEventName(select.options[select.selectedIndex]?.text || select.value);
    };
    sync();
    select.addEventListener("change",sync);
    return ()=>select.removeEventListener("change",sync);
  },[]);

  async function importPhotos() {
    const link=publicUrl.trim();
    if (!link) { setMessage("Вставь публичную ссылку Яндекс Диска"); return; }
    if (!eventSlug) { setMessage("Сначала выбери мероприятие выше"); return; }
    setBusy(true);setMessage("");setProgress("Проверяем ссылку…");
    try {
      const listResponse=await fetch("/api/admin/media/yandex",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"list",publicUrl:link,eventSlug})});
      const listData=await listResponse.json();
      if(!listResponse.ok) throw new Error(listData.error||"Не удалось открыть Яндекс Диск");
      const resources:YandexResource[]=listData.resources||[];
      if(!resources.length) throw new Error("По этой ссылке не найдено поддерживаемых фотографий");
      let done=0;
      for(const resource of resources){
        setProgress(`Загружаем ${done+1} / ${resources.length}: ${resource.name}`);
        const response=await fetch("/api/admin/media/yandex",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"import",publicUrl:link,eventSlug,path:resource.path,name:resource.name})});
        const data=await response.json();
        if(!response.ok) throw new Error(`${resource.name}: ${data.error||"ошибка импорта"}`);
        done++;
      }
      setMessage(`Из Яндекс Диска добавлено фотографий: ${done}. Обнови раздел, если карточки не появились сразу.`);
      setProgress("");
      setPublicUrl("");
      window.setTimeout(()=>window.location.reload(),900);
    }catch(error){setMessage(error instanceof Error?error.message:"Ошибка импорта");setProgress("");}
    finally{setBusy(false);}
  }

  return <div className="admin-yandex-import-v133">
    <div className="admin-yandex-import-title-v133"><div><span>ЯНДЕКС ДИСК</span><b>Импорт фотографий по публичной ссылке</b></div><small>{eventName ? `В мероприятие: ${eventName}` : "Выбери мероприятие выше"}</small></div>
    <div className="admin-yandex-import-form-v133">
      <input value={publicUrl} disabled={busy} onChange={(event)=>setPublicUrl(event.target.value)} placeholder="https://disk.yandex.ru/d/… или публичная ссылка на файл" />
      <button className="admin-primary" type="button" disabled={busy} onClick={()=>void importPhotos()}>{busy?"ИМПОРТИРУЕМ…":"Загрузить из Диска"}</button>
    </div>
    <p>Поддерживаются публичные ссылки на отдельную фотографию или папку. Файлы копируются в Vercel Blob AGAYO — галерея не зависит от доступности исходной ссылки.</p>
    {progress?<strong>{progress}</strong>:null}{message?<strong>{message}</strong>:null}
  </div>;
}
