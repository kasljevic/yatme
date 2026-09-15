import { Container, Graphics, Text } from 'pixi.js'
import { TILE_SIZE } from './constants'
import type { Camera } from './Camera'
import { TILE_CENTER, FloorOffsetTracker } from './overlayUtils'
import type { QuestRoutePoint } from './questProtocol.ts'

export const ROUTE_POINT_COLOR = 0x4aa3ff
export const ROUTE_ACTIVE_POINT_COLOR = 0xffb020
export const ROUTE_CONNECTOR_COLOR = 0x4aa3ff
const POINT_RADIUS = 6
const ACTIVE_POINT_RADIUS = 8
const LABEL_FONT_SIZE = 12

/**
 * Renders an ordered quest route (points, connectors between consecutive
 * same-floor points, labels, and a highlighted active point) received from
 * the parent page via the postMessage protocol.
 *
 * "Ordered" here means array order, as sent in the `yatme:set-route`
 * message — points no longer carry a numeric step ordinal, so the order the
 * parent supplies them in *is* the route order.
 *
 * Read-only and additive: nothing in the local editor ever calls into this
 * overlay, so its presence does not change existing editor rendering.
 * Connectors are only drawn between two points that are both consecutive in
 * the original array *and* share the current floor — a route step that
 * jumps to another z-level is not projected across floors (each floor's
 * container is positioned independently by MapRenderer, so a straight line
 * between them would not correspond to any real path), and skipping a
 * different-floor point never draws a connector across the gap it leaves.
 */
export class RouteOverlay {
  readonly container: Container
  private _graphics: Graphics
  private _labelContainer: Container
  private _visible = false
  private _dirty = true
  private _lastKey = ''
  private _points: QuestRoutePoint[] = []
  private _activePointId: string | null = null
  private _offsetTracker = new FloorOffsetTracker()

  constructor() {
    this.container = new Container()
    this.container.visible = false

    this._graphics = new Graphics()
    this.container.addChild(this._graphics)

    this._labelContainer = new Container()
    this.container.addChild(this._labelContainer)
  }

  get visible(): boolean { return this._visible }

  setVisible(v: boolean): void {
    this._visible = v
    this.container.visible = v
    if (v) this._dirty = true
  }

  markDirty(): void {
    this._dirty = true
  }

  /** Replace the displayed route. Array order is preserved as the route order. */
  setPoints(points: QuestRoutePoint[]): void {
    this._points = [...points]
    this._dirty = true
  }

  setActivePoint(pointId: string | null): void {
    if (this._activePointId !== pointId) {
      this._activePointId = pointId
      this._dirty = true
    }
  }

  updateContainerOffset(floorOffset: number): void {
    this._offsetTracker.updateContainerOffset(this.container, floorOffset)
  }

  rebuild(floor: number, camera: Camera): void {
    if (!this._visible) return

    const key = `${floor}|${this._activePointId}|${camera.zoom.toFixed(3)}|${this._points.map(p => `${p.id},${p.x},${p.y},${p.z}`).join(';')}`
    if (!this._dirty && key === this._lastKey) return

    this._dirty = false
    this._lastKey = key

    const g = this._graphics
    g.clear()
    this._labelContainer.removeChildren().forEach(c => c.destroy())

    // Keep the original array index alongside each point so a connector is
    // only drawn between points that were consecutive in the source route,
    // even after filtering down to the current floor.
    const floorPoints = this._points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.z === floor)

    for (let i = 0; i < floorPoints.length - 1; i++) {
      const a = floorPoints[i]
      const b = floorPoints[i + 1]
      if (b.index !== a.index + 1) continue
      g.moveTo(a.point.x * TILE_SIZE + TILE_CENTER, a.point.y * TILE_SIZE + TILE_CENTER)
      g.lineTo(b.point.x * TILE_SIZE + TILE_CENTER, b.point.y * TILE_SIZE + TILE_CENTER)
      g.stroke({ color: ROUTE_CONNECTOR_COLOR, width: 2 / camera.zoom, alpha: 0.7 })
    }

    for (const { point } of floorPoints) {
      const isActive = point.id === this._activePointId
      const cx = point.x * TILE_SIZE + TILE_CENTER
      const cy = point.y * TILE_SIZE + TILE_CENTER
      const radius = isActive ? ACTIVE_POINT_RADIUS : POINT_RADIUS
      const color = isActive ? ROUTE_ACTIVE_POINT_COLOR : ROUTE_POINT_COLOR

      g.circle(cx, cy, radius)
      g.fill({ color, alpha: isActive ? 0.95 : 0.85 })
      g.stroke({ color: 0x0a0a12, width: 1.5, alpha: 0.9 })

      const invZoom = 1 / camera.zoom
      const label = new Text({
        text: point.label ?? point.stepId,
        style: {
          fontFamily: 'Barlow, system-ui, -apple-system, sans-serif',
          fontSize: LABEL_FONT_SIZE,
          fill: 0xffffff,
          letterSpacing: 1,
        },
      })
      label.anchor.set(0.5, 1)
      label.scale.set(invZoom)
      label.position.set(cx, cy - radius - 2)
      this._labelContainer.addChild(label)
    }
  }

  destroy(): void {
    this._graphics.destroy()
    this._labelContainer.destroy({ children: true })
    this.container.destroy({ children: true })
  }
}
