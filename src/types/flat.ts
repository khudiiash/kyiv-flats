export const APPEARANCE_OPTIONS = ['євро ремонт', 'нормальний ремонт', 'радянський ремонт', 'без ремонту'] as const
export const BUILDING_MATERIAL_OPTIONS = ['цегла', 'моноліт', 'панельний'] as const
export const BUILDING_ERA_OPTIONS = ['сталінка', 'хрущівка', 'новобудова'] as const
export const INFRASTRUCTURE_OPTIONS = ['метро', 'тц', 'розваги', 'відпочинок', 'школа'] as const
export const SELLER_TYPE_OPTIONS = ['власник', 'рієлтор'] as const

export const STATUS_OPTIONS = [
  'цікавить',
  'перегляд',
  'враження',
  'не сподобалась',
  'задаток',
  'купівля'
] as const
export type FlatStatus = (typeof STATUS_OPTIONS)[number]

export const RATING_CATEGORIES = [
  { key: 'location', label: 'Локація' },
  { key: 'renovation', label: 'Ремонт' },
  { key: 'communications', label: 'Комунікації' },
  { key: 'autonomy', label: 'Автономність' },
  { key: 'price', label: 'Ціна' },
  { key: 'impression', label: 'Враження' }
] as const
export type RatingCategoryKey = (typeof RATING_CATEGORIES)[number]['key']

export interface FlatRating {
  location: number
  renovation: number
  communications: number
  autonomy: number
  price: number
  impression: number
  votes: number
}

export interface Flat {
  id: string
  address: string
  coordinates: { lat: number; lng: number }
  priceUsd: number
  areaSqm: number
  rooms?: number
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
  sellerContacts?: string
  details?: string
  publishedAt?: string
  sourceUrl?: string
  status?: FlatStatus
  viewDate?: string
  rating?: FlatRating
  createdAt: string
  updatedAt: string
}

export type SortField = 'priceUsd' | 'areaSqm' | 'createdAt' | 'address'
export type SortOrder = 'asc' | 'desc'

export interface FlatFilters {
  priceMin?: number
  priceMax?: number
  areaMin?: number
  areaMax?: number
  hasCommission?: boolean
  hasParks?: boolean
}
