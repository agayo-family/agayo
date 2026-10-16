"use client";

import Image from "next/image";
import Link from "next/link";
import { TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import FavoriteButton from "@/components/FavoriteButton";
import { GalleryPhoto } from "@/lib/photos";

type SortMode = "newest" | "oldest";
type GalleryEvent = { slug:string; title:string; dateLabel:string; startsAt:string; city:string };

function searchableDate(value: string) {
  return value.replace(/[.\-/]/g, " ");
}

export default function GalleryExperience({ photos, total, publishedEvents, notice='' }: { photos: GalleryPhoto[]; total: number; publishedEvents: GalleryEvent[]; notice?:string }) {
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [loadedPhotos, setLoadedPhotos] = useState(photos);
  const [totalPhotos, setTotalPhotos] = useState(total);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(notice);
  const initial = useRef(true);
  const moreRequest = useRef<AbortController | null>(null);
  const touchStartX = useRef<number | null>(null);

  const eventBySlug = useMemo(
    () => new Map(publishedEvents.map((event) => [event.slug, event])),
    [publishedEvents]
  );

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("event");
    if (slug && publishedEvents.some((event) => event.slug === slug)) setEventFilter(slug);
  }, [publishedEvents]);

  const matchingSlugs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    return publishedEvents.filter(event => {
      if (eventFilter !== 'all' && event.slug !== eventFilter) return false;
      const haystack = [event.title,event.dateLabel,searchableDate(event.dateLabel),event.city].join(' ').toLocaleLowerCase('ru-RU');
      return !normalized || haystack.includes(normalized) || haystack.includes(searchableDate(normalized));
    }).map(event => event.slug).join(',');
  }, [publishedEvents, query, eventFilter]);

  useEffect(() => {
    moreRequest.current?.abort();
    if (initial.current && !query && eventFilter === 'all' && sortMode === 'newest') { initial.current = false; return; }
    initial.current = false;
    const abort = new AbortController();
    setLoading(true); setLoadError(''); setActivePhotoId(null);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/gallery?events=${encodeURIComponent(matchingSlugs)}&sort=${sortMode}`, { signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить фотографии');
        setLoadedPhotos(data.photos); setTotalPhotos(data.total);
      } catch (error) { if (!abort.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Ошибка загрузки'); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [matchingSlugs, sortMode, query, eventFilter]);

  useEffect(() => () => moreRequest.current?.abort(), []);

  async function loadMore() {
    const abort = new AbortController(); moreRequest.current = abort;
    setLoading(true); setLoadError('');
    try {
      const response = await fetch(`/api/gallery?events=${encodeURIComponent(matchingSlugs)}&sort=${sortMode}&offset=${loadedPhotos.length}`, { signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось загрузить фотографии');
      setLoadedPhotos(current => [...current, ...data.photos.filter((photo: GalleryPhoto) => !current.some(item => item.id === photo.id))]);
      setTotalPhotos(data.total);
    } catch (error) { if (!abort.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Ошибка загрузки'); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }

  const filteredPhotos = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");

    return [...loadedPhotos]
      .filter((photo) => {
        const event = eventBySlug.get(photo.eventSlug);
        if (!event) return false;
        if (eventFilter !== "all" && photo.eventSlug !== eventFilter) return false;
        if (!normalized) return true;

        const haystack = [
          event.title,
          event.dateLabel,
          searchableDate(event.dateLabel),
          event.city,
        ]
          .join(" ")
          .toLocaleLowerCase("ru-RU");

        return haystack.includes(normalized) || haystack.includes(searchableDate(normalized));
      })
      .sort((a, b) => {
        const aDate = Date.parse(eventBySlug.get(a.eventSlug)?.startsAt ?? "");
        const bDate = Date.parse(eventBySlug.get(b.eventSlug)?.startsAt ?? "");
        return sortMode === "newest" ? bDate - aDate : aDate - bDate;
      });
  }, [eventBySlug, eventFilter, query, sortMode, loadedPhotos]);

  const activeIndex = activePhotoId
    ? filteredPhotos.findIndex((photo) => photo.id === activePhotoId)
    : -1;
  const activePhoto = activeIndex >= 0 ? filteredPhotos[activeIndex] : null;

  function moveLightbox(direction: -1 | 1) {
    if (!filteredPhotos.length || activeIndex < 0) return;
    const next = (activeIndex + direction + filteredPhotos.length) % filteredPhotos.length;
    setActivePhotoId(filteredPhotos[next].id);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 45) return;
    moveLightbox(delta > 0 ? -1 : 1);
  }

  useEffect(() => {
    if (!activePhotoId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActivePhotoId(null);
      if (event.key === "ArrowLeft") moveLightbox(-1);
      if (event.key === "ArrowRight") moveLightbox(1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activePhotoId, activeIndex, filteredPhotos]);

  const matchingEventCount = new Set(filteredPhotos.map((photo) => photo.eventSlug)).size;

  return (
    <>
      <section className="gallery-controls" aria-label="Поиск и фильтры галереи">
        <label className="gallery-search">
          <span>ПОИСК</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Мероприятие или дата — 29.08.26"
            aria-label="Найти мероприятие по названию или дате"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск">
              ×
            </button>
          )}
        </label>

        <div className="gallery-filter-row">
          <div className="gallery-event-filters" aria-label="Фильтр по мероприятию">
            <button
              type="button"
              className={eventFilter === "all" ? "is-active" : ""}
              onClick={() => setEventFilter("all")}
            >
              ВСЕ
            </button>
            {publishedEvents.map((event) => (
              <button
                type="button"
                key={event.slug}
                className={eventFilter === event.slug ? "is-active" : ""}
                onClick={() => setEventFilter(event.slug)}
              >
                {event.title}
              </button>
            ))}
          </div>

          <label className="gallery-sort">
            <span>ПОРЯДОК</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="newest">НОВЫЕ СНАЧАЛА</option>
              <option value="oldest">СТАРЫЕ СНАЧАЛА</option>
            </select>
          </label>
        </div>

        <div className="gallery-result-meta" aria-live="polite">
          <span>ПОКАЗАНО {matchingEventCount} МЕРОПРИЯТИЙ</span>
          <span>{totalPhotos} ФОТОГРАФИЙ</span>
        </div>
      </section>

      {loading || loadError ? <p className="gallery-fetch-message" role="status">{loading ? 'Загружаем фотографии…' : loadError}</p> : null}

      {filteredPhotos.length ? (
        <section className="gallery-editorial-grid" aria-label="Фотографии AGAYO">
          {filteredPhotos.map((photo, index) => {
            const event = eventBySlug.get(photo.eventSlug);
            if (!event) return null;
            return (
              <article className={`gallery-editorial-card gallery-editorial-card-${(index % 7) + 1}`} key={photo.id}>
                <div className="gallery-editorial-image-wrap">
                  <button
                    type="button"
                    className="gallery-photo-open"
                    onClick={() => setActivePhotoId(photo.id)}
                    aria-label={`Открыть фотографию ${event.title}`}
                  >
                    <Image
                      src={photo.src} unoptimized={photo.id.startsWith('vk:')}
                      alt={`${event.title} — ${event.dateLabel}`}
                      fill
                      sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 42vw"
                      className="gallery-editorial-image"
                    />
                  </button>
                  {!photo.id.startsWith('vk:') ? <FavoriteButton photoId={photo.id} /> : null}
                  <div className="gallery-photo-index">{String(index + 1).padStart(2, "0")}</div>
                </div>
                <div className="gallery-editorial-caption">
                  <div>
                    <strong>{event.title}</strong>
                    <span>{event.dateLabel}</span>
                  </div>
                  <Link href={`/events/${event.slug}`}>О СОБЫТИИ ↗</Link>
                </div>
              </article>
            );
          })}
          {loadedPhotos.length < totalPhotos && <div className="gallery-load-more"><button className="button-link" type="button" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Загружаем…' : 'Ещё фотографии'} <span>↓</span></button><p>Показано {filteredPhotos.length} из {totalPhotos}</p></div>}
        </section>
      ) : !loading && !loadError ? (
        <section className="gallery-empty">
          <span>НИЧЕГО НЕ НАШЛИ</span>
          <h2>ПОПРОБУЙ<br />ДРУГУЮ ДАТУ</h2>
          <p>Можно искать по названию мероприятия или ввести дату, например 29.08.26.</p>
          <button type="button" onClick={() => { setQuery(""); setEventFilter("all"); }}>
            СБРОСИТЬ ФИЛЬТРЫ ↗
          </button>
        </section>
      ) : null}

      {activePhoto && (
        <Lightbox
          photo={activePhoto}
          eventTitle={eventBySlug.get(activePhoto.eventSlug)?.title ?? activePhoto.eventTitle}
          eventDate={eventBySlug.get(activePhoto.eventSlug)?.dateLabel ?? ""}
          position={activeIndex + 1}
          total={filteredPhotos.length}
          onClose={() => setActivePhotoId(null)}
          onPrevious={() => moveLightbox(-1)}
          onNext={() => moveLightbox(1)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        />
      )}
    </>
  );
}

function Lightbox({
  photo,
  eventTitle,
  eventDate,
  position,
  total,
  onClose,
  onPrevious,
  onNext,
  onTouchStart,
  onTouchEnd,
}: {
  photo: GalleryPhoto;
  eventTitle: string;
  eventDate: string;
  position: number;
  total: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onTouchStart: (event: TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (event: TouchEvent<HTMLDivElement>) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  return (
    <div ref={dialogRef} onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") ?? []).filter((element) => element.getClientRects().length > 0);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }} className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={`${eventTitle}, фотография ${position}`}>
      <button type="button" className="gallery-lightbox-close" onClick={onClose} aria-label="Закрыть фотографию">×</button>
      <div className="gallery-lightbox-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <Image src={photo.src} unoptimized={photo.id.startsWith('vk:')} alt={`${eventTitle} — ${eventDate}`} fill sizes="100vw" className="gallery-lightbox-image" priority />
        <button type="button" className="gallery-lightbox-nav gallery-lightbox-prev" onClick={onPrevious} aria-label="Предыдущая фотография">←</button>
        <button type="button" className="gallery-lightbox-nav gallery-lightbox-next" onClick={onNext} aria-label="Следующая фотография">→</button>
      </div>
      <div className="gallery-lightbox-footer">
        <div>
          <span>{eventDate}</span>
          <strong>{eventTitle}</strong>
        </div>
        <div className="gallery-lightbox-actions">
          <span>{String(position).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
          {!photo.id.startsWith('vk:') ? <FavoriteButton photoId={photo.id} /> : null}
        </div>
      </div>
    </div>
  );
}
