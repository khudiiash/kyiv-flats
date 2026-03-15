export interface GeocodeResult {
  lat: number
  lng: number
}

/**
 * Geocode address to coordinates via Google Geocoding API.
 * Requires VITE_GOOGLE_MAPS_API_KEY and Geocoding API enabled in Google Cloud.
 * Appends "Київ, Україна" for better results in Kyiv.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const trimmed = address.trim()
  if (!trimmed) return null

  const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!googleKey) return null

  const searchQuery = trimmed.includes('Київ') || trimmed.includes('Киев')
    ? trimmed
    : `${trimmed}, Київ, Україна`

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&key=${googleKey}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
      const loc = data.results[0].geometry.location
      return { lat: Number(loc.lat), lng: Number(loc.lng) }
    }
  } catch {
    // ignore
  }

  return null
}
