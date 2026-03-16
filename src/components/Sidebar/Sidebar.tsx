import { useState } from 'react'
import { FlatCard } from './FlatCard'
import type { Flat, SortField, SortOrder, FlatFilters } from '../../types/flat'
import { BUILDING_MATERIAL_OPTIONS } from '../../types/flat'

interface SidebarProps {
  flats: Flat[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  isError?: boolean
  error?: unknown
  onRefetch?: () => void
}

function filterFlats(flats: Flat[], filters: FlatFilters): Flat[] {
  return flats.filter((f) => {
    if (filters.buildingMaterial?.length && (!f.buildingMaterial || !filters.buildingMaterial.includes(f.buildingMaterial))) return false
    if (filters.sellerType && f.sellerType !== filters.sellerType) return false
    return true
  })
}

function sortFlats(flats: Flat[], sortField: SortField, sortOrder: SortOrder): Flat[] {
  const result = [...flats]
  const mult = sortOrder === 'asc' ? 1 : -1
  result.sort((a, b) => {
    if (sortField === 'commission') {
      const undef = sortOrder === 'asc' ? 999 : -1
      const av = a.commission ?? undef
      const bv = b.commission ?? undef
      return (av - bv) * mult
    }
    const aVal = a[sortField]
    const bVal = b[sortField]
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * mult
    }
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return aVal.localeCompare(bVal) * mult
    }
    return 0
  })
  return result
}

const SORT_OPTIONS: { field: SortField; label: string; asc: string; desc: string }[] = [
  { field: 'createdAt', label: 'Дата', asc: 'старі→нові', desc: 'нові→старі' },
  { field: 'priceUsd', label: 'Ціна', asc: 'дешеві→дорогі', desc: 'дорогі→дешеві' },
  { field: 'areaSqm', label: 'Площа', asc: 'малі→великі', desc: 'великі→малі' },
  { field: 'commission', label: 'Комісія', asc: 'менше→більше', desc: 'більше→менше' }
]

export function Sidebar({
  flats,
  selectedId,
  onSelect,
  onAdd,
  isError,
  error,
  onRefetch
}: SidebarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [filters, setFilters] = useState<FlatFilters>({})

  const filtered = filterFlats(flats, filters)
  const displayed = sortFlats(filtered, sortField, sortOrder)

  const toggleMaterial = (m: string) => {
    setFilters((prev) => {
      const arr = prev.buildingMaterial ?? []
      const next = arr.includes(m) ? arr.filter((x) => x !== m) : [...arr, m]
      return { ...prev, buildingMaterial: next.length ? next : undefined }
    })
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h2>Квартири ({displayed.length})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {onRefetch && (
            <button type="button" className="btn" onClick={() => onRefetch()} title="Оновити список">
              ⟳
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={onAdd}>
            + Додати
          </button>
        </div>
        <button
          type="button"
          className="filters-toggle"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
        >
          {filtersOpen ? '▼' : '▶'} Сортування та фільтри
        </button>
        {filtersOpen && (
          <div className="filters-panel">
            <div className="filters-grid">
              {SORT_OPTIONS.map(({ field, label, asc, desc }) => (
                <div key={field} className="filters-grid__row">
                  <span className="filters-grid__label">{label}</span>
                  <div className="filters-grid__controls">
                    <button
                      type="button"
                      className={`filters-btn ${sortField === field && sortOrder === 'asc' ? 'filters-btn--active' : ''}`}
                      onClick={() => { setSortField(field); setSortOrder('asc') }}
                      title={asc}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={`filters-btn ${sortField === field && sortOrder === 'desc' ? 'filters-btn--active' : ''}`}
                      onClick={() => { setSortField(field); setSortOrder('desc') }}
                      title={desc}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
              <div className="filters-grid__row">
                <span className="filters-grid__label">Матеріал</span>
                <div className="filters-grid__controls">
                  {BUILDING_MATERIAL_OPTIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`filters-btn filters-btn--chip ${(filters.buildingMaterial ?? []).includes(m) ? 'filters-btn--active' : ''}`}
                      onClick={() => toggleMaterial(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filters-grid__row">
                <span className="filters-grid__label">Продавець</span>
                <div className="filters-grid__controls">
                  <button
                    type="button"
                    className={`filters-btn filters-btn--chip ${!filters.sellerType ? 'filters-btn--active' : ''}`}
                    onClick={() => setFilters((p) => ({ ...p, sellerType: undefined }))}
                  >
                    всі
                  </button>
                  <button
                    type="button"
                    className={`filters-btn filters-btn--chip ${filters.sellerType === 'власник' ? 'filters-btn--active' : ''}`}
                    onClick={() => setFilters((p) => ({ ...p, sellerType: 'власник' }))}
                  >
                    власник
                  </button>
                  <button
                    type="button"
                    className={`filters-btn filters-btn--chip ${filters.sellerType === 'рієлтор' ? 'filters-btn--active' : ''}`}
                    onClick={() => setFilters((p) => ({ ...p, sellerType: 'рієлтор' }))}
                  >
                    рієлтор
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {isError && (
        <div className="sidebar__error">
          {error instanceof Error ? error.message : 'Помилка завантаження'}
          {onRefetch && (
            <button type="button" className="btn btn--small" onClick={() => onRefetch()} style={{ marginTop: 8 }}>
              Спробувати знову
            </button>
          )}
        </div>
      )}
      <div className="sidebar__list">
        {displayed.map((flat) => (
          <FlatCard
            key={flat.id}
            flat={flat}
            isSelected={flat.id === selectedId}
            onClick={() => onSelect(flat.id)}
          />
        ))}
      </div>
    </aside>
  )
}
