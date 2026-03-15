import { FlatCard } from './FlatCard'
import type { Flat, SortField, SortOrder } from '../../types/flat'

interface SidebarProps {
  flats: Flat[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  isError?: boolean
  error?: unknown
  onRefetch?: () => void
}

function sortFlats(flats: Flat[], sortField: SortField, sortOrder: SortOrder): Flat[] {
  const result = [...flats]
  const mult = sortOrder === 'asc' ? 1 : -1
  result.sort((a, b) => {
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

export function Sidebar({
  flats,
  selectedId,
  onSelect,
  onAdd,
  isError,
  error,
  onRefetch
}: SidebarProps) {
  const displayed = sortFlats(flats, 'createdAt', 'desc')

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
