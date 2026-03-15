import { useEffect, useRef } from 'react'
import { MarkerClusterer } from '@googlemaps/markerclusterer'
import { useMap } from '../../hooks/useMap'
import type { Flat } from '../../types/flat'

export interface SearchLocation {
  address: string
  coordinates: { lat: number; lng: number }
}

interface MapViewProps {
  flats: Flat[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  previewLocation?: SearchLocation | null
  panelOpen?: boolean
}

export function MapView({ flats, selectedId, onSelect, previewLocation, panelOpen }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { map, isLoaded } = useMap(containerRef)
  const markersRef = useRef<google.maps.Marker[]>([])
  const clustererRef = useRef<MarkerClusterer | null>(null)
  const previewMarkerRef = useRef<google.maps.Marker | null>(null)

  useEffect(() => {
    if (!map || !isLoaded) return

    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

    const markers: google.maps.Marker[] = flats.map((flat) => {
      const marker = new google.maps.Marker({
        position: flat.coordinates,
        map,
        title: `${flat.address} — $${flat.priceUsd.toLocaleString()}`
      })
      marker.addListener('click', () => onSelect(flat.id))
      return marker
    })

    markersRef.current = markers

    if (clustererRef.current) {
      clustererRef.current.clearMarkers()
    }
    clustererRef.current = new MarkerClusterer({ markers, map })

    return () => {
      markersRef.current.forEach((m) => m.setMap(null))
      clustererRef.current?.clearMarkers()
    }
  }, [map, isLoaded, flats, onSelect])

  useEffect(() => {
    if (!map || !selectedId) return
    const flat = flats.find((f) => f.id === selectedId)
    if (flat) {
      map.panTo(flat.coordinates)
      map.setZoom(16)
    }
  }, [map, selectedId, flats])

  // Resize map when panel opens/closes so marker stays centered in visible area
  useEffect(() => {
    if (!map || !isLoaded) return
    const timer = setTimeout(() => {
      const flat = selectedId ? flats.find((f) => f.id === selectedId) : null
      const center = flat ? flat.coordinates : map.getCenter()
      google.maps.event.trigger(map, 'resize')
      if (center) map.panTo(center)
    }, 150)
    return () => clearTimeout(timer)
  }, [map, isLoaded, panelOpen, selectedId, flats])

  useEffect(() => {
    if (!map || !isLoaded) return
    if (previewMarkerRef.current) {
      previewMarkerRef.current.setMap(null)
      previewMarkerRef.current = null
    }
    if (previewLocation) {
      const marker = new google.maps.Marker({
        position: previewLocation.coordinates,
        map,
        title: previewLocation.address || 'Адреса'
      })
      previewMarkerRef.current = marker
      map.panTo(previewLocation.coordinates)
      map.setZoom(15)
    }
    return () => {
      if (previewMarkerRef.current) {
        previewMarkerRef.current.setMap(null)
        previewMarkerRef.current = null
      }
    }
  }, [map, isLoaded, previewLocation])

  return (
    <div className="map-wrapper">
      <div ref={containerRef} className="map-container" />
    </div>
  )
}
