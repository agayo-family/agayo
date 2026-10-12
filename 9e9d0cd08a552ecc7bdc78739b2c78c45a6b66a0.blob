"use client";
import { uploadAdminFile } from "@/lib/client/upload";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StoredEvent } from "./AdminEventsManager";
import type { AdminAccessView } from "./AdminDashboard";

type PhotoRow = { id:string; event_slug:string; url:string; caption:string; sort_order:number; is_featured:boolean; is_published:boolean; created_at:string };

async function json<T=any>(response: Response): Promise<T> { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Ошибка"); return data; }

export default function AdminMediaManager({ events, access, previewMode=false }: { events:StoredEvent[]; access:AdminAccessView; previewMode?:boolean }) {
  const [photos,setPhotos]=useState<PhotoRow[]>([]);
  const [eventSlug,setEventSlug]=useState(""); const [photoFiles,setPhotoFiles]=useState<File[]>([]); const photoInput=useRef<HTMLInputElement|null>(null);
  const [photoCaption,setPhotoCaption]=useState(""); const [photoBusy,setPhotoBusy]=useState(false); const [photoProgress,setPhotoProgress]=useState(""); const [message,setMessage]=useState("");
  const visibleEvents=useMemo(()=>events.filter((event)=>access.role === "owner" || access.allEvents || access.eventSlugs.includes(event.slug)),[events,access]);

  async function reload(){ if(previewMode) return; try { const data=await json(await fetch("/api/admin/media",{cache:"no-store"})); setPhotos(data.photos||[]); } catch(e){ setMessage(e instanceof Error?e.message:"Не удалось загрузить медиатеку"); } }
  useEffect(()=>{ void reload(); },[previewMode]);
  useEffect(()=>{ if(!eventSlug && visibleEvents[0]) setEventSlug(visibleEvents[0].slug); },[eventSlug,visibleEvents]);

  async function addPhotos(){
    if(previewMode){setMessage("В предпросмотре медиатека не записывается.");return;}
    if(!eventSlug){setMessage("Выбери мероприятие");return;}
    if(!photoFiles.length){setMessage("Выбери фотографии");return;}
    setPhotoBusy(true); setMessage("");
    const failed:File[]=[]; let uploaded=0;
    for(let index=0; index<photoFiles.length; index++){
      const file=photoFiles[index]; setPhotoProgress(`Загрузка ${index+1} / ${photoFiles.length}: ${file.name}`);
      try{
        const up=await uploadAdminFile(file,"photo",eventSlug);
        await json(await fetch("/api/admin/media",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"photo",eventSlug,url:up.url,caption:photoCaption})}));
        uploaded++;
      }catch{ failed.push(file); }
    }
    setPhotoProgress(""); setPhotoFiles(failed);
    if(!failed.length){ setPhotoCaption(""); if(photoInput.current) photoInput.current.value=""; setMessage(`Добавлено фотографий: ${uploaded}`); }
    else setMessage(`Загружено: ${uploaded}. Осталось: ${failed.length}. Нажми «Продолжить оставшиеся» — уже загруженные файлы повторно не отправятся.`);
    await reload(); setPhotoBusy(false);
  }

  async function patchPhoto(photo:PhotoRow,patch:Partial<PhotoRow>){ try{ const payload:any={type:"photo",id:photo.id}; if("event_slug" in patch) payload.eventSlug=patch.event_slug; if("caption" in patch) payload.caption=patch.caption; if("sort_order" in patch) payload.sortOrder=patch.sort_order; if("is_featured" in patch) payload.isFeatured=patch.is_featured; if("is_published" in patch) payload.isPublished=patch.is_published; const data=await json(await fetch("/api/admin/media",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})); setPhotos((rows)=>rows.map((row)=>row.id===photo.id?data.photo:row).map((row)=>patch.is_featured&&row.event_slug===data.photo.event_slug&&row.id!==photo.id?{...row,is_featured:false}:row)); }catch(e){setMessage(e instanceof Error?e.message:"Не удалось изменить фото");} }
  async function removePhoto(photo:PhotoRow){ if(!confirm("Удалить фотографию из галереи?"))return; try{await json(await fetch("/api/admin/media",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"photo",id:photo.id})}));setPhotos((rows)=>rows.filter((row)=>row.id!==photo.id));}catch(e){setMessage(e instanceof Error?e.message:"Не удалось удалить фото");} }

  const remainingUpload = photoFiles.length > 0 && message.includes("Осталось:");

  return <div className="admin-media-manager">
    {message?<div className="admin-media-message">{message}</div>:null}
    <section className="admin-media-section">
      <div className="admin-panel-head"><div><span>ГАЛЕРЕЯ</span><h2>ФОТОГРАФИИ</h2></div><b>{photos.length}</b></div>
      <div className="admin-media-create">
        <label><span>МЕРОПРИЯТИЕ</span><select value={eventSlug} onChange={(e)=>setEventSlug(e.target.value)}>{visibleEvents.map((event)=><option key={event.id} value={event.slug}>{event.title}</option>)}</select></label>
        <label className="admin-media-file"><span>ФОТО · МОЖНО НЕСКОЛЬКО</span><input ref={photoInput} type="file" accept="image/*" multiple onChange={(e)=>{setPhotoFiles(Array.from(e.target.files||[]));setMessage("");}}/><small>{photoFiles.length?`Осталось в очереди: ${photoFiles.length}`:"JPG / PNG / WEBP · до 16 МБ каждое"}</small></label>
        <label><span>ПОДПИСЬ · НЕОБЯЗАТЕЛЬНО</span><input value={photoCaption} onChange={(e)=>setPhotoCaption(e.target.value)} placeholder="Например: тот самый финал"/></label>
        <button className="admin-primary" type="button" onClick={()=>void addPhotos()} disabled={photoBusy}>{photoBusy?"ЗАГРУЖАЕМ…":remainingUpload?"Продолжить оставшиеся":"Добавить фотографии"}</button>
        {photoProgress?<small className="admin-media-progress-v134">{photoProgress}</small>:null}
      </div>
      {photos.length?<div className="admin-photo-grid">{photos.map((photo)=><article key={photo.id} className="admin-photo-card"><div className="admin-photo-preview"><img src={photo.url} alt=""/></div><select value={photo.event_slug} onChange={(e)=>void patchPhoto(photo,{event_slug:e.target.value})}>{visibleEvents.map((event)=><option key={event.id} value={event.slug}>{event.title}</option>)}</select><input value={photo.caption} onChange={(e)=>setPhotos((rows)=>rows.map((row)=>row.id===photo.id?{...row,caption:e.target.value}:row))} onBlur={()=>void patchPhoto(photo,{caption:photo.caption})} placeholder="Подпись"/><div className="admin-media-toggles"><label><input type="checkbox" checked={photo.is_published} onChange={(e)=>void patchPhoto(photo,{is_published:e.target.checked})}/><span>Показывать</span></label><label><input type="checkbox" checked={photo.is_featured} onChange={(e)=>void patchPhoto(photo,{is_featured:e.target.checked})}/><span>Главная для события</span></label></div><div className="admin-photo-actions"><label><span>ПОРЯДОК</span><input type="number" value={photo.sort_order} onChange={(e)=>setPhotos((rows)=>rows.map((row)=>row.id===photo.id?{...row,sort_order:Number(e.target.value)}:row))} onBlur={()=>void patchPhoto(photo,{sort_order:photo.sort_order})}/></label><button className="admin-danger" type="button" onClick={()=>void removePhoto(photo)}>Удалить</button></div></article>)}</div>:<div className="admin-table-empty"><strong>ФОТОГРАФИЙ ПОКА НЕТ</strong><p>После миграции 007 сюда также попадёт текущий архив AGAYO.</p></div>}
    </section>

  </div>;
}
