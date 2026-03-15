import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  Timestamp
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../services/firebase'
import type { Flat } from '../types/flat'

const FLATS_COLLECTION = 'flats'

/** Deduplicate photos by id in URL (e.g. ..._311144683x1.webp or ..._311144683.jpg) */
function dedupePhotos(urls: string[]): string[] {
  const seen = new Set<string>()
  return urls.filter((url) => {
    const m = url.match(/_(\d+)(?:[xX][a-zA-Z0-9]*)?\./)?.[1] ?? url.match(/\/(\d{6,})/)?.[1]
    const id = m ?? url
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Remove undefined values - Firestore rejects them */
function sanitizeForFirestore<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Record<string, unknown>
}

function parseCoordinates(val: unknown): { lat: number; lng: number } {
  if (!val || typeof val !== 'object') return { lat: 50.4501, lng: 30.5234 }
  const o = val as Record<string, unknown>
  let lat: number | undefined
  let lng: number | undefined
  if ('lat' in o && 'lng' in o) {
    lat = Number(o.lat)
    lng = Number(o.lng)
  } else if ('latitude' in o && 'longitude' in o) {
    lat = Number(o.latitude)
    lng = Number(o.longitude)
  } else if ('_lat' in o && '_longitude' in o) {
    const g = o as { _lat: unknown; _longitude: unknown }
    lat = Number(g._lat)
    lng = Number(g._longitude)
  }
  if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return { lat, lng }
  }
  return { lat: 50.4501, lng: 30.5234 }
}

function toFlat(docSnap: { id: string; data: Record<string, unknown> }): Flat {
  const data = docSnap.data ?? {}
  return {
    id: docSnap.id,
    address: (data.address as string) || '',
    coordinates: parseCoordinates(data.coordinates),
    priceUsd: Number(data.priceUsd) || 0,
    areaSqm: Number(data.areaSqm) || 0,
    appearance: data.appearance as string | undefined,
    buildingType: data.buildingType as string | undefined,
    floor: data.floor as string | undefined,
    infrastructure: Array.isArray(data.infrastructure)
      ? data.infrastructure
      : typeof data.infrastructure === 'string'
        ? data.infrastructure.split(',').map((s: string) => s.trim()).filter(Boolean)
        : undefined,
    parksNearby: data.parksNearby as string[] | undefined,
    commission: data.commission as number | undefined,
    photos: dedupePhotos((data.photos as string[]) ?? []),
    sellerPhone: data.sellerPhone as string | undefined,
    sellerName: data.sellerName as string | undefined,
    sellerType: data.sellerType as string | undefined,
    sellerContacts: data.sellerContacts as string | undefined,
    details: data.details as string | undefined,
    publishedAt: data.publishedAt as string | undefined,
    sourceUrl: data.sourceUrl as string | undefined,
    createdAt:
      typeof data.createdAt === 'string'
        ? data.createdAt
        : (data.createdAt as Timestamp)?.toDate?.()?.toISOString() ?? '',
    updatedAt:
      typeof data.updatedAt === 'string'
        ? data.updatedAt
        : (data.updatedAt as Timestamp)?.toDate?.()?.toISOString() ?? ''
  }
}

export function useFlats(userId: string | null) {
  const queryClient = useQueryClient()

  const { data: flats = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['flats', userId],
    queryFn: async () => {
      if (!userId) return []
      const q = query(
        collection(db, FLATS_COLLECTION),
        where('userId', '==', userId)
      )
      const snapshot = await getDocs(q)
      const items: Flat[] = []
      for (const d of snapshot.docs) {
        try {
          const data = d.data() ?? {}
          items.push(toFlat({ id: d.id, data }))
        } catch (err) {
          console.warn('Skip invalid doc:', d.id, err)
        }
      }
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      return items
    },
    retry: 2
  })

  const addFlat = useMutation({
    mutationFn: async (flat: Omit<Flat, 'id' | 'createdAt' | 'updatedAt'> & { userId: string }) => {
      const now = new Date().toISOString()
      const data = sanitizeForFirestore({
        ...flat,
        userId: flat.userId,
        photos: flat.photos ?? [],
        createdAt: now,
        updatedAt: now
      })
      const docRef = await addDoc(collection(db, FLATS_COLLECTION), data)
      return { id: docRef.id, flat, now }
    },
    onSuccess: (result) => {
      const { userId: _uid, ...flatData } = result.flat
      const newFlat: Flat = {
        id: result.id,
        ...flatData,
        photos: result.flat.photos ?? [],
        createdAt: result.now,
        updatedAt: result.now
      }
      queryClient.setQueryData<Flat[]>(['flats', userId], (prev = []) => [newFlat, ...prev])
      queryClient.invalidateQueries({ queryKey: ['flats', userId] })
    }
  })

  const updateFlat = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Flat> & { id: string }) => {
      const { createdAt, updatedAt: _u, ...rest } = updates as Flat
      const data = sanitizeForFirestore({
        ...rest,
        updatedAt: new Date().toISOString()
      })
      await updateDoc(doc(db, FLATS_COLLECTION, id), data)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flats', userId] })
  })

  const deleteFlat = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, FLATS_COLLECTION, id))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flats', userId] })
  })

  const uploadPhoto = async (file: File, flatId: string): Promise<string> => {
    if (!userId) throw new Error('Не потрібна авторизація')
    const path = `users/${userId}/flats/${flatId}/${crypto.randomUUID()}_${file.name}`
    const storageRef = ref(storage, path)
    await uploadBytes(storageRef, file)
    return getDownloadURL(storageRef)
  }

  return {
    flats,
    isLoading,
    isError,
    error,
    refetch,
    addFlat,
    updateFlat,
    deleteFlat,
    uploadPhoto
  }
}
