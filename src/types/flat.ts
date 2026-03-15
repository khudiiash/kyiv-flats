export const APPEARANCE_OPTIONS = ['євро', 'нормальний', 'радянський', 'відсутній'] as const
export const BUILDING_TYPE_OPTIONS = ['цегла', 'моноліт', 'панельний'] as const
export const INFRASTRUCTURE_OPTIONS = ['метро', 'тц', 'розваги', 'відпочинок', 'школа'] as const
export const SELLER_TYPE_OPTIONS = ['власник', 'рієлтор'] as const

export interface Flat {
  id: string
  address: string
  coordinates: { lat: number; lng: number }
  priceUsd: number
  areaSqm: number
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
  sellerContacts?: string
  details?: string
  publishedAt?: string
  sourceUrl?: string
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
