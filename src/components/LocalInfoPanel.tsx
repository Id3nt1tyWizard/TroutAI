'use client'

/**
 * Shared renderer for Stage 6 local info: report links (6a) + nearby fly
 * shops (6b). Used by the Spot Finder, the planner, and the /reports page.
 *
 * Report links are untrusted, unverified web content — always attributed to
 * their source ("According to …"), never presented as the app's own claim,
 * and flagged when stale (older than 14 days or undated). Links open in a new
 * tab with rel="nofollow" so we never vouch for the destination.
 */

import type { FlyShop, ReportLink } from '@/lib/local-info'

function formatDate(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return new Date(t).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function ReportLinksSection({ links }: { links: ReportLink[] }) {
  if (links.length === 0) return null
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        Local shop &amp; guide reports
      </h2>
      <p className="mt-1 mb-4 text-xs text-slate-500">
        Live, unverified web results — informational links only, not TroutAI&apos;s own claims.
      </p>
      <ul className="space-y-4">
        {links.map((link) => (
          <li key={link.url}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-sm font-medium text-sky-400 hover:underline"
              >
                {link.title} ↗
              </a>
              {link.stale && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-amber-950/60 border-amber-800/60 text-amber-300">
                  may be stale — verify before relying on it
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              According to <span className="italic">{link.sourceName}</span>
              {link.date ? `, posted ${formatDate(link.date)}` : ' — undated'}
            </div>
            {link.snippet && <p className="mt-1 text-xs text-slate-500">{link.snippet}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function FlyShopsSection({ shops }: { shops: FlyShop[] }) {
  if (shops.length === 0) return null
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
        Nearby fly shops
      </h2>
      <ul className="space-y-3">
        {shops.map((shop) => (
          <li key={`${shop.name}|${shop.latitude}|${shop.longitude}`} className="text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-slate-200">{shop.name}</span>
              <span className="text-xs text-slate-500">{shop.distanceMiles} mi</span>
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              {shop.address && <span>{shop.address}</span>}
              {shop.phone && (
                <span>
                  {shop.address && ' · '}
                  <a href={`tel:${shop.phone}`} className="hover:text-slate-200">
                    {shop.phone}
                  </a>
                </span>
              )}
              {shop.website && (
                <span>
                  {(shop.address || shop.phone) && ' · '}
                  <a
                    href={shop.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline"
                  >
                    website ↗
                  </a>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Both sections, rendering nothing when there is nothing to show. */
export default function LocalInfoPanel({
  links,
  shops,
}: {
  links: ReportLink[] | null
  shops: FlyShop[] | null
}) {
  const hasLinks = !!links && links.length > 0
  const hasShops = !!shops && shops.length > 0
  if (!hasLinks && !hasShops) return null
  return (
    <div className="space-y-6">
      {hasLinks && <ReportLinksSection links={links} />}
      {hasShops && <FlyShopsSection shops={shops} />}
    </div>
  )
}
