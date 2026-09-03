'use client';

import { useMemo, useState } from 'react';
import type { AdminPermission, AdminRole } from '@/lib/admin-permissions';
import { extractEventPalette } from '@/lib/event-palette';

export type StoredEvent = { id:string; slug:string; title:string; starts_at:string; ends_at:string|null; status:string; sales_state:string; ticket_mode:string };
type Access = { role:AdminRole; permissions:AdminPermission[]; allEvents:boolean; eventSlugs:string[] };
type TicketDraft = { clientKey:string; id:string; name:string; price:string; note:string; inventory:string; hotEnabled:boolean; soldCount:number };
type ProgramDraft = { clientKey:string; time:string; title:string };
type Editor = {
  id?:string; slug?:string; title:string; date:string; start:string; end:string; age:string; city:string; venue:string; address:string;
  description:string; secondaryDescription:string; posterImage:string; status:'draft'|'published'|'cancelled'; salesState:'open'|'closed'|'coming-soon'; ticketMode:'general-admission'|'zones'|'seats';
  themePrimary:string; themeSecondary:string; themeAccent:string; tickets:TicketDraft[]; program:ProgramDraft[];
};
type Stats = { event:{title:string}; metrics:{revenue:number;paid_orders:number;pending_orders:number;failed_orders:number;discounts:number;issued:number;used:number;valid:number;invalid:number}; categories:Array<{category_key:string;name:string;price:number;inventory:number|null;hot_enabled:boolean;sold:number;used:number}>; promo:Array<{promo_code:string;orders:number;discount:number}> };

const blank = (): Editor => ({
  title:'', date:'', start:'18:00', end:'21:00', age:'14+', city:'Йошкар-Ола', venue:'', address:'', description:'', secondaryDescription:'', posterImage:'', status:'draft', salesState:'coming-soon', ticketMode:'zones', themePrimary:'#220708', themeSecondary:'#751013', themeAccent:'#e12622',
  tickets:[{clientKey:'ticket-standard',id:'standard',name:'STANDARD',price:'700',note:'Вход на мероприятие',inventory:'',hotEnabled:false,soldCount:0},{clientKey:'ticket-premium',id:'premium',name:'PREMIUM',price:'1200',note:'Расширенный формат билета',inventory:'',hotEnabled:false,soldCount:0}],
  program:[{clientKey:'program-1',time:'17:30',title:'СБОР ГОСТЕЙ'},{clientKey:'program-2',time:'18:00',title:'СТАРТ ПРОГРАММЫ'}],
});
function localParts(value:string|null|undefined){ if(!value)return {date:'',time:''}; const d=new Date(value); if(Number.isNaN(+d)) return {date:'',time:''}; const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).replace(' ','T').split('T'); return {date:parts[0],time:parts[1]}; }
function categoryKey(value:string,index:number){ return value.toLowerCase().trim().replace(/[^a-zа-яё0-9]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,50)||`ticket-${index+1}`; }
function eventViewHref(slug:string,status:string){ return `/events/${slug}${status==='published'?'':'?preview=admin'}`; }

