import { useEffect, useRef, useState, type RefObject } from 'react'
import { Application } from 'pixi.js'
import { loadAssets } from '../lib/initPipeline.ts'
import { setupEditor } from '../lib/setupEditor.ts'
import { ServerStorageProvider } from '../lib/storage'
import { MapRenderer } from '../lib/MapRenderer.ts'
import type { AppearanceData } from '../lib/appearances'
import type { OtbmMap } from '../lib/otbm'

export interface UseQuestViewerInitResult {
  rendererRef: RefObject<MapRenderer | null>
  appRef: RefObject<Application | null>
  loading: boolean
  loadingStatus: string
  loadingProgress: number
  error: string | null
  mapData: OtbmMap | null
  appearancesData: AppearanceData | null
}

/**
 * Minimal read-only init for the quest viewer.
 *
 * Deliberately does NOT reuse `useEditorInit` — that hook wires ~15 pieces of
 * editor-only state (tool state, house-exit placement, context menus,
 * mutator callbacks) that a read-only viewer has no use for. Instead this
 * calls the same underlying `loadAssets` + `setupEditor` pipeline directly
 * with a `ServerStorageProvider` scoped to `/api/quests/<slug>`, whose
 * `canSave` is already `false` for any nested path (see
 * ServerStorageProvider's baseUrl segment-count check) — so this hook never
 * needs to touch save/export machinery at all.
 */
export function useQuestViewerInit(
  containerRef: RefObject<HTMLDivElement | null>,
  quest: string,
): UseQuestViewerInitResult {
  const rendererRef = useRef<MapRenderer | null>(null)
  const appRef = useRef<Application | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadingStatus, setLoadingStatus] = useState('Starting...')
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [mapData, setMapData] = useState<OtbmMap | null>(null)
  const [appearancesData, setAppearancesData] = useState<AppearanceData | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const signal = { destroyed: false }
    let appInstance: Application | null = null

    async function init() {
      const provider = new ServerStorageProvider(`/api/quests/${quest}`)

      const result = await loadAssets(container!, {
        setStatus: setLoadingStatus,
        setProgress: setLoadingProgress,
      }, signal, provider)
      if (!result) return

      const { app, appearances, mapData: loadedMapData, sidecars, registry, brushRegistry, spawnManager, creatureDb } = result
      appInstance = app
      appRef.current = app
      setAppearancesData(appearances)
      setMapData(loadedMapData)

      const { renderer } = setupEditor(app, appearances, loadedMapData, brushRegistry, registry, sidecars, spawnManager, creatureDb)
      rendererRef.current = renderer

      // Minimal read-only presentation: hide editor chrome the viewer has no
      // use for, and turn on the route overlay this viewer exists to show.
      renderer.setShowMinimap(false)
      renderer.setShowGrid(false)
      renderer.setShowClientBox(false)
      renderer.setShowRouteOverlay(true)

      setLoading(false)
    }

    init().catch((e: unknown) => {
      if (!signal.destroyed) setError(e instanceof Error ? e.message : String(e))
      setLoading(false)
    })

    return () => {
      signal.destroyed = true
      rendererRef.current?.destroy()
      rendererRef.current = null
      if (appInstance) {
        appInstance.destroy(true)
      }
      appRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest])

  return { rendererRef, appRef, loading, loadingStatus, loadingProgress, error, mapData, appearancesData }
}
