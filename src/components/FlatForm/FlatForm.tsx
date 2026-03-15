import { useState, useEffect } from 'react'
import type { Flat } from '../../types/flat'
import { APPEARANCE_OPTIONS, BUILDING_TYPE_OPTIONS, SELLER_TYPE_OPTIONS } from '../../types/flat'
import { parseListingUrl } from '../../services/firebase'
import { geocodeAddress as geocode } from '../../services/geocoding'
import type { SearchLocation } from '../Map/MapView'

interface FlatFormProps {
  flat?: Flat | null
  initialData?: { address: string; coordinates: { lat: number; lng: number } } | null
  onSave: (data: FlatFormData) => void
  onCancel: () => void
  uploadPhoto: (file: File, flatId: string) => Promise<string>
  saveError?: string | null
  isSaving?: boolean
  onParsedLocation?: (location: SearchLocation) => void
}

export interface FlatFormData {
  address: string
  coordinates: { lat: number; lng: number }
  priceUsd: number
  areaSqm: number
  sourceUrl: string
  appearance?: string
  buildingType?: string
  floor?: string
  infrastructure?: string[]
  parksNearby?: string[]
  commission?: number
  photos: string[]
  sellerPhone?: string
  sellerName?: string
  sellerType?: string
  details?: string
  publishedAt?: string
}

const emptyForm: FlatFormData = {
  address: '',
  coordinates: { lat: 50.4501, lng: 30.5234 },
  priceUsd: 0,
  areaSqm: 0,
  sourceUrl: '',
  photos: []
}

