/**
 * Weather wrapper around Open-Meteo's free Forecast API.
 *
 * Takes lat/lon (typically from the geo wrapper's geocode results) and returns
 * a fishing-oriented forecast: current conditions plus a day-by-day outlook
 * with temperature, precipitation, and wind. No API key required.
 *
 * Open-Meteo returns variables column-oriented (parallel arrays keyed by
 * variable name). This wrapper pivots them into row-oriented day objects so
 * downstream consumers — the planner agent, the spot finder — get one tidy
 * record per day.
 */

import { fetchJson } from '../http'

const DEFAULT_BASE_URL = 'https://api.open-meteo.com/v1'

/** Daily variables we request, in the order Open-Meteo returns them. */
const DAILY_VARS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'weather_code',
] as const

/** Current-conditions variables we request. */
const CURRENT_VARS = [
  'temperature_2m',
  'wind_speed_10m',
  'precipitation',
  'weather_code',
] as const

export interface CurrentWeather {
  /** Local ISO timestamp of the observation (per the forecast timezone) */
  time: string
  temperatureF: number
  windSpeedMph: number
  precipitationIn: number
  /** WMO weather interpretation code */
  weatherCode: number
  /** Human-readable interpretation of `weatherCode` */
  weatherDescription: string
}

export interface DailyForecast {
  /** ISO date, e.g. "2026-06-24" */
  date: string
  tempMaxF: number
  tempMinF: number
  precipitationSumIn: number
  /** Max chance of precipitation across the day, 0–100 */
  precipitationProbabilityMaxPct: number | null
  windSpeedMaxMph: number
  windGustsMaxMph: number
  weatherCode: number
  weatherDescription: string
}

export interface WeatherForecast {
  latitude: number
  longitude: number
  /** IANA timezone the forecast times are expressed in, e.g. "America/Denver" */
  timezone: string
  elevationM: number | null
  current: CurrentWeather | null
  daily: DailyForecast[]
}

export interface WeatherOptions {
  /** Number of forecast days, 1–16 (Open-Meteo caps at 16, default 7) */
  forecastDays?: number
  /** Number of past days to include, 0–92 (default 0) */
  pastDays?: number
  /**
   * IANA timezone for returned timestamps. Defaults to "auto" — Open-Meteo
   * resolves it from the coordinates, which is what trip planning wants.
   */
  timezone?: string
  /** Omit current conditions (saves a little payload) */
  includeCurrent?: boolean
}

interface RawForecastResponse {
  latitude: number
  longitude: number
  timezone: string
  elevation?: number
  current?: Record<string, number | string>
  daily?: Record<string, Array<number | string | null>>
}

function baseUrl() {
  return process.env.OPEN_METEO_FORECAST_BASE_URL ?? DEFAULT_BASE_URL
}

/**
 * Fetch the forecast for a single point. Throws on network / non-2xx so the
 * agent can surface the failure rather than silently planning blind.
 */
export async function getForecast(
  latitude: number,
  longitude: number,
  options: WeatherOptions = {}
): Promise<WeatherForecast> {
  const includeCurrent = options.includeCurrent ?? true

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: DAILY_VARS.join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: options.timezone ?? 'auto',
    forecast_days: String(options.forecastDays ?? 7),
    past_days: String(options.pastDays ?? 0),
  })
  if (includeCurrent) params.set('current', CURRENT_VARS.join(','))

  const url = `${baseUrl()}/forecast?${params.toString()}`
  const data = await fetchJson<RawForecastResponse>(url)

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone,
    elevationM: typeof data.elevation === 'number' ? data.elevation : null,
    current: includeCurrent ? normalizeCurrent(data.current) : null,
    daily: normalizeDaily(data.daily),
  }
}

function normalizeCurrent(
  current: RawForecastResponse['current']
): CurrentWeather | null {
  if (!current) return null
  const code = num(current.weather_code) ?? 0
  return {
    time: String(current.time ?? ''),
    temperatureF: num(current.temperature_2m) ?? NaN,
    windSpeedMph: num(current.wind_speed_10m) ?? NaN,
    precipitationIn: num(current.precipitation) ?? 0,
    weatherCode: code,
    weatherDescription: describeWeatherCode(code),
  }
}

function normalizeDaily(
  daily: RawForecastResponse['daily']
): DailyForecast[] {
  if (!daily?.time) return []
  const dates = daily.time as string[]

  return dates.map((date, i) => {
    const code = num(daily.weather_code?.[i]) ?? 0
    return {
      date,
      tempMaxF: num(daily.temperature_2m_max?.[i]) ?? NaN,
      tempMinF: num(daily.temperature_2m_min?.[i]) ?? NaN,
      precipitationSumIn: num(daily.precipitation_sum?.[i]) ?? 0,
      precipitationProbabilityMaxPct: num(daily.precipitation_probability_max?.[i]),
      windSpeedMaxMph: num(daily.wind_speed_10m_max?.[i]) ?? NaN,
      windGustsMaxMph: num(daily.wind_gusts_10m_max?.[i]) ?? NaN,
      weatherCode: code,
      weatherDescription: describeWeatherCode(code),
    }
  })
}

/** Coerce a possibly-string/null numeric field to a number, or null. */
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isNaN(n) ? null : n
}

/**
 * WMO weather interpretation codes → plain English.
 * https://open-meteo.com/en/docs (see "WMO Weather interpretation codes")
 */
const WMO_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
}

export function describeWeatherCode(code: number): string {
  return WMO_CODES[code] ?? `Unknown (code ${code})`
}
