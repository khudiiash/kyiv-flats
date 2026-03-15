import type { Flat } from '../../types/flat'

interface FlatCardProps {
  flat: Flat
  isSelected: boolean
  onClick: () => void
}

export function FlatCard({ flat, isSelected, onClick }: FlatCardProps) {
  const thumb = flat.photos[0]
  return (
    <article
      className={`flat-card ${isSelected ? 'flat-card--selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="flat-card__thumb">
        {thumb ? (
          <img src={thumb} alt="" />
        ) : (
          <div className="flat-card__placeholder">Немає фото</div>
        )}
      </div>
      <div className="flat-card__body">
        <div className="flat-card__price">${flat.priceUsd.toLocaleString()}</div>
        <div className="flat-card__meta">
          {flat.areaSqm} m² · {flat.address.slice(0, 40)}
          {flat.address.length > 40 ? '…' : ''}
        </div>
        {flat.commission != null && flat.commission > 0 && (
          <span className="flat-card__badge">Комісія {flat.commission}%</span>
        )}
      </div>
    </article>
  )
}
