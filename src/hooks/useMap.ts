import { useEffect, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

const KYIV_CENTER = { lat: 50.4501, lng: 30.5234 }
const DEFAULT_ZOOM = 12

// setOptions must be called only once (module-level)
const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
if (key) {
  setOptions({ key, v: 'weekly' })
}

export function useMap(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  useEffect(() => {
    if (!key || !containerRef.current) return

    const init = async () => {
      const { Map } = await importLibrary('maps')

      const m = new Map(containerRef.current!, {
        center: KYIV_CENTER,
        zoom: DEFAULT_ZOOM,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true
      })
      setMap(m)
      setIsLoaded(true)
    }

    init()
  }, [containerRef])

  return { map, isLoaded }
}
