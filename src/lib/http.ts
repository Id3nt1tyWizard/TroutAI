/**
 * Shared HTTP helper for the external-data wrappers (geo, weather, usgs).
 *
 * Adds two things plain fetch() doesn't give for free but every wrapper needs,
 * because the Step 4 planner agent fans out many of these calls per trip:
 *   - a request timeout (via AbortController) so a hung upstream can't stall
 *     the whole agent
 *   - bounded retries on transient failures (network error, timeout, 429, 5xx)
 *     with linear backoff
 *
 * Non-2xx responses that aren't transient throw, preserving the wrappers'
 * existing contract: "throw so the agent can surface the issue."
 */

export interface HttpOptions {
  /** Abort the request after this many ms (default 12000) */
  timeoutMs?: number
  /** Max retry attempts on transient failures (default 2) */
  retries?: number
  /** Extra request headers */
  headers?: Record<string, string>
}

const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_RETRIES = 2

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

function isTransientError(err: unknown): boolean {
  // AbortError = our timeout fired; TypeError = fetch network failure
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    err instanceof TypeError
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * GET a URL with timeout + retry. Returns the Response on 2xx; throws on a
 * non-transient non-2xx (or after exhausting retries) and on network failure.
 */
export async function httpGet(
  url: string,
  options: HttpOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options.retries ?? DEFAULT_RETRIES

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let res: Response
    try {
      res = await fetch(url, { headers: options.headers, signal: controller.signal })
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      if (isTransientError(err) && attempt < retries) {
        await delay(250 * (attempt + 1))
        continue
      }
      throw err
    }
    clearTimeout(timer)

    if (res.ok) return res

    if (isRetryableStatus(res.status) && attempt < retries) {
      lastErr = new Error(`HTTP ${res.status}`)
      await delay(250 * (attempt + 1))
      continue
    }
    throw new Error(`Request failed (${res.status}): ${await res.text()}`)
  }
  throw lastErr instanceof Error ? lastErr : new Error('Request failed')
}

export async function fetchJson<T>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  const res = await httpGet(url, {
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
  })
  return (await res.json()) as T
}

export async function fetchText(
  url: string,
  options: HttpOptions = {}
): Promise<string> {
  const res = await httpGet(url, options)
  return res.text()
}
