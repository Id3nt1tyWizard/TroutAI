import { describe, expect, it } from 'vitest'
import {
  daysOld,
  isDenylisted,
  normalizeReportLinks,
  placeTokens,
  stripHtml,
  STALE_AFTER_DAYS,
} from './index'

const NOW = new Date('2026-07-04T12:00:00Z')

function raw(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Madison River Fishing Report',
    url: 'https://exampleflyshop.com/reports/madison',
    description: 'Flows are dropping and <strong>caddis</strong> are popping.',
    page_age: '2026-07-01T00:00:00',
    profile: { name: 'Example Fly Shop' },
    meta_url: { hostname: 'exampleflyshop.com' },
    ...overrides,
  }
}

describe('stripHtml', () => {
  it('removes tags and decodes common entities', () => {
    expect(stripHtml('Big <strong>brown</strong> &amp; rainbow &#39;bows&#39;')).toBe(
      "Big brown & rainbow 'bows'"
    )
  })
})

describe('daysOld', () => {
  it('computes whole days', () => {
    expect(daysOld('2026-06-30T12:00:00Z', NOW)).toBe(4)
  })
  it('returns null for missing or garbage dates', () => {
    expect(daysOld(undefined, NOW)).toBeNull()
    expect(daysOld('not a date', NOW)).toBeNull()
  })
})

describe('isDenylisted', () => {
  it('matches the domain and subdomains, not lookalikes', () => {
    expect(isDenylisted('pinterest.com')).toBe(true)
    expect(isDenylisted('www.pinterest.com')).toBe(true)
    expect(isDenylisted('notpinterest.com')).toBe(false)
  })
})

describe('placeTokens', () => {
  it('lowercases and drops short words', () => {
    expect(placeTokens('West Yellowstone', 'Montana')).toEqual([
      'west',
      'yellowstone',
      'montana',
    ])
  })
})

describe('normalizeReportLinks', () => {
  const tokens = ['madison', 'ennis', 'montana']

  it('produces bounded fields with a fresh flag inside the window', () => {
    const [link] = normalizeReportLinks([raw()], tokens, NOW)
    expect(link).toEqual({
      title: 'Madison River Fishing Report',
      url: 'https://exampleflyshop.com/reports/madison',
      sourceName: 'Example Fly Shop',
      date: '2026-07-01T00:00:00',
      snippet: 'Flows are dropping and caddis are popping.',
      stale: false,
      mentionsRegion: true,
    })
  })

  it('flags results past the 14-day window and undated results as stale', () => {
    const old = raw({ page_age: '2026-06-01T00:00:00', url: 'https://a.example/old' })
    const undated = raw({ page_age: undefined, url: 'https://b.example/undated' })
    const [a, b] = normalizeReportLinks([old, undated], tokens, NOW)
    expect(a.stale).toBe(true)
    expect(b.stale).toBe(true)
  })

  it('treats exactly 14 days old as still fresh (flag is "older than")', () => {
    const edge = raw({
      page_age: new Date(NOW.getTime() - STALE_AFTER_DAYS * 86_400_000).toISOString(),
    })
    expect(normalizeReportLinks([edge], tokens, NOW)[0].stale).toBe(false)
  })

  it('drops denylisted domains (by real URL host) and results missing title or url', () => {
    const out = normalizeReportLinks(
      [
        // Denylisted destination with clean-looking engine metadata — the
        // real host decides, not meta_url.
        raw({
          url: 'https://www.pinterest.com/pin/123',
          meta_url: { hostname: 'exampleflyshop.com' },
        }),
        raw({ title: undefined }),
        raw({ url: undefined }),
        raw(),
      ],
      tokens,
      NOW
    )
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://exampleflyshop.com/reports/madison')
  })

  it('falls back to the URL hostname when the engine omits source metadata', () => {
    const [link] = normalizeReportLinks(
      [raw({ profile: undefined, meta_url: undefined })],
      tokens,
      NOW
    )
    expect(link.sourceName).toBe('exampleflyshop.com')
  })

  it('sorts region-mentioning results first without dropping the rest', () => {
    const elsewhere = raw({
      title: 'Generic Fly Fishing Tips',
      description: 'Ten knots every angler should know.',
      url: 'https://a.example/tips',
    })
    const local = raw({ title: 'Ennis area report', url: 'https://b.example/ennis' })
    const out = normalizeReportLinks([elsewhere, local], tokens, NOW)
    expect(out.map((l) => l.mentionsRegion)).toEqual([true, false])
    expect(out).toHaveLength(2)
  })

  it('caps output at six links', () => {
    const many = Array.from({ length: 10 }, (_, i) => raw({ url: `https://x.com/${i}` }))
    expect(normalizeReportLinks(many, tokens, NOW)).toHaveLength(6)
  })

  it('drops duplicate URLs, keeping the first', () => {
    expect(normalizeReportLinks([raw(), raw(), raw()], tokens, NOW)).toHaveLength(1)
  })

  it('rejects non-http(s) and unparseable URLs (they land in <a href>)', () => {
    const out = normalizeReportLinks(
      [
        raw({ url: 'javascript:alert(1)', meta_url: undefined }),
        raw({ url: 'not a url', meta_url: undefined }),
        raw({ url: 'ftp://example.com/report', meta_url: undefined }),
        raw(),
      ],
      tokens,
      NOW
    )
    expect(out).toHaveLength(1)
    expect(out[0].url).toMatch(/^https:/)
  })

  it('truncates snippets to a bounded length', () => {
    const [link] = normalizeReportLinks([raw({ description: 'x'.repeat(500) })], tokens, NOW)
    expect(link.snippet).toHaveLength(280)
  })
})
