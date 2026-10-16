"use client";
import { uploadAdminFile } from "@/lib/client/upload";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StoredEvent } from "./AdminEventsManager";
import type { AdminAccessView } from "./AdminDashboard";

type PhotoRow = { id:string; event_slug:string; url:string; caption:string; sort_order:number; is_featured:boolean; is_published:boolean; created_at:string };
type VkFailure = { id:number|null; error:string };
type VkJob = { albumUrl:string; eventSlug:string; nextOffset:number|null; items:number[]; failed:VkFailure[]; imported:number; skipped:number; total:number; finished:boolean };

export function restoreVkJob(value:unknown): VkJob|null {
  const job = value as VkJob;
  if (!job || typeof job !== "object" || typeof job.albumUrl !== "string" || !/^https:\/\/vk\.ru\/album-?[1-9]\d*_[1-9]\d*$/.test(job.albumUrl) || typeof job.eventSlug !== "string" || job.eventSlug.length > 180 || !job.eventSlug) return null;
  if (job.nextOffset !== null && (!Number.isSafeInteger(job.nextOffset) || job.nextOffset < 0 || job.nextOffset > 1000000)) return null;
  if (!Array.isArray(job.items) || job.items.length > 10000 || job.items.some(id => !Number.isSafeInteger(id) || id < 1)) return null;
  if (!Array.isArray(job.failed) || job.failed.length > 10000 || job.failed.some(item => !item || (item.id !== null && (!Number.isSafeInteger(item.id) || item.id < 1)) || typeof item.error !== "string" || item.error.length > 500)) return null;
  if ([job.imported,job.skipped,job.total].some(count => !Number.isSafeInteger(count) || count < 0 || count > 1000000) || typeof job.finished !== "boolean") return null;
  return { albumUrl:job.albumUrl,eventSlug:job.eventSlug,nextOffset:job.nextOffset,items:[...job.items],failed:job.failed.map(item=>({id:item.id,error:item.error})),imported:job.imported,skipped:job.skipped,total:job.total,finished:job.finished };
}

