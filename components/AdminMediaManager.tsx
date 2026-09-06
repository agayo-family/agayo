"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StoredEvent } from "./AdminEventsManager";
import type { AdminAccessView } from "./AdminDashboard";

type PhotoRow = { id:string; event_slug:string; url:string; caption:string; sort_order:number; is_featured:boolean; is_published:boolean; created_at:string };
type ReviewRow = { id:string; event_slug:string|null; author:string; body:string; audio_url:string|null; sort_order:number; is_featured:boolean; is_published:boolean; created_at:string };

async function json<T=any>(response: Response): Promise<T> { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Ошибка"); return data; }

export default function AdminMediaManager({ events, access, previewMode=false }: { events:StoredEvent[]; access:AdminAccessView; previewMode?:boolean }) {
  const [photos,setPhotos]=useState<PhotoRow[]>([]); const [reviews,setReviews]=useState<ReviewRow[]>([]);
  const [eventSlug,setEventSlug]=useState(""); const [photoFiles,setPhotoFiles]=useState<File[]>([]); const photoInput=useRef<HTMLInputElement|null>(null);
  const [photoCaption,setPhotoCaption]=useState(""); const [photoBusy,setPhotoBusy]=useState(false); const [message,setMessage]=useState("");
  const [reviewEvent,setReviewEvent]=useState(""); const [reviewAuthor,setReviewAuthor]=useState(""); const [reviewBody,setReviewBody]=useState(""); const [reviewAudio,setReviewAudio]=useState<File|null>(null); const [reviewFeatured,setReviewFeatured]=useState(false); const [reviewBusy,setReviewBusy]=useState(false);
  const canGlobal=access.role === "owner" || access.allEvents;
  const visibleEvents=useMemo(()=>events.filter((event)=>access.role === "owner" || access.allEvents || access.eventSlugs.includes(event.slug)),[events,access]);

  async function reload(){ if(previewMode) return; try { const data=await json(await fetch("/api/admin/media",{cache:"no-store"})); setPhotos(data.photos||[]); setReviews(data.reviews||[]); } catch(e){ setMessage(e instanceof Error?e.message:"Не удалось загрузить медиатеку"); } }
  useEffect(()=>{ void reload(); },[previewMode]);
  useEffect(()=>{ if(!eventSlug && visibleEvents[0]) setEventSlug(visibleEvents[0].slug); },[eventSlug,visibleEvents]);

  async function uploadFile(file:File,kind:"photo"|"audio",slug?:string){ const fd=new FormData(); fd.set("file",file); fd.set("kind",kind); if(slug) fd.set("eventSlug",slug); return json(await fetch("/api/admin/media/upload",{method:"POST",body:fd})); }

  async function addPhotos(){
    if(previewMode){setMessage("В предпросмотре медиатека не записывается.");return;} if(!eventSlug){setMessage("Выбери мероприятие");return;} if(!photoFiles.length){setMessage("Выбери фотографии");return;}
    setPhotoBusy(true);setMessage(""); let uploaded=0;
    try{
      for(const file of photoFiles){ const up=await uploadFile(file,"photo",eventSlug); await json(await fetch("/api/admin/media",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"photo",eventSlug,url:up.url,caption:photoCaption})})); uploaded++; }
      setPhotoFiles([]);setPhotoCaption("");if(photoInput.current) photoInput.current.value="";setMessage(`Добавлено фотографий: ${uploaded}`);await reload();
    }catch(e){setMessage(e instanceof Error?e.message:"Ошибка загрузки");}finally{setPhotoBusy(false);}
  }

  async function patchPhoto(photo:PhotoRow,patch:Partial<PhotoRow>){ try{ const payload:any={type:"photo",id:photo.id}; if("event_slug" in patch) payload.eventSlug=patch.event_slug; if("caption" in patch) payload.caption=patch.caption; if("sort_order" in patch) payload.sortOrder=patch.sort_order; if("is_featured" in patch) payload.isFeatured=patch.is_featured; if("is_published" in patch) payload.isPublished=patch.is_published; const data=await json(await fetch("/api/admin/media",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})); setPhotos((rows)=>rows.map((row)=>row.id===photo.id?data.photo:row).map((row)=>patch.is_featured&&row.event_slug===data.photo.event_slug&&row.id!==photo.id?{...row,is_featured:false}:row)); }catch(e){setMessage(e instanceof Error?e.message:"Не удалось изменить фото");} }
  async function removePhoto(photo:PhotoRow){ if(!confirm("Удалить фотографию из галереи?"))return; try{await json(await fetch("/api/admin/media",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"photo",id:photo.id})}));setPhotos((rows)=>rows.filter((row)=>row.id!==photo.id));}catch(e){setMessage(e instanceof Error?e.message:"Не удалось удалить фото");} }

  async function addReview(){
    if(previewMode){setMessage("В предпросмотре отзывы не записываются.");return;} if(!reviewAuthor.trim()){setMessage("Укажи автора отзыва");return;} if(!reviewBody.trim()&&!reviewAudio){setMessage("Добавь текст или голосовой файл");return;}
    setReviewBusy(true);setMessage("");
    try{ let audioUrl:string|undefined; if(reviewAudio){const up=await uploadFile(reviewAudio,"audio",reviewEvent||undefined);audioUrl=up.url;}
      await json(await fetch("/api/admin/media",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"review",eventSlug:reviewEvent||null,author:reviewAuthor,body:reviewBody,audioUrl,isFeatured:reviewFeatured})}));
      setReviewAuthor("");setReviewBody("");setReviewAudio(null);setReviewFeatured(false);setMessage("Отзыв добавлен");await reload();
    }catch(e){setMessage(e instanceof Error?e.message:"Не удалось добавить отзыв");}finally{setReviewBusy(false);}
  }
  async function patchReview(review:ReviewRow,patch:Partial<ReviewRow>){ try{const payload:any={type:"review",id:review.id}; if("event_slug" in patch) payload.eventSlug=patch.event_slug; if("author" in patch) payload.author=patch.author; if("body" in patch) payload.body=patch.body; if("audio_url" in patch) payload.audioUrl=patch.audio_url; if("sort_order" in patch) payload.sortOrder=patch.sort_order; if("is_featured" in patch) payload.isFeatured=patch.is_featured; if("is_published" in patch) payload.isPublished=patch.is_published; const data=await json(await fetch("/api/admin/media",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}));setReviews((rows)=>rows.map((row)=>row.id===review.id?data.review:(patch.is_featured?{...row,is_featured:false}:row)));}catch(e){setMessage(e instanceof Error?e.message:"Не удалось изменить отзыв");} }
  async function removeReview(review:ReviewRow){if(!confirm("Удалить отзыв?"))return;try{await json(await fetch("/api/admin/media",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"review",id:review.id})}));setReviews((rows)=>rows.filter((row)=>row.id!==review.id));}catch(e){setMessage(e instanceof Error?e.message:"Не удалось удалить отзыв");}}

  return <div className="admin-media-manager">
    {message?<div className="admin-media-message">{message}</div>:null}
    <section className="admin-media-section">
      <div className="admin-panel-head"><div><span>ГАЛЕРЕЯ</span><h2>ФОТОГРАФИИ</h2></div><b>{photos.length}</b></div>
      <div className="admin-media-create">
        <label><span>МЕРОПРИЯТИЕ</span><select value={eventSlug} onChange={(e)=>setEventSlug(e.target.value)}>{visibleEvents.map((event)=><option key={event.id} value={event.slug}>{event.title}</option>)}</select></label>
        <label className="admin-media-file"><span>ФОТО · МОЖНО НЕСКОЛЬКО</span><input ref={photoInput} type="file" accept="image/*" multiple onChange={(e)=>setPhotoFiles(Array.from(e.target.files||[]))}/><small>{photoFiles.length?`Выбрано: ${photoFiles.length}`:"JPG / PNG / WEBP · до 16 МБ каждое"}</small></label>
        <label><span>ПОДПИСЬ · НЕОБЯЗАТЕЛЬНО</span><input value={photoCaption} onChange={(e)=>setPhotoCaption(e.target.value)} placeholder="Например: тот самый финал"/></label>
        <button className="admin-primary" type="button" onClick={()=>void addPhotos()} disabled={photoBusy}>{photoBusy?"ЗАГРУЖАЕМ…":"Добавить фотографии"}</button>
      </div>
      {photos.length?<div className="admin-photo-grid">{photos.map((photo)=><article key={photo.id} className="admin-photo-card"><div className="admin-photo-preview"><img src={photo.url} alt=""/></div><select value={photo.event_slug} onChange={(e)=>void patchPhoto(photo,{event_slug:e.target.value})}>{visibleEvents.map((event)=><option key={event.id} value={event.slug}>{event.title}</option>)}</select><input value={photo.caption} onChange={(e)=>setPhotos((rows)=>rows.map((row)=>row.id===photo.id?{...row,caption:e.target.value}:row))} onBlur={()=>void patchPhoto(photo,{caption:photo.caption})} placeholder="Подпись"/><div className="admin-media-toggles"><label><input type="checkbox" checked={photo.is_published} onChange={(e)=>void patchPhoto(photo,{is_published:e.target.checked})}/><span>Показывать</span></label><label><input type="checkbox" checked={photo.is_featured} onChange={(e)=>void patchPhoto(photo,{is_featured:e.target.checked})}/><span>Главная для события</span></label></div><div className="admin-photo-actions"><label><span>ПОРЯДОК</span><input type="number" value={photo.sort_order} onChange={(e)=>setPhotos((rows)=>rows.map((row)=>row.id===photo.id?{...row,sort_order:Number(e.target.value)}:row))} onBlur={()=>void patchPhoto(photo,{sort_order:photo.sort_order})}/></label><button className="admin-danger" type="button" onClick={()=>void removePhoto(photo)}>Удалить</button></div></article>)}</div>:<div className="admin-table-empty"><strong>ФОТОГРАФИЙ ПОКА НЕТ</strong><p>После миграции 007 сюда также попадёт текущий архив AGAYO.</p></div>}
    </section>

    <section className="admin-media-section">
      <div className="admin-panel-head"><div><span>ГОЛОСА</span><h2>ОТЗЫВЫ</h2></div><b>{reviews.length}</b></div>
      <div className="admin-media-create admin-review-create">
        <label><span>МЕРОПРИЯТИЕ</span><select value={reviewEvent} onChange={(e)=>setReviewEvent(e.target.value)}><option value="">Без привязки</option>{visibleEvents.map((event)=><option key={event.id} value={event.slug}>{event.title}</option>)}</select></label>
        <label><span>АВТОР</span><input value={reviewAuthor} onChange={(e)=>setReviewAuthor(e.target.value)} placeholder="Алина, 16"/></label>
        <label className="admin-media-wide"><span>ТЕКСТ</span><textarea value={reviewBody} onChange={(e)=>setReviewBody(e.target.value)} rows={4} placeholder="Текст отзыва"/></label>
        <label className="admin-media-file"><span>ГОЛОСОВОЙ ОТЗЫВ · НЕОБЯЗАТЕЛЬНО</span><input type="file" accept="audio/*" onChange={(e)=>setReviewAudio(e.target.files?.[0]||null)}/><small>{reviewAudio?.name||"MP3 / M4A / WAV · до 30 МБ"}</small></label>
        {canGlobal?<label className="admin-checkbox"><input type="checkbox" checked={reviewFeatured} onChange={(e)=>setReviewFeatured(e.target.checked)}/><span>Показать этот отзыв на главной</span></label>:null}
        <button className="admin-primary" type="button" onClick={()=>void addReview()} disabled={reviewBusy}>{reviewBusy?"СОХРАНЯЕМ…":"Добавить отзыв"}</button>
      </div>
      {reviews.length?<div className="admin-review-list">{reviews.map((review)=><ReviewEditor key={review.id} review={review} events={visibleEvents} canGlobal={canGlobal} onChange={(next)=>setReviews((rows)=>rows.map((row)=>row.id===review.id?next:row))} onSave={(patch)=>void patchReview(review,patch)} onDelete={()=>void removeReview(review)}/>)}</div>:<div className="admin-table-empty"><strong>ОТЗЫВОВ ПОКА НЕТ</strong><p>Добавь текстовый отзыв или загрузи голосовой файл.</p></div>}
    </section>
  </div>;
}

