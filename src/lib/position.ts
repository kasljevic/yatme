/**
 * Parse a position string in various formats:
 * - {x=123, y=456, z=7}  (Copy Position format)
 * - {x: 123, y: 456, z: 7} or {"x": 123, ...}  (JSON-like)
 * - 123, 456, 7  (comma-separated)
 */
export function parsePositionString(text: string): { x: string; y: string; z: string } | null {
  const trimmed = text.trim()
  const eqMatch = trimmed.match(/x\s*=\s*(\d+).*y\s*=\s*(\d+).*z\s*=\s*(\d+)/)
  const colonMatch = trimmed.match(/x["\s]*:\s*(\d+).*y["\s]*:\s*(\d+).*z["\s]*:\s*(\d+)/)
  const csvMatch = trimmed.match(/^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/)
  const match = eqMatch || colonMatch || csvMatch
  if (!match) return null
  return { x: match[1], y: match[2], z: match[3] }
}

export interface MapPosition {
  x: number
  y: number
  z: number
}

/** Read a validated world position from a URL query string. */
export function parsePositionSearch(search: string): MapPosition | null {
  const params = new URLSearchParams(search)
  const values = ['x', 'y', 'z'].map(key => {
    const value = params.get(key)
    return value !== null && /^\d+$/.test(value) ? Number(value) : NaN
  })
  const [x, y, z] = values
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)
      || x < 0 || x > 65535 || y < 0 || y > 65535 || z < 0 || z > 15) {
    return null
  }
  return { x, y, z }
}

export function parseHouseIdSearch(search: string): number | null {
  const value = new URLSearchParams(search).get('house')
  if (value === null || !/^\d+$/.test(value)) return null
  const houseId = Number(value)
  return Number.isSafeInteger(houseId) && houseId > 0 ? houseId : null
}