export default function AdminEventsManager({ access, previewMode, events, setEvents }: { access:Access; previewMode:boolean; events:StoredEvent[]; setEvents:(events:StoredEvent[])=>void }) {
  const [editor,setEditor]=useState<Editor|null>(null); const [saving,setSaving]=useState(false); const [loading,setLoading]=useState(false); const [message,setMessage]=useState(''); const [stats,setStats]=useState<Stats|null>(null); const [statsLoading,setStatsLoading]=useState(false); const [posterPreview,setPosterPreview]=useState(''); const [paletteStatus,setPaletteStatus]=useState('Цвета страницы определятся автоматически после выбора афиши.');
  const can=(p:AdminPermission)=>access.role==='owner'||access.permissions.includes(p); const canEvent=(slug:string)=>access.role==='owner'||access.allEvents||access.eventSlugs.includes(slug);
  const canCreate=can('manage_events')&&(access.role==='owner'||access.allEvents);
  const visible=useMemo(()=>events.filter(e=>canEvent(e.slug)),[events,access.role,access.allEvents,access.eventSlugs]);

  function patch<K extends keyof Editor>(key:K,value:Editor[K]){ setEditor(current=>current?{...current,[key]:value}:current); }
  function patchTicket(index:number, patch:Partial<TicketDraft>){ setEditor(current=>current?{...current,tickets:current.tickets.map((t,i)=>i===index?{...t,...patch}:t)}:current); }
  function addTicket(){ const key=`ticket-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; setEditor(current=>current?{...current,tickets:[...current.tickets,{clientKey:key,id:key,name:'',price:'0',note:'',inventory:'',hotEnabled:false,soldCount:0}]}:current); }
  function removeTicket(index:number){ setEditor(current=>current?{...current,tickets:current.tickets.filter((_,i)=>i!==index)}:current); }
  function patchProgram(index:number, patch:Partial<ProgramDraft>){ setEditor(current=>current?{...current,program:current.program.map((item,i)=>i===index?{...item,...patch}:item)}:current); }
  function addProgram(){ setEditor(current=>current?{...current,program:[...current.program,{clientKey:`program-${Date.now()}-${current.program.length}`,time:'',title:'НОВЫЙ ПУНКТ'}]}:current); }
  function removeProgram(index:number){ setEditor(current=>current?{...current,program:current.program.filter((_,i)=>i!==index)}:current); }

  async function openEdit(item:StoredEvent){
    setPosterPreview('');setPaletteStatus('Сохранённая палитра события. Новая афиша пересчитает её автоматически.');
    if(previewMode){
      const saved=typeof window!=='undefined'?window.localStorage.getItem(`agayo-preview-event:${item.id}`):null;
      if(saved){ try{ const raw=JSON.parse(saved) as Partial<Editor>; const base=blank(); const restored:Editor={...base,...raw,tickets:Array.isArray(raw.tickets)?raw.tickets.map((t:any,i:number)=>({...t,clientKey:t.clientKey||`ticket-restored-${i}-${Date.now()}`})):base.tickets,program:Array.isArray(raw.program)?raw.program.map((x:any,i:number)=>({...x,clientKey:x.clientKey||`program-restored-${i}-${Date.now()}`})):base.program}; setEditor(restored); setStats(null); setMessage('Тестовые изменения восстановлены из браузера.'); return; }catch{} }
      const s=localParts(item.starts_at),e=localParts(item.ends_at);
      setEditor({...blank(),id:item.id,slug:item.slug,title:item.title,date:s.date,start:s.time,end:e.time,status:item.status as Editor['status'],salesState:item.sales_state as Editor['salesState'],ticketMode:item.ticket_mode as Editor['ticketMode'],posterImage:item.slug==='vernite-lampovost'?'/events/vernite-lampovost-poster.jpg':'',description:'Тёплая клубная ночь AGAYO — про людей, музыку и ощущение, ради которого хочется возвращаться.',secondaryDescription:'Alcohol Free · Йошкар-Ола',tickets:item.slug==='vernite-lampovost'?[{clientKey:'ticket-standard',id:'standard',name:'STANDARD',price:'700',note:'Вход на мероприятие',inventory:'120',hotEnabled:true,soldCount:87}]:blank().tickets,program:item.slug==='vernite-lampovost'?[{clientKey:'program-1',time:'17:30',title:'СБОР ГОСТЕЙ'},{clientKey:'program-2',time:'18:00',title:'СТАРТ ПРОГРАММЫ'},{clientKey:'program-3',time:'20:45',title:'ФИНАЛ'}]:blank().program});
      setStats(null);setMessage('');return;
    }
    setLoading(true);setMessage('');setStats(null);
    try{
      const r=await fetch(`/api/admin/events/${item.id}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Не удалось открыть событие');
      const s=localParts(d.event.starts_at),e=localParts(d.event.ends_at);
      setEditor({id:item.id,slug:item.slug,title:d.event.title,date:s.date,start:s.time,end:e.time,age:d.event.age_label,city:d.event.city,venue:d.event.venue||'',address:d.event.address||'',description:d.event.description||'',secondaryDescription:d.event.secondary_description||'',posterImage:d.event.poster_image||'',status:d.event.status,salesState:d.event.sales_state,ticketMode:d.event.ticket_mode,themePrimary:d.event.theme_primary||'#220708',themeSecondary:d.event.theme_secondary||'#751013',themeAccent:d.event.theme_accent||'#e12622',tickets:(d.categories||[]).map((c:any,i:number)=>({clientKey:`ticket-${c.id||c.category_key||i}`,id:c.category_key,name:c.name,price:String(c.price),note:c.note||'',inventory:c.inventory==null?'':String(c.inventory),hotEnabled:Boolean(c.hot_enabled),soldCount:Number(c.sold_count)||0})),program:(d.program||[]).map((x:any,i:number)=>({clientKey:`program-${x.id||i}`,time:String(x.time_label||''),title:String(x.title||'')}))});
    }catch(e){setMessage(e instanceof Error?e.message:'Ошибка');}finally{setLoading(false);}
  }
  async function loadStats(item:StoredEvent){ if(previewMode){ setStats({event:{title:item.title},metrics:{revenue:60900,paid_orders:61,pending_orders:3,failed_orders:2,discounts:4200,issued:87,used:54,valid:33,invalid:0},categories:[{category_key:'standard',name:'STANDARD',price:700,inventory:120,hot_enabled:true,sold:87,used:54}],promo:[{promo_code:'AGAYO10',orders:8,discount:4200}]});return;} setStatsLoading(true);setMessage(''); try{const r=await fetch(`/api/admin/events/${item.id}/stats`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Не удалось загрузить статистику');setStats(d);}catch(e){setMessage(e instanceof Error?e.message:'Ошибка');}finally{setStatsLoading(false);} }
  async function analyzePosterPalette(file:File){
    try{
      const palette=await extractEventPalette(file);
      setEditor(current=>current?{...current,themePrimary:palette.primary,themeSecondary:palette.secondary,themeAccent:palette.accent}:current);
      setPaletteStatus('Автопалитра определена по основным цветам выбранной афиши.');
    }catch(error){
      setPaletteStatus('Не удалось автоматически разобрать цвета афиши — оставлена текущая безопасная палитра.');
      console.warn('Poster palette:',error);
    }
  }
  async function uploadPoster(){
    if(!editor)return '';
    const input=document.querySelector<HTMLInputElement>('#admin-event-poster');const file=input?.files?.[0];
    if(!file)return editor.posterImage;
    if(previewMode){
      if(file.size>2.5*1024*1024) throw new Error('Для тестового предпросмотра выбери афишу до 2,5 МБ. В реальном /admin лимит выше.');
      return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Не удалось прочитать афишу'));reader.readAsDataURL(file);});
    }
    const fd=new FormData();fd.append('file',file);const r=await fetch('/api/admin/upload-poster',{method:'POST',body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||'Не удалось загрузить афишу');return d.url as string;
  }
  async function save(targetStatus?:'draft'|'published'){
    if(!editor)return;
    setSaving(true);setMessage('');
    let posterImage=editor.posterImage;
    let posterWarning='';
    try{
      try{
        posterImage=await uploadPoster();
      }catch(error){
        posterWarning=error instanceof Error?error.message:'Не удалось загрузить афишу';
        // Saving the event itself must never be blocked by optional media storage.
        posterImage=editor.posterImage;
      }
      const startsAt=editor.date&&editor.start?`${editor.date}T${editor.start}:00+03:00`:'';
      const endsAt=editor.date&&editor.end?`${editor.date}T${editor.end}:00+03:00`:null;
      const payload={
        title:editor.title,startsAt,endsAt,ageLabel:editor.age,city:editor.city,venue:editor.venue,address:editor.address,
        description:editor.description,secondaryDescription:editor.secondaryDescription,posterImage,status:targetStatus||editor.status,
        salesState:editor.salesState,ticketMode:editor.ticketMode,themePrimary:editor.themePrimary,themeSecondary:editor.themeSecondary,themeAccent:editor.themeAccent,
        tickets:editor.ticketMode==='general-admission'&&editor.tickets.length===0?[]:editor.tickets.map((t,i)=>({
          id:categoryKey(t.id||`ticket-${i+1}`,i),name:t.name,price:Number(t.price)||0,note:t.note,
          inventory:t.inventory===''?null:Number(t.inventory),hotEnabled:t.hotEnabled,
          themePrimary:editor.themePrimary,themeSecondary:editor.themeSecondary,themeAccent:editor.themeAccent
        })),
        program:editor.program.map((x,i)=>({timeLabel:x.time.trim(),title:x.title.trim(),sortOrder:i})).filter(x=>x.title)
      };
      if(previewMode){
        const id=editor.id||`preview-${Date.now()}`;
        const slug=editor.slug||categoryKey(editor.title,0)||`event-${Date.now()}`;
        const nextEditor={...editor,id,slug,status:(targetStatus||editor.status),posterImage};
        window.localStorage.setItem(`agayo-preview-event:${id}`,JSON.stringify(nextEditor));
        const previewStartsAt=editor.date&&editor.start?`${editor.date}T${editor.start}:00+03:00`:new Date().toISOString();
        const previewEndsAt=editor.date&&editor.end?`${editor.date}T${editor.end}:00+03:00`:null;
        const record:StoredEvent={id,slug,title:editor.title||'НОВОЕ СОБЫТИЕ',starts_at:previewStartsAt,ends_at:previewEndsAt,status:targetStatus||editor.status,sales_state:editor.salesState,ticket_mode:editor.ticketMode};
        const exists=events.some(e=>e.id===id);
        setEvents(exists?events.map(e=>e.id===id?record:e):[record,...events]);
        setEditor(nextEditor);setPosterPreview('');
        setMessage(targetStatus==='published'?'Тестовое событие опубликовано и сохранено в этом браузере.':'Тестовые изменения сохранены в этом браузере.');
        return;
      }
      let r:Response;
      if(editor.id) r=await fetch(`/api/admin/events/${editor.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      else r=await fetch('/api/admin/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Не удалось сохранить');
      const list=await fetch('/api/admin/events',{cache:'no-store'});const ld=await list.json();if(list.ok)setEvents(ld.events||[]);
      if(!editor.id&&d.id){const created=(ld.events||[]).find((x:StoredEvent)=>x.id===d.id);if(created)await openEdit(created);}
      else setEditor(c=>c?{...c,status:(targetStatus||c.status),posterImage}:c);
      if(!posterWarning)setPosterPreview('');
      const baseMessage=targetStatus==='published'?'Событие опубликовано и изменения сохранены.':'Изменения сохранены.';
      setMessage(posterWarning?`${baseMessage} Афиша пока не загружена: ${posterWarning}`:baseMessage);
    }catch(e){setMessage(e instanceof Error?e.message:'Ошибка');}
    finally{setSaving(false);}
  }

  if(editor){ return <div className="admin-event-workspace">
    <div className="admin-workspace-bar"><button className="admin-secondary" type="button" onClick={()=>{setEditor(null);setStats(null);setPosterPreview('');setMessage('')}}>← К событиям</button><div><span>{editor.id?'РЕДАКТИРОВАНИЕ':'НОВОЕ СОБЫТИЕ'}</span><strong>{editor.slug||'ещё без адреса'}</strong></div><div className="admin-workspace-actions"><button className="admin-secondary" disabled={saving} onClick={()=>void save('draft')}>Сохранить</button>{can('publish_events')?<button className="admin-primary" disabled={saving} onClick={()=>void save('published')}>{saving?'СОХРАНЯЕМ…':'Опубликовать'}</button>:null}</div></div>
    <div className="admin-editor admin-event-editor-v2">
      <div className="admin-editor-title"><span>УПРАВЛЕНИЕ СОБЫТИЕМ</span><h2>{editor.title||'НОВОЕ\nСОБЫТИЕ'}</h2></div>
      <div className="admin-event-state-strip"><label><span>ПУБЛИКАЦИЯ</span><select value={editor.status} onChange={e=>patch('status',e.target.value as Editor['status'])}><option value="draft">Черновик</option><option value="published">Опубликовано</option><option value="cancelled">Отменено</option></select></label><label><span>ПРОДАЖИ</span><select value={editor.salesState} onChange={e=>patch('salesState',e.target.value as Editor['salesState'])}><option value="coming-soon">Ещё не открыты</option><option value="open">Открыты</option><option value="closed">Закрыты</option></select></label><label><span>ФОРМАТ</span><select value={editor.ticketMode} onChange={e=>patch('ticketMode',e.target.value as Editor['ticketMode'])}><option value="general-admission">Общий вход</option><option value="zones">Зоны</option><option value="seats">Места</option></select></label></div>
      <div className="admin-editor-section"><div className="admin-section-heading"><span>01</span><div><b>ОСНОВНОЕ</b><small>Все изменения сразу относятся к публичной странице события.</small></div></div><div className="admin-form-grid"><label><span>НАЗВАНИЕ</span><input value={editor.title} onChange={e=>patch('title',e.target.value)}/></label><label><span>ДАТА</span><input type="date" value={editor.date} onChange={e=>patch('date',e.target.value)}/></label><label><span>НАЧАЛО</span><input type="time" value={editor.start} onChange={e=>patch('start',e.target.value)}/></label><label><span>ОКОНЧАНИЕ</span><input type="time" value={editor.end} onChange={e=>patch('end',e.target.value)}/></label><label><span>ВОЗРАСТ</span><input value={editor.age} onChange={e=>patch('age',e.target.value)}/></label><label><span>ГОРОД</span><input value={editor.city} onChange={e=>patch('city',e.target.value)}/></label><label><span>ПЛОЩАДКА</span><input value={editor.venue} onChange={e=>patch('venue',e.target.value)}/></label><label><span>АДРЕС</span><input value={editor.address} onChange={e=>patch('address',e.target.value)}/></label><label className="admin-wide"><span>ОПИСАНИЕ</span><textarea value={editor.description} onChange={e=>patch('description',e.target.value)}/></label><label className="admin-wide"><span>ВТОРОЙ АБЗАЦ</span><textarea value={editor.secondaryDescription} onChange={e=>patch('secondaryDescription',e.target.value)}/></label></div></div>
      <div className="admin-editor-section"><div className="admin-section-heading"><span>02</span><div><b>АФИША + АВТОПАЛИТРА</b><small>Загрузи афишу — AGAYO сам выделит её основные цвета и построит из них оформление публичной страницы.</small></div></div>{(posterPreview||editor.posterImage)?<div className="admin-current-poster"><img src={posterPreview||editor.posterImage} alt="Текущая афиша"/><span>{posterPreview?'Новая афиша выбрана':'Текущая афиша'}</span></div>:null}<label className="admin-upload"><input id="admin-event-poster" type="file" accept="image/*" onChange={async e=>{const file=e.currentTarget.files?.[0];if(!file)return;if(file.size>12*1024*1024){setMessage('Афиша больше 12 МБ. Выбери файл поменьше.');e.currentTarget.value='';return;}await analyzePosterPalette(file);if(previewMode){try{const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Не удалось прочитать афишу'));reader.readAsDataURL(file);});patch('posterImage',url);setPosterPreview('');setMessage('Афиша выбрана, автопалитра рассчитана. Нажми «Сохранить изменения».');}catch(err){setMessage(err instanceof Error?err.message:'Ошибка афиши');}}else{setPosterPreview(URL.createObjectURL(file));setMessage('Новая афиша выбрана, палитра страницы пересчитана автоматически. Афиша загрузится при сохранении.');}}}/><strong>＋ ЗАМЕНИТЬ АФИШУ</strong><small>JPG / PNG / WEBP · цвета страницы определяются автоматически</small></label><div className="admin-theme-preview"><div><span>АВТОПАЛИТРА СТРАНИЦЫ</span><small>{paletteStatus}</small></div><div className="admin-swatches" aria-label="Автоматически определённая цветовая палитра"><i style={{background:editor.themePrimary}}/><i style={{background:editor.themeSecondary}}/><i style={{background:editor.themeAccent}}/></div></div></div>
      <div className="admin-editor-section"><div className="admin-section-heading"><span>03</span><div><b>КАТЕГОРИИ И ОСТАТКИ</b><small>Фактический остаток считается по базе. «Горячие билеты» появляются только при остатке 1–4.</small></div></div><div className="admin-ticket-editor-list">{editor.tickets.map((t,i)=>{const remaining=t.inventory===''?null:Math.max(0,Number(t.inventory||0)-t.soldCount);return <article className="admin-ticket-editor-card" key={t.clientKey}><div className="admin-ticket-editor-head"><span>0{i+1}</span><div><b>{t.name||'БИЛЕТ'}</b><small>Продано {t.soldCount}{t.inventory!==''?` из ${t.inventory}`:' · без лимита'}{remaining!==null?` · осталось ${remaining}`:''}</small></div><button type="button" onClick={()=>removeTicket(i)} disabled={t.soldCount>0}>Удалить</button></div><div className="admin-form-grid"><label><span>НАЗВАНИЕ</span><input value={t.name} onChange={e=>patchTicket(i,{name:e.target.value})}/></label><label><span>ЦЕНА, ₽</span><input inputMode="numeric" value={t.price} onChange={e=>patchTicket(i,{price:e.target.value.replace(/\D/g,'')})}/></label><label><span>ЛИМИТ БИЛЕТОВ</span><input inputMode="numeric" value={t.inventory} placeholder="Без лимита" onChange={e=>patchTicket(i,{inventory:e.target.value.replace(/\D/g,'')})}/></label><label className="admin-wide"><span>ОПИСАНИЕ</span><input value={t.note} onChange={e=>patchTicket(i,{note:e.target.value})}/></label></div><label className="admin-hot-toggle"><input type="checkbox" checked={t.hotEnabled} onChange={e=>patchTicket(i,{hotEnabled:e.target.checked})}/><span>Горячие билеты</span><small>{remaining!==null&&remaining>0&&remaining<5?`Сейчас на сайте будет показано: осталось ${remaining}`:'Акцент появится автоматически, когда фактический остаток станет меньше 5.'}</small></label></article>})}</div>{can('manage_ticket_inventory')?<button className="admin-secondary" type="button" onClick={addTicket}>＋ Добавить категорию</button>:null}</div>
      <div className="admin-editor-section"><div className="admin-section-heading"><span>04</span><div><b>ПРОГРАММА</b><small>Время и пункты программы, которые увидит гость на странице события.</small></div></div><div className="admin-program-editor-list">{editor.program.map((item,i)=><article className="admin-program-editor-row" key={item.clientKey}><input type="time" aria-label="Время пункта программы" value={item.time} placeholder="18:00" onChange={e=>patchProgram(i,{time:e.target.value})}/><input aria-label="Название пункта программы" value={item.title} placeholder="Начало программы" onChange={e=>patchProgram(i,{title:e.target.value})}/><button className="admin-secondary" type="button" onClick={()=>removeProgram(i)}>Удалить</button></article>)}</div><button className="admin-secondary" type="button" onClick={addProgram}>＋ Добавить пункт программы</button></div>
      <div className="admin-editor-section"><div className="admin-section-heading"><span>05</span><div><b>УПРАВЛЕНИЕ ПРОДАЖАМИ</b><small>Открытие и закрытие применяется сервером — купить билет при закрытых продажах нельзя.</small></div></div><div className="admin-sales-control"><button type="button" className={editor.salesState==='open'?'is-active':''} onClick={()=>patch('salesState','open')}>ОТКРЫТЬ ПРОДАЖИ</button><button type="button" className={editor.salesState==='coming-soon'?'is-active':''} onClick={()=>patch('salesState','coming-soon')}>СКОРО</button><button type="button" className={editor.salesState==='closed'?'is-active':''} onClick={()=>patch('salesState','closed')}>ЗАКРЫТЬ ПРОДАЖИ</button></div></div>
      <div className="admin-editor-actions"><a className="admin-secondary admin-button-link" href={editor.slug?eventViewHref(editor.slug,editor.status):'#'} target="_blank" rel="noreferrer">{editor.status==='published'?'Открыть страницу':'Предпросмотр страницы'}</a><button className="admin-secondary" disabled={saving} onClick={()=>void save()}>Сохранить изменения</button>{can('publish_events')?<button className="admin-primary" disabled={saving} onClick={()=>void save('published')}>{saving?'СОХРАНЯЕМ…':'СОХРАНИТЬ И ОПУБЛИКОВАТЬ'}</button>:null}</div>{message?<p className="admin-event-message">{message}</p>:null}
    </div>
  </div> }

  return <div className="admin-events-v2">
    <div className="admin-events-heading"><div><span>МЕРОПРИЯТИЯ</span><h2>УПРАВЛЕНИЕ<br/>СОБЫТИЯМИ</h2></div>{canCreate?<button className="admin-primary" type="button" onClick={()=>{setEditor(blank());setStats(null);setPosterPreview('');setPaletteStatus('Цвета страницы определятся автоматически после выбора афиши.');setMessage('')}}>＋ Создать событие</button>:null}</div>
    {message?<p className="admin-event-message">{message}</p>:null}
    {loading?<div className="admin-table-empty"><strong>ОТКРЫВАЕМ СОБЫТИЕ…</strong></div>:null}
    {!loading?<div className="admin-event-list admin-event-list-v2">{visible.length?visible.map(item=>{const d=new Date(item.starts_at);return <article key={item.id} className={item.sales_state==='closed'?'is-archive':''}><div className="admin-event-list-main"><span>{Number.isNaN(+d)?'—':new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(d)}</span><h2>{item.title}</h2><p>{item.status==='published'?'Опубликовано':item.status==='cancelled'?'Отменено':'Черновик'} · {item.sales_state==='open'?'продажи открыты':item.sales_state==='closed'?'продажи закрыты':'скоро'}</p></div><div className="admin-list-actions"><a href={eventViewHref(item.slug,item.status)} target="_blank" rel="noreferrer">{item.status==='published'?'Открыть':'Предпросмотр'}</a>{can('manage_events')?<button type="button" onClick={()=>void openEdit(item)}>Редактировать</button>:null}{can('view_statistics')?<button type="button" onClick={()=>void loadStats(item)}>{statsLoading?'Загрузка…':'Статистика'}</button>:null}</div></article>}):<div className="admin-table-empty"><strong>СОБЫТИЙ ПОКА НЕТ</strong><p>Создай первое мероприятие — категории, продажи и статистика появятся здесь.</p></div>}</div>:null}
    {stats?<section className="admin-event-stats"><div className="admin-panel-head"><span>СТАТИСТИКА · {stats.event.title}</span><button className="admin-secondary" onClick={()=>setStats(null)}>Закрыть</button></div><div className="admin-metrics"><article><span>ВЫРУЧКА</span><strong>{new Intl.NumberFormat('ru-RU').format(stats.metrics.revenue)} ₽</strong><small>{stats.metrics.paid_orders} оплаченных заказов</small></article><article><span>БИЛЕТОВ</span><strong>{stats.metrics.issued}</strong><small>{stats.metrics.valid} действуют</small></article><article><span>ПРОШЛИ</span><strong>{stats.metrics.used}</strong><small>{stats.metrics.issued?Math.round(stats.metrics.used/stats.metrics.issued*100):0}% посещаемость</small></article><article><span>СКИДКИ</span><strong>{new Intl.NumberFormat('ru-RU').format(stats.metrics.discounts)} ₽</strong><small>{stats.metrics.failed_orders} отмен / ошибок</small></article></div><div className="admin-stat-category-list">{stats.categories.map(c=>{const left=c.inventory==null?null:Math.max(0,c.inventory-c.sold);return <article key={c.category_key}><div><span>{c.name}</span><b>{c.sold} продано</b></div><div className="admin-stat-progress"><i style={{width:`${c.inventory?Math.min(100,c.sold/c.inventory*100):0}%`}}/></div><small>{c.inventory==null?'Без лимита':`Лимит ${c.inventory} · осталось ${left}`} · прошли {c.used}</small></article>})}</div>{stats.promo.length?<div className="admin-stat-promos"><span>ПРОМОКОДЫ</span>{stats.promo.map(p=><div key={p.promo_code}><b>{p.promo_code}</b><span>{p.orders} заказов · скидка {p.discount} ₽</span></div>)}</div>:null}</section>:null}
  </div>;
}
