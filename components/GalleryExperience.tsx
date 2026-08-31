"use client";

import Image from "next/image";
import Link from "next/link";
import { TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import FavoriteButton from "@/components/FavoriteButton";
import { events } from "@/lib/events";
import { galleryPhotos, GalleryPhoto } from "@/lib/photos";

type SortMode = "newest" | "oldest";

const publishedEvents = events.filter((event) => event.status === "published");

function searchableDate(value: string) {
  return value.replace(/[.\-/]/g, " ");
}

export default function GalleryExperience() {
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  const eventBySlug = useMemo(
    () => new Map(publishedEvents.map((event) => [event.slug, event])),
    []
  );

  const filteredPhotos = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru-RU");

    return [...galleryPhotos]
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
  }, [eventBySlug, eventFilter, query, sortMode]);

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
          <span>{matchingEventCount} МЕРОПРИЯТИЯ</span>
          <span>{filteredPhotos.length} ФОТОГРАФИЙ</span>
        </div>
      </section>

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
                      src={photo.src}
                      alt={`${event.title} — ${event.dateLabel}`}
                      fill
                      sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 42vw"
                      className="gallery-editorial-image"
                    />
                  </button>
                  <FavoriteButton photoId={photo.id} />
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
        </section>
      ) : (
        <section className="gallery-empty">
          <span>НИЧЕГО НЕ НАШЛИ</span>
          <h2>ПОПРОБУЙ<br />ДРУГУЮ ДАТУ</h2>
          <p>Можно искать по названию мероприятия или ввести дату, например 29.08.26.</p>
          <button type="button" onClick={() => { setQuery(""); setEventFilter("all"); }}>
            СБРОСИТЬ ФИЛЬТРЫ ↗
          </button>
        </section>
      )}

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
  return (
    <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={`${eventTitle}, фотография ${position}`}>
      <button type="button" className="gallery-lightbox-close" onClick={onClose} aria-label="Закрыть фотографию">×</button>
      <div className="gallery-lightbox-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <Image src={photo.src} alt={`${eventTitle} — ${eventDate}`} fill sizes="100vw" className="gallery-lightbox-image" priority />
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
          <FavoriteButton photoId={photo.id} />
        </div>
      </div>
    </div>
  );
}
