import { useState, useCallback, useEffect } from 'react'
import type { Flat, FlatRating, FlatStatus, RatingCategoryKey } from '../../types/flat'
import { STATUS_OPTIONS, RATING_CATEGORIES } from '../../types/flat'
import { geocodeAddress } from '../../services/geocoding'

const KYIV_CENTER = { lat: 50.4501, lng: 30.5234 }

function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  return iso
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getRatingOverall(rating: FlatRating): number {
  return (
    rating.location + rating.renovation + rating.communications +
    rating.autonomy + rating.price + rating.impression
  )
}

function getRatingBarPercent(rating: FlatRating, key: RatingCategoryKey): number {
  if (rating.votes === 0) return 0
  const sum = rating[key]
  const max = 5 * rating.votes
  return max > 0 ? (sum / max) * 100 : 0
}

function getOverallBarPercent(rating: FlatRating): number {
  if (rating.votes === 0) return 0
  const sum = getRatingOverall(rating)
  const max = 6 * 5 * rating.votes
  return max > 0 ? (sum / max) * 100 : 0
}

interface FlatDetailProps {
  flat: Flat
  onEdit: () => void
  onDelete: () => void
  onUpdate?: (updates: Omit<Partial<Flat>, 'rating'> & { rating?: FlatRating | null }) => void
  onFixCoordinates?: (coordinates: { lat: number; lng: number }) => void
}