async function json<T=any>(response: Response): Promise<T> { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Ошибка"); return data; }

export default function AdminMediaManager({ events, access, previewMode=false }: { events:StoredEvent[]; access:AdminAccessView; previewMode?:boolean }) {
  const [photos,setPhotos]=useState<PhotoRow[]>([]);
  const [eventSlug,setEventSlug]=useState(""); const [photoFiles,setPhotoFiles]=useState<File[]>([]); const photoInput=useRef<HTMLInputElement|null>(null);
  const [photoCaption,setPhotoCaption]=useState(""); const [photoBusy,setPhotoBusy]=useState(false); const [photoProgress,setPhotoProgress]=useState(""); const [message,setMessage]=useState("");
  const [vkAlbumUrl,setVkAlbumUrl]=useState(""); const [vkBusy,setVkBusy]=useState(false);
  const [vkConnection,setVkConnection]=useState<{vkConnected:boolean;sources:Array<{event_slug:string;album_url:string}>}|null>(null);
  const visibleEvents=useMemo(()=>events.filter((event)=>access.role === "owner" || access.allEvents || access.eventSlugs.includes(event.slug)),[events,access]);
  async function reload(){ if(previewMode) return; try { const data=await json(await fetch("/api/admin/media",{cache:"no-store"})); setPhotos(data.photos||[]); } catch(e){ setMessage(e instanceof Error?e.message:"Не удалось загрузить медиатеку"); } }
  async function loadVk(){if(previewMode)return;try{setVkConnection(await json(await fetch('/api/admin/media/vk',{cache:'no-store'})));}catch{setVkConnection(null);}}
  useEffect(()=>{ void reload(); void loadVk(); },[previewMode]);
  useEffect(()=>{ if(!eventSlug && visibleEvents[0]) setEventSlug(visibleEvents[0].slug); },[eventSlug,visibleEvents]);
  useEffect(()=>{setVkAlbumUrl(vkConnection?.sources.find(source=>source.event_slug===eventSlug)?.album_url||'');},[eventSlug,vkConnection]);
  async function connectVk(disconnect=false){
    if(previewMode){setMessage('В предпросмотре альбом не подключается.');return;}
    setVkBusy(true);setMessage('');
    try{
      const result=await json(await fetch('/api/admin/media/vk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:disconnect?'disconnect':'connect',eventSlug,albumUrl:vkAlbumUrl})}));
      setMessage(disconnect?'Альбом отключён. Фотографии в ВК сохранены.':`Альбом подключён: ${result.total} фотографий. Файлы остаются в ВК.`);
      await loadVk();
    }catch(error){setMessage(error instanceof Error?error.message:'Не удалось подключить альбом');}
    finally{setVkBusy(false);}
  }

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
        <label><span>МЕРОПРИЯТИЕ</span><select value={eventSlug} disabled={photoBusy||vkBusy} onChange={(e)=>setEventSlug(e.target.value)}>{visibleEvents.map((event)=><option key={event.id} value={event.slug}>{event.title}</option>)}</select></label>
        <label className="admin-media-file"><span>ФОТО · МОЖНО НЕСКОЛЬКО</span><input ref={photoInput} type="file" accept="image/*" multiple onChange={(e)=>{setPhotoFiles(Array.from(e.target.files||[]));setMessage("");}}/><small>{photoFiles.length?`Осталось в очереди: ${photoFiles.length}`:"JPG / PNG / WEBP · до 16 МБ каждое"}</small></label>
        <label><span>ПОДПИСЬ · НЕОБЯЗАТЕЛЬНО</span><input value={photoCaption} onChange={(e)=>setPhotoCaption(e.target.value)} placeholder="Например: тот самый финал"/></label>
        <button className="admin-primary" type="button" onClick={()=>void addPhotos()} disabled={photoBusy||vkBusy}>{photoBusy?"ЗАГРУЖАЕМ…":remainingUpload?"Продолжить оставшиеся":"Добавить фотографии"}</button>
        {photoProgress?<small className="admin-media-progress-v134">{photoProgress}</small>:null}
      </div>
      <div className="admin-media-create" style={{gridTemplateColumns:"minmax(0,1fr)"}} aria-label="Внешний альбом ВК">
        <h3>ФОТОГРАФИИ ИЗ АЛЬБОМА ВК</h3>
        <p>Все доступные фотографии появятся в галерее по мере просмотра. Они загружаются с ВК: в БД сохраняется только ссылка на альбом, файлы в Blob не копируются.</p>
        <label><span>ССЫЛКА НА АЛЬБОМ ВК</span><input type="url" value={vkAlbumUrl} disabled={vkBusy} onChange={e=>setVkAlbumUrl(e.target.value)} placeholder="https://vk.ru/album-123_456"/></label>
        {vkConnection&&!vkConnection.vkConnected?<small>Добавь VK_ACCESS_TOKEN в защищённые переменные сервера. Токен должен иметь доступ к фотографиям альбома.</small>:null}
        <button className="admin-primary" type="button" disabled={photoBusy||vkBusy||!eventSlug||!vkAlbumUrl||Boolean(vkConnection&&!vkConnection.vkConnected)} onClick={()=>void connectVk()}>{vkBusy?'ПОДКЛЮЧАЕМ…':'Подключить альбом ВК'}</button>
        {vkConnection?.sources.some(source=>source.event_slug===eventSlug)?<button className="admin-secondary" type="button" disabled={vkBusy||photoBusy} onClick={()=>void connectVk(true)}>Отключить альбом</button>:null}
      </div>
      {photos.length?<div className="admin-photo-grid">{photos.map((photo)=><article key={photo.id} className="admin-photo-card"><div className="admin-photo-preview"><img src={photo.url} alt=""/></div><select value={photo.event_slug} onChange={(e)=>void patchPhoto(photo,{event_slug:e.target.value})}>{visibleEvents.map((event)=><option key={event.id} value={event.slug}>{event.title}</option>)}</select><input value={photo.caption} onChange={(e)=>setPhotos((rows)=>rows.map((row)=>row.id===photo.id?{...row,caption:e.target.value}:row))} onBlur={()=>void patchPhoto(photo,{caption:photo.caption})} placeholder="Подпись"/><div className="admin-media-toggles"><label><input type="checkbox" checked={photo.is_published} onChange={(e)=>void patchPhoto(photo,{is_published:e.target.checked})}/><span>Показывать</span></label><label><input type="checkbox" checked={photo.is_featured} onChange={(e)=>void patchPhoto(photo,{is_featured:e.target.checked})}/><span>Главная для события</span></label></div><div className="admin-photo-actions"><label><span>ПОРЯДОК</span><input type="number" value={photo.sort_order} onChange={(e)=>setPhotos((rows)=>rows.map((row)=>row.id===photo.id?{...row,sort_order:Number(e.target.value)}:row))} onBlur={()=>void patchPhoto(photo,{sort_order:photo.sort_order})}/></label><button className="admin-danger" type="button" onClick={()=>void removePhoto(photo)}>Удалить</button></div></article>)}</div>:<div className="admin-table-empty"><strong>ФОТОГРАФИЙ ПОКА НЕТ</strong><p>После миграции 007 сюда также попадёт текущий архив AGAYO.</p></div>}
    </section>

  </div>;
}
