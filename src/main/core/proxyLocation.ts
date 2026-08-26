import { existsSync } from 'fs'
import { lookup } from 'dns/promises'
import { join } from 'path'
import maxmind, { CountryResponse, Reader } from 'maxmind'
import { mihomoWorkDir, resourcesFilesDir } from '../utils/dirs'

export interface ProxyLocation {
  countryCode: string
  location: [number, number]
}

type RuntimeProxy = {
  name?: string
  server?: string
  country?: string
  countryCode?: string
  serverDescription?: string
}

// Country centroids are used because country.mmdb contains country data, not coordinates.
const COUNTRY_LOCATIONS: Record<string, [number, number]> = {
  AD: [42.55, 1.58],
  AE: [24.4, 54.3],
  AF: [33.9, 67.7],
  AG: [17.1, -61.8],
  AL: [41.15, 20.1],
  AM: [40.1, 44.5],
  AO: [-11.2, 17.9],
  AR: [-34.0, -64.0],
  AT: [47.6, 14.1],
  AU: [-25.3, 133.8],
  AZ: [40.4, 47.7],
  BA: [44.2, 17.7],
  BB: [13.2, -59.5],
  BD: [23.7, 90.4],
  BE: [50.8, 4.5],
  BF: [12.2, -1.6],
  BG: [42.7, 25.5],
  BH: [26.0, 50.5],
  BI: [-3.4, 29.9],
  BJ: [9.3, 2.3],
  BN: [4.5, 114.7],
  BO: [-17.0, -65.0],
  BR: [-10.8, -52.9],
  BS: [24.3, -76.0],
  BT: [27.5, 90.4],
  BW: [-22.3, 24.7],
  BY: [53.7, 27.9],
  BZ: [17.2, -88.7],
  CA: [56.1, -106.3],
  CD: [-2.9, 23.7],
  CF: [6.6, 20.9],
  CG: [-0.2, 15.8],
  CH: [46.8, 8.2],
  CI: [7.5, -5.5],
  CL: [-33.4, -70.7],
  CM: [5.7, 12.7],
  CN: [35.9, 104.2],
  CO: [4.6, -74.1],
  CR: [9.9, -84.2],
  CU: [21.5, -79.5],
  CV: [16.0, -24.0],
  CY: [35.1, 33.4],
  CZ: [49.8, 15.5],
  DE: [51.2, 10.5],
  DJ: [11.8, 42.6],
  DK: [56.0, 10.0],
  DM: [15.4, -61.4],
  DO: [18.7, -70.2],
  DZ: [28.0, 2.6],
  EC: [-1.4, -78.4],
  EE: [58.6, 25.0],
  EG: [26.8, 30.8],
  ER: [15.2, 39.8],
  ES: [40.3, -3.7],
  ET: [9.1, 40.5],
  FI: [64.0, 26.0],
  FJ: [-17.7, 178.1],
  FM: [7.4, 150.6],
  FR: [46.5, 2.2],
  GA: [-0.8, 11.6],
  GB: [54.0, -2.0],
  GD: [12.1, -61.7],
  GE: [42.3, 43.4],
  GH: [7.9, -1.0],
  GM: [13.5, -15.4],
  GN: [10.4, -10.9],
  GQ: [1.6, 10.4],
  GR: [39.1, 22.9],
  GT: [15.8, -90.2],
  GW: [12.0, -15.0],
  GY: [5.0, -58.9],
  HN: [14.8, -86.9],
  HR: [45.1, 15.2],
  HT: [19.1, -72.3],
  HU: [47.2, 19.5],
  ID: [-2.5, 118.0],
  IE: [53.2, -8.2],
  IL: [31.0, 34.9],
  IN: [22.8, 79.0],
  IQ: [33.2, 43.7],
  IR: [32.4, 53.7],
  IS: [64.9, -19.0],
  IT: [42.8, 12.8],
  JM: [18.1, -77.3],
  JO: [31.3, 36.5],
  JP: [36.2, 138.3],
  KE: [0.2, 37.9],
  KG: [41.2, 74.8],
  KH: [12.6, 104.9],
  KI: [1.9, 173.0],
  KM: [-11.7, 43.3],
  KN: [17.3, -62.7],
  KP: [40.3, 127.5],
  KR: [36.5, 127.9],
  KW: [29.3, 47.5],
  KZ: [48.0, 67.0],
  LA: [18.0, 103.0],
  LB: [33.9, 35.9],
  LI: [47.1, 9.6],
  LK: [7.9, 80.7],
  LR: [6.4, -9.4],
  LS: [-29.6, 28.2],
  LT: [55.2, 23.9],
  LU: [49.8, 6.1],
  LV: [57.0, 24.6],
  LY: [27.0, 17.0],
  MA: [31.8, -7.1],
  MC: [43.7, 7.4],
  MD: [47.2, 28.4],
  ME: [42.7, 19.2],
  MG: [-18.8, 46.9],
  MH: [7.1, 171.2],
  MK: [41.6, 21.7],
  ML: [17.6, -4.0],
  MM: [21.9, 95.9],
  MN: [46.9, 103.8],
  MR: [20.3, -10.9],
  MT: [35.9, 14.4],
  MU: [-20.3, 57.6],
  MV: [3.2, 73.2],
  MW: [-13.3, 34.3],
  MX: [23.6, -102.6],
  MY: [4.2, 101.9],
  MZ: [-18.7, 35.5],
  NA: [-22.1, 17.1],
  NE: [17.6, 8.1],
  NG: [9.1, 8.7],
  NI: [12.9, -85.2],
  NL: [52.2, 5.3],
  NO: [64.5, 12.1],
  NP: [28.4, 84.1],
  NR: [-0.5, 166.9],
  NZ: [-41.8, 172.0],
  OM: [20.5, 56.0],
  PA: [8.5, -80.0],
  PE: [-9.2, -75.0],
  PG: [-6.3, 143.9],
  PH: [12.9, 122.8],
  PK: [30.4, 69.3],
  PL: [52.1, 19.4],
  PS: [31.9, 35.2],
  PT: [39.6, -8.0],
  PW: [7.5, 134.5],
  PY: [-23.4, -58.4],
  QA: [25.3, 51.2],
  RO: [45.9, 24.9],
  RS: [44.0, 20.9],
  RU: [61.5, 105.3],
  RW: [-1.9, 29.9],
  SA: [24.1, 44.5],
  SB: [-8.9, 160.0],
  SC: [-4.7, 55.5],
  SD: [15.6, 30.2],
  SE: [62.0, 15.0],
  SG: [1.35, 103.8],
  SI: [46.1, 14.8],
  SK: [48.7, 19.7],
  SL: [8.5, -11.8],
  SM: [43.9, 12.5],
  SN: [14.5, -14.5],
  SO: [5.2, 46.2],
  SR: [4.1, -55.9],
  SS: [6.9, 30.0],
  SV: [13.8, -88.9],
  SY: [35.0, 38.0],
  SZ: [-26.5, 31.5],
  TD: [15.3, 19.1],
  TG: [8.6, 1.2],
  TH: [15.9, 101.0],
  TJ: [38.9, 71.4],
  TM: [39.1, 59.4],
  TN: [34.0, 9.5],
  TO: [-21.2, -175.2],
  TR: [39.0, 35.2],
  TT: [10.4, -61.2],
  TV: [-8.5, 179.2],
  TW: [23.7, 121.0],
  TZ: [-6.3, 34.9],
  UA: [49.0, 31.4],
  UG: [1.4, 32.3],
  US: [39.8, -98.6],
  UY: [-32.8, -56.0],
  UZ: [41.4, 64.6],
  VA: [41.9, 12.5],
  VC: [13.2, -61.2],
  VE: [7.1, -66.0],
  VN: [16.2, 107.8],
  VU: [-16.4, 167.7],
  WS: [-13.8, -172.1],
  YE: [15.6, 48.5],
  ZA: [-30.6, 22.9],
  ZM: [-13.1, 27.8],
  ZW: [-19.0, 29.2]
}

