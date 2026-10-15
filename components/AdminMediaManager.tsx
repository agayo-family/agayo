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
  const [vkAlbumUrl,setVkAlbumUrl]=useState(""); const [vkJob,setVkJob]=useState<VkJob|null>(null); const [vkBusy,setVkBusy]=useState(false); const [vkProgress,setVkProgress]=useState(""); const [vkLoaded,setVkLoaded]=useState(false);
  const [vkConnection,setVkConnection]=useState<{vkConnected:boolean;storageConnected:boolean}|null>(null); const vkStop=useRef(false); const vkRunning=useRef(false);
  const vkStorageKey = `agayo:vk-import:v1:${access.userId}`;
  const visibleEvents=useMemo(()=>events.filter((event)=>access.role === "owner" || access.allEvents || access.eventSlugs.includes(event.slug)),[events,access]);

  async function reload(){ if(previewMode) return; try { const data=await json(await fetch("/api/admin/media",{cache:"no-store"})); setPhotos(data.photos||[]); } catch(e){ setMessage(e instanceof Error?e.message:"Не удалось загрузить медиатеку"); } }
  useEffect(()=>{ void reload(); },[previewMode]);
  useEffect(()=>{ if(!eventSlug && visibleEvents[0]) setEventSlug(visibleEvents[0].slug); },[eventSlug,visibleEvents]);
  useEffect(()=>{
    if(previewMode){setVkLoaded(true);return;}
    try { const saved=restoreVkJob(JSON.parse(localStorage.getItem(vkStorageKey)||"null")); if(saved){setVkJob(saved);setVkAlbumUrl(saved.albumUrl);} } catch {}
    setVkLoaded(true);
    void fetch("/api/admin/media/vk",{cache:"no-store"}).then(json<{vkConnected:boolean;storageConnected:boolean}>).then(setVkConnection).catch(()=>setVkConnection(null));
    return ()=>{vkStop.current=true;};
  },[previewMode,vkStorageKey]);
  useEffect(()=>{if(!vkLoaded||previewMode)return;try{if(vkJob)localStorage.setItem(vkStorageKey,JSON.stringify(vkJob));else localStorage.removeItem(vkStorageKey);}catch{}},[vkJob,vkLoaded,vkStorageKey,previewMode]);

  async function vkRequest(payload:Record<string,unknown>){
    const response=await fetch("/api/admin/media/vk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data=await response.json();
    if(!response.ok){const error=Object.assign(new Error(data.error||"Не удалось обратиться к ВК"),{status:response.status});throw error;}
    return data;
  }
  async function runVkImport(initial:VkJob){
    if(previewMode){setMessage("В предпросмотре импорт не записывает фотографии.");return;}
    if(vkRunning.current)return;
    if(!visibleEvents.some(event=>event.slug===initial.eventSlug)){setMessage("Нет доступа к мероприятию этой очереди. Выбери другое и начни новый импорт.");return;}
    vkRunning.current=true;vkStop.current=false;setVkBusy(true);setMessage("");
    let job:VkJob={...initial,items:[...initial.items],failed:[...initial.failed]};
    setVkJob(job);
    try{
      while(!vkStop.current){
        if(job.items.length){
          const photoId=job.items[0];setVkProgress(`Фотография ${photoId} · обработано ${job.imported+job.skipped} / ${job.total}`);
          try{
            const result=await vkRequest({action:"import",albumUrl:job.albumUrl,eventSlug:job.eventSlug,photoId});
            job={...job,items:job.items.slice(1),imported:job.imported+(result.skipped?0:1),skipped:job.skipped+(result.skipped?1:0)};
          }catch(error){
            const status=Number((error as {status?:number})?.status||0);
            if([400,404,413,415].includes(status)){job={...job,items:job.items.slice(1),failed:[...job.failed,{id:photoId,error:error instanceof Error?error.message:"Фотография недоступна"}]};}
            else throw error;
          }
          setVkJob(job);continue;
        }
        if(job.nextOffset===null){job={...job,finished:true};setVkJob(job);break;}
        setVkProgress(`Читаем альбом · с фотографии ${job.nextOffset+1}`);
        const batch=await vkRequest({action:"list",albumUrl:job.albumUrl,eventSlug:job.eventSlug,offset:job.nextOffset});
        job={...job,albumUrl:batch.albumUrl,items:batch.items.map((item:{id:number})=>item.id),nextOffset:batch.nextOffset,total:batch.total,failed:[...job.failed,...batch.failures]};
        setVkJob(job);
      }
      setMessage(job.finished?`Импорт завершён. Добавлено: ${job.imported}. Уже были: ${job.skipped}. Не удалось: ${job.failed.length}.`:`Импорт на паузе. Добавлено: ${job.imported}. Очередь сохранена — можно продолжить.`);
    }catch(error){setMessage(`${error instanceof Error?error.message:"Импорт прерван"}. Очередь сохранена — нажми «Продолжить импорт».`);}
    finally{setVkJob(job);setVkProgress("");vkRunning.current=false;setVkBusy(false);await reload();}
  }
  async function startVkImport(){
    if(!eventSlug){setMessage("Выбери мероприятие");return;}
    let albumUrl:string;
    try{
      const url=new URL(vkAlbumUrl.trim());
      if(url.protocol!=="https:"||url.port||url.username||url.password||!["vk.ru","www.vk.ru","vk.com","www.vk.com","m.vk.com","m.vk.ru"].includes(url.hostname)||!/^\/album-?[1-9]\d*_[1-9]\d*\/?$/.test(url.pathname))throw new Error();
      albumUrl=`https://vk.ru${url.pathname.replace(/\/$/,"")}`;
    }catch{setMessage("Нужна ссылка на альбом ВК вида https://vk.ru/album-123_456");return;}
    await runVkImport({albumUrl,eventSlug,nextOffset:0,items:[],failed:[],imported:0,skipped:0,total:0,finished:false});
  }
  function retryVkFailures(){if(!vkJob)return;const ids=[...new Set(vkJob.failed.flatMap(item=>item.id?[item.id]:[]))];if(!ids.length)return;void runVkImport({...vkJob,items:[...ids,...vkJob.items],failed:vkJob.failed.filter(item=>item.id===null),finished:false});}

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
      <div className="admin-media-create" style={{gridTemplateColumns:"minmax(0,1fr)"}} aria-label="Импорт фотографий из ВК">
        <h3>ФОТОГРАФИИ ИЗ АЛЬБОМА ВК</h3>
        <p>Фотографии добавятся к выбранному мероприятию. Импорт можно поставить на паузу и продолжить; уже добавленные фотографии не дублируются.</p>
        <label><span>ССЫЛКА НА АЛЬБОМ ВК</span><input type="url" value={vkAlbumUrl} disabled={vkBusy} onChange={(e)=>setVkAlbumUrl(e.target.value)} placeholder="https://vk.ru/album-123_456"/></label>
        {vkConnection&&!vkConnection.vkConnected?<small>Импорт ВК ещё не подключён. Нужно подключить сервер к ВК с доступом к фотографиям альбома.</small>:null}
        {vkConnection&&!vkConnection.storageConnected?<small>Хранилище фотографий ещё не подключено.</small>:null}
        <button className="admin-primary" type="button" disabled={photoBusy||vkBusy||Boolean(vkConnection&&(!vkConnection.vkConnected||!vkConnection.storageConnected))} onClick={()=>void startVkImport()}>{vkJob?"Начать новый импорт":"Импортировать альбом ВК"}</button>
        {vkJob?<div aria-live="polite"><p>Мероприятие: {visibleEvents.find(event=>event.slug===vkJob.eventSlug)?.title||vkJob.eventSlug}. Добавлено: {vkJob.imported}. Уже были: {vkJob.skipped}. Ошибок: {vkJob.failed.length}.</p>
          {vkBusy?<button className="admin-secondary" type="button" onClick={()=>{vkStop.current=true;setVkProgress("Останавливаемся после текущей фотографии…");}}>Пауза</button>:!vkJob.finished?<button className="admin-secondary" type="button" disabled={photoBusy} onClick={()=>void runVkImport(vkJob)}>Продолжить импорт</button>:null}
          {!vkBusy&&vkJob.failed.some(item=>item.id!==null)?<button className="admin-secondary" type="button" disabled={photoBusy} onClick={retryVkFailures}>Повторить неудавшиеся</button>:null}
          {vkJob.failed.length?<details><summary>Не удалось импортировать: {vkJob.failed.length}</summary><ul>{vkJob.failed.map((failure,index)=><li key={`${failure.id}-${index}`}>{failure.id?`Фото ${failure.id}: `:""}{failure.error}</li>)}</ul></details>:null}
        </div>:null}
        {vkProgress?<small role="status">{vkProgress}</small>:null}
      </div>
      {photos.length?<div className="admin-photo-grid">{photos.map((photo)=><article key={photo.id} className="admin-photo-card"><div className="admin-photo-preview"><img src={photo.url} alt=""/></div><select value={photo.event_slug} onChange={(e)=>void patchPhoto(photo,{event_slug:e.target.value})}>{visibleEvents.map((event)=><option key={event.id} value={event.slug}>{event.title}</option>)}</select><input value={photo.caption} onChange={(e)=>setPhotos((rows)=>rows.map((row)=>row.id===photo.id?{...row,caption:e.target.value}:row))} onBlur={()=>void patchPhoto(photo,{caption:photo.caption})} placeholder="Подпись"/><div className="admin-media-toggles"><label><input type="checkbox" checked={photo.is_published} onChange={(e)=>void patchPhoto(photo,{is_published:e.target.checked})}/><span>Показывать</span></label><label><input type="checkbox" checked={photo.is_featured} onChange={(e)=>void patchPhoto(photo,{is_featured:e.target.checked})}/><span>Главная для события</span></label></div><div className="admin-photo-actions"><label><span>ПОРЯДОК</span><input type="number" value={photo.sort_order} onChange={(e)=>setPhotos((rows)=>rows.map((row)=>row.id===photo.id?{...row,sort_order:Number(e.target.value)}:row))} onBlur={()=>void patchPhoto(photo,{sort_order:photo.sort_order})}/></label><button className="admin-danger" type="button" onClick={()=>void removePhoto(photo)}>Удалить</button></div></article>)}</div>:<div className="admin-table-empty"><strong>ФОТОГРАФИЙ ПОКА НЕТ</strong><p>После миграции 007 сюда также попадёт текущий архив AGAYO.</p></div>}
    </section>

  </div>;
}
