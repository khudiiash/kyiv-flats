import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MapView } from './components/Map/MapView'
import { Sidebar } from './components/Sidebar/Sidebar'
import { FlatDetail } from './components/FlatDetail/FlatDetail'
import { FlatForm } from './components/FlatForm/FlatForm'
import { useFlats } from './hooks/useFlats'
import type { Flat } from './types/flat'
import type { FlatFormData } from './components/FlatForm/FlatForm'
import type { SearchLocation } from './components/Map/MapView'
import './App.css'

const queryClient = new QueryClient()
const SINGLE_USER_ID = 'single-user'

function AppContent() {
  const { flats, addFlat, updateFlat, deleteFlat, uploadPhoto, isError, error, refetch } =
    useFlats(SINGLE_USER_ID)

  return (
    <AppMain
      flats={flats}
      addFlat={addFlat}
      updateFlat={updateFlat}
      deleteFlat={deleteFlat}
      uploadPhoto={uploadPhoto}
      isError={isError}
      error={error}
      refetch={refetch}
      userId={SINGLE_USER_ID}
    />
  )
}

function AppMain({
  flats,
  addFlat,
  updateFlat,
  deleteFlat,
  uploadPhoto,
  isError,
  error,
  refetch,
  userId
}: {
  flats: Flat[]
  addFlat: ReturnType<typeof useFlats>['addFlat']
  updateFlat: ReturnType<typeof useFlats>['updateFlat']
  deleteFlat: ReturnType<typeof useFlats>['deleteFlat']
  uploadPhoto: ReturnType<typeof useFlats>['uploadPhoto']
  isError: boolean
  error: unknown
  refetch: () => void
  userId: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalMode, setModalMode] = useState<
    'add' | 'edit' | 'detail' | null
  >(null)
  const [previewLocation, setPreviewLocation] = useState<SearchLocation | null>(null)

  const selectedFlat = selectedId
    ? flats.find((f) => f.id === selectedId)
    : null

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalMode(null)
    }
    if (modalMode) {
      document.addEventListener('keydown', handler)
    }
    return () => document.removeEventListener('keydown', handler)
  }, [modalMode])

  const handleAdd = () => {
    setSaveError(null)
    setModalMode('add')
  }

  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSave = (data: FlatFormData) => {
    setSaveError(null)
    if (modalMode === 'add') {
      addFlat.mutate(
        {
          ...data,
          userId,
          photos: data.photos ?? [],
          status: 'цікавить'
        },
        {
          onSuccess: () => {
            setModalMode(null)
            setPreviewLocation(null)
            setSaveError(null)
          },
          onError: (err) => {
            setSaveError(err instanceof Error ? err.message : 'Помилка збереження')
          }
        }
      )
    } else if (modalMode === 'edit' && selectedFlat) {
      updateFlat.mutate(
        {
          id: selectedFlat.id,
          ...data
        },
        {
          onSuccess: () => {
            setModalMode('detail')
            setSaveError(null)
          },
          onError: (err) => {
            setSaveError(err instanceof Error ? err.message : 'Помилка збереження')
          }
        }
      )
    }
  }

  const handleDelete = () => {
    if (!selectedFlat) return
    if (confirm('Видалити цю квартиру?')) {
      deleteFlat.mutate(selectedFlat.id, {
        onSuccess: () => {
          setSelectedId(null)
          setModalMode(null)
        }
      })
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Київські квартири</h1>
        {isError && (
          <div className="app-header__error" style={{ flexBasis: '100%' }}>
            Помилка завантаження: {error instanceof Error ? error.message : 'невідома'}
          </div>
        )}
      </header>
      <div className="app-body">
        <Sidebar
          flats={flats}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id)
            setModalMode(id ? 'detail' : null)
          }}
          onAdd={handleAdd}
          isError={isError}
          error={error}
          onRefetch={refetch}
        />
        <main className="app-main">
          <MapView
            flats={flats}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id)
              setModalMode(id ? 'detail' : null)
            }}
            previewLocation={modalMode === 'add' ? previewLocation : null}
            panelOpen={modalMode !== null}
          />
        </main>
        {modalMode && (
          <aside className="app-panel">
            <div className="app-panel__inner">
              <div className="app-panel__header">
                <h2>
                  {modalMode === 'add'
                    ? 'Додати квартиру'
                    : modalMode === 'edit'
                      ? 'Редагувати'
                      : flatDetailTitle(selectedFlat)}
                </h2>
                <button
                  type="button"
                  className="modal__close"
                  onClick={() => setModalMode(null)}
                  aria-label="Закрити"
                >
                  ×
                </button>
              </div>
              <div className="app-panel__body">
                {modalMode === 'add' && (
                  <FlatForm
                    initialData={undefined}
                    onSave={handleSave}
                    onCancel={() => {
                      setModalMode(null)
                      setPreviewLocation(null)
                    }}
                    uploadPhoto={uploadPhoto}
                    saveError={saveError}
                    isSaving={addFlat.isPending}
                    onParsedLocation={setPreviewLocation}
                  />
                )}
                {modalMode === 'edit' && selectedFlat && (
                  <FlatForm
                    flat={selectedFlat}
                    onSave={handleSave}
                    onCancel={() => setModalMode('detail')}
                    uploadPhoto={uploadPhoto}
                    saveError={saveError}
                    isSaving={updateFlat.isPending}
                  />
                )}
                {modalMode === 'detail' && selectedFlat && (
                  <FlatDetail
                    flat={selectedFlat}
                    onEdit={() => setModalMode('edit')}
                    onDelete={handleDelete}
                    onUpdate={(updates) =>
                      updateFlat.mutate({ id: selectedFlat.id, ...updates })
                    }
                    onFixCoordinates={(coordinates) =>
                      updateFlat.mutate({ id: selectedFlat.id, coordinates })
                    }
                  />
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function flatDetailTitle(flat: Flat | null | undefined): string {
  if (!flat) return 'Деталі'
  return `${flat.address} — $${flat.priceUsd.toLocaleString()}`
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}