function ReviewEditor({review,events,canGlobal,onChange,onSave,onDelete}:{review:ReviewRow;events:StoredEvent[];canGlobal:boolean;onChange:(review:ReviewRow)=>void;onSave:(patch:Partial<ReviewRow>)=>void;onDelete:()=>void}){
  return <article className="admin-review-card"><div className="admin-review-head"><select value={review.event_slug||""} disabled={!canGlobal&&!review.event_slug} onChange={(e)=>onChange({...review,event_slug:e.target.value||null})}><option value="">Без привязки</option>{events.map((event)=><option key={event.id} value={event.slug}>{event.title}</option>)}</select><div className="admin-media-toggles"><label><input type="checkbox" checked={review.is_published} onChange={(e)=>{onChange({...review,is_published:e.target.checked});onSave({is_published:e.target.checked});}}/><span>Показывать</span></label>{canGlobal?<label><input type="checkbox" checked={review.is_featured} onChange={(e)=>{onChange({...review,is_featured:e.target.checked});onSave({is_featured:e.target.checked});}}/><span>На главной</span></label>:null}</div></div><input value={review.author} onChange={(e)=>onChange({...review,author:e.target.value})} placeholder="Автор"/><textarea rows={3} value={review.body} onChange={(e)=>onChange({...review,body:e.target.value})}/>{review.audio_url?<audio controls preload="none" src={review.audio_url}/>:null}<div className="admin-review-actions"><button className="admin-secondary" type="button" onClick={()=>onSave({event_slug:review.event_slug,author:review.author,body:review.body,is_published:review.is_published,is_featured:review.is_featured})}>Сохранить</button><button className="admin-danger" type="button" onClick={onDelete}>Удалить</button></div></article>;
}
