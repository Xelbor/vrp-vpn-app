export function countryName(countryCode: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(countryCode) || countryCode
  } catch {
    return countryCode
  }
}

export function countryFlag(countryCode: string): string {
  return [...countryCode.toUpperCase()]
    .map((character) => String.fromCodePoint(character.charCodeAt(0) - 65 + 0x1f1e6))
    .join('')
}
