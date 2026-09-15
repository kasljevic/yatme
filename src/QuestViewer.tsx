import { useEffect, useRef, useState } from 'react'
import { useQuestViewerInit } from './hooks/useQuestViewerInit.ts'
import { createQuestBridge } from './lib/questBridge.ts'
import { fetchQuestOriginAllowlist } from './lib/questOrigin.ts'
import { parsePositionSearch } from './lib/position.ts'
import { LoadingOverlay } from './components/LoadingOverlay'

export interface QuestViewerProps {
  quest: string
}

/**
 * Minimal, read-only quest map viewer.
 *
 * Renders exactly one quest's OTBM file in an iframe-friendly view: no
 * toolbar, palette, save/export controls, or editing tools are mounted, and
 * the storage provider backing it (`/api/quests/<slug>`) has no write
 * capability — see useQuestViewerInit. The only interactivity is the
 * postMessage bridge: on load it announces readiness to its parent, and the
 * parent may then ask it to navigate to a position or display a route.
 *
 * The viewer also honours an initial `x`/`y`/`z` deep link in its own URL
 * (`?viewer=quest&quest=<slug>&x=..&y=..&z=..`), the same bounds-checked
 * format as the local editor's deep link, so a quest map can be linked
 * directly to a specific tile before any parent page ever sends a
 * `yatme:navigate` message.
 */
export function QuestViewer({ quest }: QuestViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { rendererRef, loading, loadingStatus, loadingProgress, error } = useQuestViewerInit(containerRef, quest)
  const bridgeRef = useRef<ReturnType<typeof createQuestBridge> | null>(null)
  const readySentRef = useRef(false)
  const deepLinkHandledRef = useRef(false)
  // The allowlist is a server runtime setting, not a build-time one (see
  // questOrigin.ts), so it must be fetched before the bridge can safely
  // trust any cross-origin message; `null` means "not yet resolved".
  const [allowedOrigins, setAllowedOrigins] = useState<string[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchQuestOriginAllowlist().then(origins => {
      if (!cancelled) setAllowedOrigins(origins)
    }).catch(() => {
      if (!cancelled) setAllowedOrigins([])
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!allowedOrigins) return

    const bridge = createQuestBridge(quest, allowedOrigins, {
      onNavigate: (message) => {
        const renderer = rendererRef.current
        if (!renderer) return
        renderer.setFloor(message.z)
        renderer.centerOn(message.x, message.y)
        renderer.pingTile(message.x, message.y, message.z)
        renderer.setActiveRoutePoint(message.pointId)
      },
      onSetRoute: (message) => {
        const renderer = rendererRef.current
        if (!renderer) return
        renderer.setRoutePoints(message.points)
        // A fresh route has no implied active point until the parent
        // explicitly navigates to one.
        renderer.setActiveRoutePoint(null)
      },
    })
    bridgeRef.current = bridge
    readySentRef.current = false

    return () => {
      bridge.destroy()
      bridgeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest, allowedOrigins])

  useEffect(() => {
    if (loading || error || readySentRef.current || !bridgeRef.current) return
    readySentRef.current = true
    // Announce readiness only once assets have actually finished loading —
    // a parent that navigates before this fires would be talking to a
    // renderer that does not exist yet.
    bridgeRef.current.sendReady()
  }, [loading, error, allowedOrigins])

  useEffect(() => {
    if (loading || error || deepLinkHandledRef.current) return
    const renderer = rendererRef.current
    if (!renderer) return
    const position = parsePositionSearch(window.location.search)
    if (!position) return
    deepLinkHandledRef.current = true
    renderer.setFloor(position.z)
    renderer.centerOn(position.x, position.y)
    renderer.pingTile(position.x, position.y, position.z)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error])

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-void">
        <div className="panel max-w-[400px] p-10 text-center">
          <div className="mx-auto mb-6 flex h-[40px] w-[40px] items-center justify-center rounded-md bg-danger-subtle text-[20px]">!</div>
          <div className="mb-3 font-display text-lg font-semibold text-danger">Failed to load quest map</div>
          <div className="break-words font-mono text-sm text-fg-muted">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      {loading && <LoadingOverlay status={loadingStatus} progress={loadingProgress} />}
    </div>
  )
}
