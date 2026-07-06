import { describe, expect, it } from 'vitest'
import { haversineMiles, normalizeShops } from './index'

// Ennis, MT
const CENTER = { lat: 45.349, lon: -111.732 }

function feature(overrides: Record<string, unknown> = {}) {
  return {
    ...overrides,
    geometry:
      'geometry' in overrides
        ? (overrides.geometry as { coordinates?: [number, number] } | undefined)
        : { coordinates: [-111.73, 45.35] as [number, number] },
    properties: {
      name: 'Madison River Fly Shack',
      full_address: '123 Main St, Ennis, Montana 59729',
      coordinates: { longitude: -111.73, latitude: 45.35 },
      metadata: { phone: '(406) 555-0123', website: 'https://flyshack.example' },
      ...(overrides.properties as Record<string, unknown> | undefined),
    },
  }
}

describe('haversineMiles', () => {
  it('one degree of latitude is ~69 miles', () => {
    expect(haversineMiles(45, -111, 46, -111)).toBeCloseTo(69.09, 1)
  })
  it('zero distance for the same point', () => {
    expect(haversineMiles(45.35, -111.73, 45.35, -111.73)).toBe(0)
  })
})

describe('normalizeShops', () => {
  it('normalizes a full feature with distance from the center', () => {
    const [shop] = normalizeShops([feature()], CENTER.lat, CENTER.lon, 25)
    expect(shop).toEqual({
      name: 'Madison River Fly Shack',
      address: '123 Main St, Ennis, Montana 59729',
      latitude: 45.35,
      longitude: -111.73,
      distanceMiles: 0.1,
      phone: '(406) 555-0123',
      website: 'https://flyshack.example',
    })
  })

  it('nulls missing address/phone/website rather than omitting the shop', () => {
    const [shop] = normalizeShops(
      [
        feature({
          properties: { full_address: undefined, metadata: undefined },
        }),
      ],
      CENTER.lat,
      CENTER.lon,
      25
    )
    expect(shop.address).toBeNull()
    expect(shop.phone).toBeNull()
    expect(shop.website).toBeNull()
  })

  it('falls back to place_formatted, then GeoJSON geometry coordinates', () => {
    const [shop] = normalizeShops(
      [
        feature({
          properties: {
            full_address: undefined,
            place_formatted: 'Ennis, Montana',
            coordinates: undefined,
          },
        }),
      ],
      CENTER.lat,
      CENTER.lon,
      25
    )
    expect(shop.address).toBe('Ennis, Montana')
    expect(shop.latitude).toBe(45.35)
    expect(shop.longitude).toBe(-111.73)
  })

  it('drops features with no name or no coordinates at all', () => {
    const noName = feature({ properties: { name: undefined } })
    const noCoords = feature({ properties: { coordinates: undefined }, geometry: undefined })
    expect(normalizeShops([noName, noCoords], CENTER.lat, CENTER.lon, 25)).toHaveLength(0)
  })

  it('dedupes same-name POI records, keeping the nearest (seen live from Mapbox)', () => {
    const nearer = feature()
    const dupFurther = feature({
      properties: { coordinates: { longitude: -111.7, latitude: 45.4 } },
    })
    const out = normalizeShops([dupFurther, nearer], CENTER.lat, CENTER.lon, 25)
    expect(out).toHaveLength(1)
    expect(out[0].distanceMiles).toBe(0.1)
  })

  it('nulls non-http(s) website values from POI metadata', () => {
    const [shop] = normalizeShops(
      [feature({ properties: { metadata: { website: 'javascript:alert(1)' } } })],
      CENTER.lat,
      CENTER.lon,
      25
    )
    expect(shop.website).toBeNull()
  })

  it('filters to the radius and sorts nearest first', () => {
    const near = feature()
    const far = feature({
      properties: {
        name: 'Bozeman Anglers',
        // ~50 miles northeast of Ennis
        coordinates: { longitude: -111.05, latitude: 45.68 },
      },
    })
    const within25 = normalizeShops([far, near], CENTER.lat, CENTER.lon, 25)
    expect(within25.map((s) => s.name)).toEqual(['Madison River Fly Shack'])

    const within60 = normalizeShops([far, near], CENTER.lat, CENTER.lon, 60)
    expect(within60.map((s) => s.name)).toEqual(['Madison River Fly Shack', 'Bozeman Anglers'])
  })
})