let readerPromise: Promise<Reader<CountryResponse> | null> | null = null
const locationCache = new Map<string, ProxyLocation | null>()

function getDatabasePath(): string | null {
  for (const basePath of [mihomoWorkDir(), resourcesFilesDir()]) {
    const databasePath = join(basePath, 'country.mmdb')
    if (existsSync(databasePath)) return databasePath
  }
  return null
}

async function getReader() {
  if (!readerPromise) {
    const databasePath = getDatabasePath()
    if (!databasePath) return null
    readerPromise = maxmind.open<CountryResponse>(databasePath).catch(() => null)
  }
  return readerPromise
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) && COUNTRY_LOCATIONS[code] ? code : null
}

function flagToCountryCode(value: string): string | null {
  const flags = [...value.matchAll(/[\u{1F1E6}-\u{1F1FF}]{2}/gu)]
  for (const flag of flags) {
    const code = [...flag[0]]
      .map((character) => String.fromCharCode(character.codePointAt(0)! - 0x1f1e6 + 65))
      .join('')
    const normalized = normalizeCountryCode(code)
    if (normalized) return normalized
  }
  return null
}

const SUBSCRIPTION_COUNTRY_NAMES = Object.entries(COUNTRY_LOCATIONS)
  .flatMap(([code]) =>
    ['en', 'ru', 'zh'].flatMap((locale) => {
      const name = new Intl.DisplayNames([locale], { type: 'region' }).of(code)
      return name ? [{ code, name: name.toLocaleLowerCase(locale) }] : []
    })
  )
  .sort((a, b) => b.name.length - a.name.length)

