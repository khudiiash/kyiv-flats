import { useState, useEffect, useRef } from 'react'
import type { Flat } from '../../types/flat'
import { APPEARANCE_OPTIONS, BUILDING_MATERIAL_OPTIONS, BUILDING_ERA_OPTIONS, SELLER_TYPE_OPTIONS } from '../../types/flat'
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
  rooms?: number
  sourceUrl: string
  appearance?: string
  buildingMaterial?: string
  buildingEra?: string
  constructionYear?: number
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

function inferBuildingEraFromYear(year: number): 'сталінка' | 'хрущівка' | 'новобудова' {
  if (year >= 1995) return 'новобудова'
  if (year >= 1956) return 'хрущівка'
  if (year >= 1930) return 'сталінка'
  return 'хрущівка'
}

function inferAppearanceFromEra(era: string): string {
  if (era === 'сталінка' || era === 'хрущівка') return 'радянський ремонт'
  if (era === 'новобудова') return 'євро ремонт'
  return ''
}

function isValidAppearance(val: string | undefined): boolean {
  return !!val && APPEARANCE_OPTIONS.includes(val as (typeof APPEARANCE_OPTIONS)[number])
}

function normalizeListingUrl(url: string): string {
  try {
    const parsed = new URL(url.trim())
    if (parsed.hostname === 'apps.lun.ua') {
      parsed.hostname = 'lun.ua'
      parsed.search = ''
    } else if (parsed.search) {
      parsed.search = ''
    }
    return parsed.toString()
  } catch {
    return url.trim()
  }
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
  const [parsingUrl, setParsingUrl] = useState(false)
  const [submitGeocoding, setSubmitGeocoding] = useState(false)
  const geocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastGeocodedAddressRef = useRef<string>('')

  const KYIV_CENTER = { lat: 50.4501, lng: 30.5234 }
  const isDefaultCoords =
    Math.abs(form.coordinates.lat - KYIV_CENTER.lat) < 0.0001 &&
    Math.abs(form.coordinates.lng - KYIV_CENTER.lng) < 0.0001

  useEffect(() => {
    if (flat) {
      let appearance = flat.appearance
      let buildingEra = flat.buildingEra
      const year = flat.constructionYear
      if (!buildingEra && year != null && year >= 1900 && year <= 2030) {
        buildingEra = inferBuildingEraFromYear(year)
      }
      if (!isValidAppearance(appearance) && buildingEra) {
        const inferred = inferAppearanceFromEra(buildingEra)
        if (inferred) appearance = inferred
      }
      setForm({
        address: flat.address,
        coordinates: flat.coordinates,
        priceUsd: flat.priceUsd,
        areaSqm: flat.areaSqm,
        rooms: flat.rooms,
        sourceUrl: flat.sourceUrl ?? '',
        appearance,
        buildingMaterial: flat.buildingMaterial,
        buildingEra,
        constructionYear: flat.constructionYear,
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

  // Sync lastGeocodedAddress when loading from flat/initialData
  useEffect(() => {
    if (flat) lastGeocodedAddressRef.current = flat.address ?? ''
    else if (initialData) lastGeocodedAddressRef.current = initialData.address ?? ''
    else lastGeocodedAddressRef.current = ''
  }, [flat, initialData])

  useEffect(() => {
    const addr = form.address.trim()
    if (!addr || addr.length < 5 || addr === lastGeocodedAddressRef.current) return
    if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current)
    geocodeTimeoutRef.current = setTimeout(async () => {
      geocodeTimeoutRef.current = null
      try {
        const coords = await geocode(addr)
        if (coords) {
          lastGeocodedAddressRef.current = addr
          setForm((f) => ({ ...f, coordinates: coords }))
          onParsedLocation?.({ address: addr, coordinates: coords })
        }
      } catch {
        console.warn('Geocoding error:', addr)
      }
    }, 600)
    return () => {
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current)
    }
  }, [form.address, onParsedLocation])

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
      const urlToParse = normalizeListingUrl(form.sourceUrl)
      const { data } = await parseListingUrl({ url: urlToParse })
      const d = data as {
        address?: string
        priceUsd?: number
        areaSqm?: number
        rooms?: number
        details?: string
        buildingMaterial?: string
        buildingEra?: string
        constructionYear?: number
        floor?: string
        commission?: number
        sellerType?: string
        sellerName?: string
        appearance?: string
        infrastructure?: string[]
        photos?: string[]
        publishedAt?: string
      }
      setForm((f) => {
        let buildingEra = d.buildingEra ?? f.buildingEra
        let appearance = d.appearance ?? f.appearance
        const year = d.constructionYear ?? f.constructionYear
        if (!buildingEra && year != null && year >= 1900 && year <= 2030) {
          buildingEra = inferBuildingEraFromYear(year)
        }
        if (!isValidAppearance(appearance) && buildingEra) {
          const inferred = inferAppearanceFromEra(buildingEra)
          if (inferred) appearance = inferred
        }
        return {
          ...f,
          address: d.address ?? f.address,
          priceUsd: d.priceUsd ?? f.priceUsd,
          areaSqm: d.areaSqm ?? f.areaSqm,
          rooms: d.rooms ?? f.rooms,
          sourceUrl: f.sourceUrl.trim(),
          details: d.details ?? f.details,
          buildingMaterial: d.buildingMaterial ?? f.buildingMaterial,
          buildingEra,
          constructionYear: year,
          floor: d.floor ?? f.floor,
          commission: d.commission ?? f.commission,
          sellerType: d.sellerType ?? f.sellerType,
          sellerName: d.sellerName ?? f.sellerName,
          appearance,
          infrastructure: d.infrastructure ?? f.infrastructure ?? [],
          photos: d.photos?.length ? d.photos : f.photos,
          publishedAt: d.publishedAt ?? f.publishedAt
        }
      })

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
              placeholder="URL оголошення"
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
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            required
          />
        </div>
        <div className="flat-form__row flat-form__row--4">
          <div className="flat-form__field">
            <label>Ціна $ *</label>
            <input type="number" min={0} value={form.priceUsd || ''} onChange={(e) => setForm((f) => ({ ...f, priceUsd: Number(e.target.value) || 0 }))} required />
          </div>
          <div className="flat-form__field">
            <label>Площа м² *</label>
            <input type="number" min={0} step={0.1} value={form.areaSqm || ''} onChange={(e) => setForm((f) => ({ ...f, areaSqm: Number(e.target.value) || 0 }))} required />
          </div>
          <div className="flat-form__field">
            <label>Кімнат</label>
            <input type="number" min={1} max={20} value={form.rooms ?? ''} onChange={(e) => setForm((f) => ({ ...f, rooms: e.target.value ? Number(e.target.value) : undefined }))} placeholder="—" />
          </div>
          <div className="flat-form__field">
            <label>Комісія %</label>
            <input type="number" min={0} max={100} value={form.commission ?? ''} onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value ? Number(e.target.value) : undefined }))} />
          </div>
        </div>
        <div className="flat-form__row flat-form__row--4">
          <div className="flat-form__field">
            <label>Стан</label>
            <select value={form.appearance ?? ''} onChange={(e) => setForm((f) => ({ ...f, appearance: e.target.value || undefined }))}>
              <option value="">—</option>
              {APPEARANCE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="flat-form__field">
            <label>Матеріал</label>
            <select value={form.buildingMaterial ?? ''} onChange={(e) => setForm((f) => ({ ...f, buildingMaterial: e.target.value || undefined }))}>
              <option value="">—</option>
              {BUILDING_MATERIAL_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="flat-form__field">
            <label>Тип</label>
            <select value={form.buildingEra ?? ''} onChange={(e) => setForm((f) => ({ ...f, buildingEra: e.target.value || undefined }))}>
              <option value="">—</option>
              {BUILDING_ERA_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="flat-form__field">
            <label>Рік</label>
            <input
              type="number"
              min={1900}
              max={2030}
              placeholder="—"
              value={form.constructionYear ?? ''}
              onChange={(e) => {
                const val = e.target.value
                const year = val ? Number(val) : undefined
                setForm((f) => {
                  const next = { ...f, constructionYear: year }
                  if (year != null && year >= 1900 && year <= 2030) {
                    if (!f.buildingEra) next.buildingEra = inferBuildingEraFromYear(year)
                    if (!isValidAppearance(f.appearance) && next.buildingEra) {
                      const inferred = inferAppearanceFromEra(next.buildingEra)
                      if (inferred) next.appearance = inferred
                    }
                  }
                  return next
                })
              }}
            />
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