export function FlatForm({
  flat,
  initialData,
  onSave,
  onCancel,
  uploadPhoto,
  saveError,
  isSaving,
  onParsedLocation
}: FlatFormProps) {
  const [form, setForm] = useState<FlatFormData>(emptyForm)
  const [geocoding, setGeocoding] = useState(false)
  const [parsingUrl, setParsingUrl] = useState(false)
  const [submitGeocoding, setSubmitGeocoding] = useState(false)

  const KYIV_CENTER = { lat: 50.4501, lng: 30.5234 }
  const isDefaultCoords =
    Math.abs(form.coordinates.lat - KYIV_CENTER.lat) < 0.0001 &&
    Math.abs(form.coordinates.lng - KYIV_CENTER.lng) < 0.0001

  useEffect(() => {
    if (flat) {
      setForm({
        address: flat.address,
        coordinates: flat.coordinates,
        priceUsd: flat.priceUsd,
        areaSqm: flat.areaSqm,
        sourceUrl: flat.sourceUrl ?? '',
        appearance: flat.appearance,
        buildingType: flat.buildingType,
        floor: flat.floor,
        infrastructure: flat.infrastructure ?? [],
        parksNearby: flat.parksNearby ?? [],
        commission: flat.commission,
        photos: flat.photos ?? [],
        sellerPhone: flat.sellerPhone,
        sellerName: flat.sellerName,
        sellerType: flat.sellerType,
        details: flat.details,
        publishedAt: flat.publishedAt
      })
    } else if (initialData) {
      setForm({
        ...emptyForm,
        address: initialData.address,
        coordinates: initialData.coordinates
      })
    } else {
      setForm(emptyForm)
    }
  }, [flat, initialData])

  const geocodeAddress = async () => {
    if (!form.address.trim()) return
    setGeocoding(true)
    try {
      const coords = await geocode(form.address)
      if (coords) {
        setForm((f) => ({ ...f, coordinates: coords }))
      }
    } finally {
      setGeocoding(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length || !flat?.id) return
    const url = await uploadPhoto(files[0], flat.id)
    setForm((f) => ({ ...f, photos: [...f.photos, url] }))
  }

  const handleParseUrl = async () => {
    if (!form.sourceUrl.trim()) return
    setParsingUrl(true)
    try {
      const { data } = await parseListingUrl({ url: form.sourceUrl.trim() })
      const d = data as {
        address?: string
        priceUsd?: number
        areaSqm?: number
        details?: string
        buildingType?: string
        floor?: string
        commission?: number
        sellerType?: string
        sellerName?: string
        appearance?: string
        infrastructure?: string[]
        photos?: string[]
        publishedAt?: string
      }
      setForm((f) => ({
        ...f,
        address: d.address ?? f.address,
        priceUsd: d.priceUsd ?? f.priceUsd,
        areaSqm: d.areaSqm ?? f.areaSqm,
        sourceUrl: f.sourceUrl.trim(),
        details: d.details ?? f.details,
        buildingType: d.buildingType ?? f.buildingType,
        floor: d.floor ?? f.floor,
        commission: d.commission ?? f.commission,
        sellerType: d.sellerType ?? f.sellerType,
        sellerName: d.sellerName ?? f.sellerName,
        appearance: d.appearance ?? f.appearance,
        infrastructure: d.infrastructure ?? f.infrastructure ?? [],
        photos: d.photos?.length ? d.photos : f.photos,
        publishedAt: d.publishedAt ?? f.publishedAt
      }))

      // Geocode and show on map
      const address = d.address ?? ''
      if (address) {
        const coords = await geocode(address)
        if (coords) {
          setForm((prev) => ({ ...prev, coordinates: coords }))
          onParsedLocation?.({ address, coordinates: coords })
        }
      }
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Не вдалося завантажити')
    } finally {
      setParsingUrl(false)
    }
  }

  const geocodeIfNeeded = async (): Promise<FlatFormData> => {
    if (!isDefaultCoords || !form.address.trim()) return form
    const coords = await geocode(form.address)
    if (coords) {
      return { ...form, coordinates: coords }
    }
    return form
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitGeocoding(isDefaultCoords && !!form.address.trim())
    try {
      const dataToSave = await geocodeIfNeeded()
      onSave(dataToSave)
    } finally {
      setSubmitGeocoding(false)
    }
  }

  return (
    <div className="flat-form">
      <form onSubmit={handleSubmit}>
        {saveError && <div className="flat-form__error">{saveError}</div>}
        <div className="flat-form__field">
          <label>Посилання на оголошення *</label>
          <div className="flat-form__input-group">
            <input
              type="url"
              placeholder="dom.ria / lun.ua"
              value={form.sourceUrl}
              onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
              required
            />
            <button type="button" className="btn btn--small" onClick={handleParseUrl} disabled={parsingUrl || !form.sourceUrl.trim()}>
              {parsingUrl ? '…' : 'Завантажити'}
            </button>
          </div>
        </div>
        <div className="flat-form__field">
          <label>Адреса *</label>
          <div className="flat-form__input-group">
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              required
            />
            <button type="button" className="btn btn--small" onClick={geocodeAddress} disabled={geocoding || !form.address.trim()}>
              {geocoding ? '…' : 'Координати'}
            </button>
          </div>
        </div>
        <div className="flat-form__row flat-form__row--3">
          <div className="flat-form__field">
            <label>Ціна $ *</label>
            <input type="number" min={0} value={form.priceUsd || ''} onChange={(e) => setForm((f) => ({ ...f, priceUsd: Number(e.target.value) || 0 }))} required />
          </div>
          <div className="flat-form__field">
            <label>Площа м² *</label>
            <input type="number" min={0} step={0.1} value={form.areaSqm || ''} onChange={(e) => setForm((f) => ({ ...f, areaSqm: Number(e.target.value) || 0 }))} required />
          </div>
          <div className="flat-form__field">
            <label>Комісія %</label>
            <input type="number" min={0} max={100} value={form.commission ?? ''} onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value ? Number(e.target.value) : undefined }))} />
          </div>
        </div>
        <div className="flat-form__row flat-form__row--2">
          <div className="flat-form__field">
            <label>Стан</label>
            <select value={form.appearance ?? ''} onChange={(e) => setForm((f) => ({ ...f, appearance: e.target.value || undefined }))}>
              <option value="">—</option>
              {APPEARANCE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="flat-form__field">
            <label>Будинок</label>
            <select value={form.buildingType ?? ''} onChange={(e) => setForm((f) => ({ ...f, buildingType: e.target.value || undefined }))}>
              <option value="">—</option>
              {BUILDING_TYPE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>
        <div className="flat-form__row flat-form__row--2">
          <div className="flat-form__field">
            <label>Поверх</label>
            <input type="text" placeholder="4 з 5" value={form.floor ?? ''} onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value || undefined }))} />
          </div>
          <div className="flat-form__field">
            <label>Продавець</label>
            <select value={form.sellerType ?? ''} onChange={(e) => setForm((f) => ({ ...f, sellerType: e.target.value || undefined }))}>
              <option value="">—</option>
              {SELLER_TYPE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>
        <div className="flat-form__row flat-form__row--2">
          <div className="flat-form__field">
            <label>Імʼя</label>
            <input type="text" placeholder="Контактна особа" value={form.sellerName ?? ''} onChange={(e) => setForm((f) => ({ ...f, sellerName: e.target.value }))} />
          </div>
          <div className="flat-form__field">
            <label>Телефон</label>
            <input type="tel" value={form.sellerPhone ?? ''} onChange={(e) => setForm((f) => ({ ...f, sellerPhone: e.target.value }))} />
          </div>
        </div>
        <div className="flat-form__field">
          <label>Деталі</label>
          <textarea value={form.details ?? ''} onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))} rows={2} placeholder="Додаткова інформація" />
        </div>
        {(flat || form.photos.length > 0) && (
          <div className="flat-form__field">
            <label>Фото</label>
            {flat && (
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
              />
            )}
            {form.photos.length > 0 && (
              <div className="flat-form__photos">
                {form.photos.map((url) => (
                  <div key={url} className="flat-form__photo-wrap">
                    <img src={url} alt="" width={64} height={64} />
                    <button
                      type="button"
                      className="flat-form__photo-remove"
                      onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((p) => p !== url) }))}
                      aria-label="Видалити фото"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flat-form__actions">
          <button type="button" className="btn" onClick={onCancel}>
            Скасувати
          </button>
          <button type="submit" className="btn btn--primary" disabled={isSaving || submitGeocoding}>
            {submitGeocoding ? 'Координати…' : isSaving ? 'Збереження…' : 'Зберегти'}
          </button>
        </div>
      </form>
    </div>
  )
}
