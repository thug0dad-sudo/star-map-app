export const degToRad = (deg) => (deg * Math.PI) / 180
export const radToDeg = (rad) => (rad * 180) / Math.PI

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360
}

export function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5
}

export function greenwichMeanSiderealTime(date) {
  const jd = julianDay(date)
  const t = (jd - 2451545.0) / 36525
  const gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * t * t -
    (t * t * t) / 38710000
  return normalizeAngle(gmst)
}

export function localSiderealTime(date, longitude) {
  return normalizeAngle(greenwichMeanSiderealTime(date) + longitude)
}

export function equatorialToHorizontal({ ra, dec, latitude, longitude, date }) {
  const lst = localSiderealTime(date, longitude)
  const ha = normalizeAngle(lst - ra)
  const haRad = degToRad(ha)
  const decRad = degToRad(dec)
  const latRad = degToRad(latitude)

  const sinAlt =
    Math.sin(decRad) * Math.sin(latRad) +
    Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad)
  const alt = Math.asin(clamp(sinAlt, -1, 1))

  const y = -Math.sin(haRad)
  const x =
    Math.tan(decRad) * Math.cos(latRad) -
    Math.sin(latRad) * Math.cos(haRad)
  const az = Math.atan2(y, x)

  return {
    altitude: radToDeg(alt),
    azimuth: normalizeAngle(radToDeg(az) + 180),
  }
}

export function projectToSky({ altitude, azimuth, width, height, padding = 36 }) {
  const radius = Math.min(width, height) / 2 - padding
  const centerX = width / 2
  const centerY = height / 2
  const visibleAltitude = clamp(altitude, 0, 90)
  const r = ((90 - visibleAltitude) / 90) * radius
  const angle = degToRad(azimuth)

  return {
    x: centerX + r * Math.sin(angle),
    y: centerY - r * Math.cos(angle),
    r,
    radius,
  }
}

export function formatOffset(offsetHours) {
  const sign = offsetHours >= 0 ? '+' : '-'
  const abs = Math.abs(offsetHours)
  const hours = Math.floor(abs)
  const mins = Math.round((abs - hours) * 60)
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function makeSeed(input) {
  let seed = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    seed ^= input.charCodeAt(i)
    seed = Math.imul(seed, 16777619)
  }
  return seed >>> 0
}

export function seededRandom(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