export function FlatDetail({ flat, onEdit, onDelete, onUpdate, onFixCoordinates }: FlatDetailProps) {
  const [geocoding, setGeocoding] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const status = flat.status ?? 'цікавить'
  const [showRatingForm, setShowRatingForm] = useState(false)
  const [ratingForm, setRatingForm] = useState<Record<RatingCategoryKey, number>>({
    location: 3,
    renovation: 3,
    communications: 3,
    autonomy: 3,
    price: 3,
    impression: 3
  })
  const hasVotes = flat.rating != null && flat.rating.votes > 0

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (galleryIndex === null) return
      if (e.key === 'Escape') {
        setGalleryIndex(null)
        e.stopImmediatePropagation()
      } else if (e.key === 'ArrowLeft') {
        setGalleryIndex((i) => (i! > 0 ? i! - 1 : flat.photos.length - 1))
      } else if (e.key === 'ArrowRight') {
        setGalleryIndex((i) => (i! < flat.photos.length - 1 ? i! + 1 : 0))
      }
    },
    [galleryIndex, flat.photos.length]
  )
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  const isDefaultCoords =
    Math.abs(flat.coordinates.lat - KYIV_CENTER.lat) < 0.0001 &&
    Math.abs(flat.coordinates.lng - KYIV_CENTER.lng) < 0.0001

  const handleGeocode = async () => {
    if (!flat.address.trim() || !onFixCoordinates) return
    setGeocoding(true)
    try {
      const coords = await geocodeAddress(flat.address)
      if (coords) onFixCoordinates(coords)
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <div className="flat-detail">
      <div className="flat-detail__header">
        <div className="flat-detail__actions">
          <button type="button" className="btn flat-detail__action-btn" onClick={onEdit}>
            Редагувати
          </button>
          <button
            type="button"
            className="btn btn--danger flat-detail__action-btn"
            onClick={onDelete}
          >
            Видалити
          </button>
          {flat.sourceUrl && (
            <a
              href={flat.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flat-detail__source-btn"
              title="Посилання на оголошення"
              aria-label="Посилання на оголошення"
            >
              ↗
            </a>
          )}
        </div>
      </div>
      {isDefaultCoords && flat.address.trim() && onFixCoordinates && (
        <div className="flat-detail__geocode">
          <button
            type="button"
            className="btn btn--small"
            onClick={handleGeocode}
            disabled={geocoding}
          >
            {geocoding ? '…' : 'Отримати координати на карті'}
          </button>
        </div>
      )}
      <div className="flat-detail__meta">
        ${flat.priceUsd.toLocaleString()}
        {flat.rooms != null && <> · {flat.rooms} кімн.</>}
        {flat.areaSqm != null && <> · {flat.areaSqm} m²</>}
        {flat.buildingMaterial && <> · {flat.buildingMaterial}</>}
        {flat.buildingEra && <> · {flat.buildingEra}</>}
        {flat.constructionYear && <> · {flat.constructionYear} р.</>}
        {flat.floor && <> · {flat.floor} поверх</>}
        {flat.commission != null && flat.commission > 0 && (
          <> · Комісія {flat.commission}%</>
        )}
        {flat.publishedAt && <> · З {formatDate(flat.publishedAt)}</>}
      </div>
      <div className="flat-detail__section flat-detail__section--status">
        <strong>Статус</strong>
        <div className="flat-detail__status-row">
          <select
            value={status}
            onChange={(e) => onUpdate?.({ status: e.target.value as FlatStatus })}
            className="flat-detail__status-select"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        {status === 'перегляд' && (
          <div className="flat-detail__view-date">
            <label htmlFor="view-date">Дата та час перегляду</label>
            <input
              id="view-date"
              type="datetime-local"
              value={flat.viewDate ? toDatetimeLocal(flat.viewDate) : ''}
              onChange={(e) => {
                const v = e.target.value
                if (v) onUpdate?.({ viewDate: new Date(v).toISOString() })
              }}
              className="flat-detail__datetime-input"
            />
            {flat.viewDate && (
              <span className="flat-detail__view-date-display">
                {formatDateTime(flat.viewDate)}
              </span>
            )}
          </div>
        )}
        {status === 'враження' && (
          <div className="flat-detail__rating">
            {!hasVotes && !showRatingForm && (
              <button
                type="button"
                className="btn btn--primary flat-detail__vote-btn"
                onClick={() => setShowRatingForm(true)}
              >
                Голосувати
              </button>
            )}
            {showRatingForm && (
              <div className="flat-detail__rating-form">
                {showRatingForm && (
                  <>
                    <p className="flat-detail__rating-form-title">Оцініть квартиру</p>
                    {RATING_CATEGORIES.map(({ key, label }) => (
                      <div key={key} className="flat-detail__rating-row">
                        <label>{label}</label>
                        <div className="flat-detail__rating-stars">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              className={`flat-detail__star ${ratingForm[key] >= n ? 'flat-detail__star--active' : ''}`}
                              onClick={() =>
                                setRatingForm((f) => ({ ...f, [key]: n }))
                              }
                            >
                              ★
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn--primary flat-detail__rating-submit"
                      onClick={() => {
                        const r = flat.rating
                        const next: FlatRating = {
                          location: (r?.location ?? 0) + ratingForm.location,
                          renovation: (r?.renovation ?? 0) + ratingForm.renovation,
                          communications: (r?.communications ?? 0) + ratingForm.communications,
                          autonomy: (r?.autonomy ?? 0) + ratingForm.autonomy,
                          price: (r?.price ?? 0) + ratingForm.price,
                          impression: (r?.impression ?? 0) + ratingForm.impression,
                          votes: (r?.votes ?? 0) + 1
                        }
                        onUpdate?.({ rating: next })
                        setShowRatingForm(false)
                      }}
                    >
                      Підтвердити
                    </button>
                  </>
                )}
              </div>
            )}
            {hasVotes && !showRatingForm && (
              <div className="flat-detail__rating-display">
                <div className="flat-detail__rating-display-header">
                  <p className="flat-detail__rating-display-title">
                    Рейтинг ({flat.rating!.votes} {flat.rating!.votes === 1 ? 'голос' : 'голосів'})
                  </p>
                  <button
                    type="button"
                    className="btn btn--small btn--primary"
                    onClick={() => setShowRatingForm(true)}
                  >
                    Голосувати
                  </button>
                </div>
                <div className="flat-detail__rating-bars">
                  {RATING_CATEGORIES.map(({ key, label }) => {
                    const sum = flat.rating![key]
                    const max = 5 * flat.rating!.votes
                    const pct = getRatingBarPercent(flat.rating!, key)
                    return (
                      <div key={key} className="flat-detail__rating-bar-row">
                        <div className="flat-detail__rating-bar-header">
                          <span className="flat-detail__rating-bar-label">{label}</span>
                          <span className="flat-detail__rating-bar-value">{sum} / {max}</span>
                        </div>
                        <div className="flat-detail__rating-bar-track">
                          <div
                            className="flat-detail__rating-bar-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                  <div className="flat-detail__rating-bar-row flat-detail__rating-overall">
                    <div className="flat-detail__rating-bar-header">
                      <span className="flat-detail__rating-bar-label">Загальний</span>
                      <span className="flat-detail__rating-bar-value">
                        {getRatingOverall(flat.rating!)} / {6 * 5 * flat.rating!.votes}
                      </span>
                    </div>
                    <div className="flat-detail__rating-bar-track">
                      <div
                        className="flat-detail__rating-bar-fill flat-detail__rating-bar-fill--overall"
                        style={{ width: `${getOverallBarPercent(flat.rating!)}%` }}
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--small flat-detail__clear-rating"
                  onClick={() => onUpdate?.({ rating: null })}
                >
                  Очистити рейтинг
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {flat.photos.length > 0 && (
        <div className="flat-detail__photos">
          {flat.photos.map((url, i) => (
            <button
              key={url}
              type="button"
              className="flat-detail__photo-thumb"
              onClick={() => setGalleryIndex(i)}
            >
              <img src={url} alt="" />
            </button>
          ))}
        </div>
      )}
      {galleryIndex !== null && (
        <div
          className="flat-detail__gallery"
          onClick={() => setGalleryIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="flat-detail__gallery-close"
            onClick={() => setGalleryIndex(null)}
            aria-label="Закрити"
          >
            ×
          </button>
          {flat.photos.length > 1 && (
            <>
              <button
                type="button"
                className="flat-detail__gallery-prev"
                onClick={(e) => {
                  e.stopPropagation()
                  setGalleryIndex((i) => (i! > 0 ? i! - 1 : flat.photos.length - 1))
                }}
                aria-label="Попереднє"
              >
                ‹
              </button>
              <button
                type="button"
                className="flat-detail__gallery-next"
                onClick={(e) => {
                  e.stopPropagation()
                  setGalleryIndex((i) => (i! < flat.photos.length - 1 ? i! + 1 : 0))
                }}
                aria-label="Наступне"
              >
                ›
              </button>
            </>
          )}
          <div className="flat-detail__gallery-img-wrap" onClick={(e) => e.stopPropagation()}>
            <img src={flat.photos[galleryIndex]} alt="" />
          </div>
          {flat.photos.length > 1 && (
            <span className="flat-detail__gallery-counter">
              {galleryIndex + 1} / {flat.photos.length}
            </span>
          )}
        </div>
      )}
      {(flat.appearance || flat.buildingMaterial || flat.buildingEra || flat.constructionYear) && (
        <div className="flat-detail__section">
          <strong>Квартира</strong>
          <p>
            {flat.appearance && <>{flat.appearance}</>}
            {flat.appearance && (flat.buildingMaterial || flat.buildingEra || flat.constructionYear) && ' · '}
            {flat.buildingMaterial && <>{flat.buildingMaterial}</>}
            {flat.buildingMaterial && (flat.buildingEra || flat.constructionYear) && ' · '}
            {flat.buildingEra && <>{flat.buildingEra}</>}
            {flat.buildingEra && flat.constructionYear && ' · '}
            {flat.constructionYear && <>{flat.constructionYear} р. буд.</>}
          </p>
        </div>
      )}
      {(flat.sellerPhone || flat.sellerName || flat.sellerType || flat.sellerContacts) && (
        <div className="flat-detail__section">
          <strong>Контакти продавця</strong>
          <p>
            {flat.sellerPhone && <>{flat.sellerPhone}<br /></>}
            {flat.sellerName && <>{flat.sellerName}<br /></>}
            {flat.sellerType && <>{flat.sellerType}<br /></>}
            {flat.sellerContacts && flat.sellerContacts}
          </p>
        </div>
      )}
      {flat.details && (
        <div className="flat-detail__section flat-detail__section--details">
          <strong>Деталі</strong>
          <div className="flat-detail__details-body">
            {flat.details.split(/\n\n+/).map((para, i) => (
              <p key={i} className="flat-detail__details-text">
                {para.trim().split('\n').map((line, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {line}
                  </span>
                ))}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