function textCountryCode(value: string): string | null {
  const flagCode = flagToCountryCode(value)
  if (flagCode) return flagCode

  // Subscription names commonly contain [US], (DE), an ISO code, or a country name.
  const markedCode =
    value.match(/[[(]([A-Za-z]{2})[\])]/) ||
    value.match(/(?:^|[\s|_()-])([A-Za-z]{2})(?=$|[\s|_(),-])/)
  const code = normalizeCountryCode(markedCode?.[1])
  if (code) return code

  const normalizedValue = value.toLocaleLowerCase()
  return (
    SUBSCRIPTION_COUNTRY_NAMES.find(({ name }) =>
      new RegExp(`(?:^|[\\s|_()\\-,])${name}(?=$|[\\s|_()\\-,])`, 'u').test(normalizedValue)
    )?.code || null
  )
}

function subscriptionCountryCode(proxy: RuntimeProxy): string | null {
  for (const value of [proxy.countryCode, proxy.country, proxy.name, proxy.serverDescription]) {
    if (!value) continue
    const code = normalizeCountryCode(value) || textCountryCode(value)
    if (code) return code
  }
  return null
}

function locationForCountry(countryCode: string): ProxyLocation | null {
  const location = COUNTRY_LOCATIONS[countryCode]
  return location ? { countryCode, location } : null
}

function extractHost(server: string): string {
  const value = server.trim().replace(/^\[|\]$/g, '')
  if (value.includes(':') && !value.includes('::')) return value.split(':')[0]
  return value
}

export async function resolveProxyLocation(proxy: RuntimeProxy): Promise<ProxyLocation | null> {
  // Subscription metadata is authoritative. GeoIP is only a fallback for names without metadata.
  const subscriptionCountry = subscriptionCountryCode(proxy)
  if (subscriptionCountry) return locationForCountry(subscriptionCountry)
  if (!proxy.server) return null

  const cacheKey = proxy.server.trim().toLowerCase()
  if (locationCache.has(cacheKey)) return locationCache.get(cacheKey) || null

  try {
    const host = extractHost(proxy.server)
    const address = await lookup(host, { family: 0 }).then((result) => result.address)
    const reader = await getReader()
    const record = reader?.get(address)
    const countryCode = normalizeCountryCode(record?.country?.iso_code)
    const result = countryCode ? locationForCountry(countryCode) : null
    locationCache.set(cacheKey, result)
    return result
  } catch {
    locationCache.set(cacheKey, null)
    return null
  }
}

export function clearProxyLocationCache(): void {
  locationCache.clear()
  readerPromise = null
}
