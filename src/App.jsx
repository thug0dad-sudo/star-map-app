import { useEffect, useMemo, useRef, useState } from 'react'
import { brightStars, cityPresets, constellations } from './catalog'
import {
  clamp,
  degToRad,
  equatorialToHorizontal,
  formatOffset,
  localSiderealTime,
  makeSeed,
  normalizeAngle,
  projectToSky,
  seededRandom,
} from './astronomy'

const DEFAULT_STATE = {
  locationName: 'New York City',
  latitude: '40.7128',
  longitude: '-74.0060',
  timezone: '-4',
  date: '2026-04-28',
  time: '22:00',
  showLabels: true,
  showConstellations: true,
  showGrid: true,
  showNorth: true,
  theme: 'midnight',
  title: 'My sky on Earth',
  subtitle: 'A star map generated from place + date',
}

const THEMES = {
  midnight: {
    name: 'Midnight',
    background:
      'radial-gradient(circle at top, #10264b 0%, #07111f 52%, #03060d 100%)',
    line: 'rgba(180, 210, 255, 0.4)',
    starGlow: '#dff2ff',
    card: 'rgba(7, 12, 23, 0.78)',
  },
  dusk: {
    name: 'Dusk',
    background:
      'radial-gradient(circle at top, #3f3a76 0%, #1c183b 45%, #09080f 100%)',
    line: 'rgba(255, 214, 170, 0.35)',
    starGlow: '#fff0d9',
    card: 'rgba(17, 13, 33, 0.78)',
  },
  desert: {
    name: 'Desert',
    background:
      'radial-gradient(circle at top, #20344c 0%, #121f2c 50%, #05070a 100%)',
    line: 'rgba(255, 225, 185, 0.28)',
    starGlow: '#fff3df',
    card: 'rgba(12, 17, 22, 0.76)',
  },
}

function parseQuery() {
  if (typeof window === 'undefined') return DEFAULT_STATE
  const params = new URLSearchParams(window.location.search)
  return {
    ...DEFAULT_STATE,
    locationName: params.get('locationName') || DEFAULT_STATE.locationName,
    latitude: params.get('latitude') || DEFAULT_STATE.latitude,
    longitude: params.get('longitude') || DEFAULT_STATE.longitude,
    timezone: params.get('timezone') || DEFAULT_STATE.timezone,
    date: params.get('date') || DEFAULT_STATE.date,
    time: params.get('time') || DEFAULT_STATE.time,
    showLabels: params.get('showLabels') !== 'false',
    showConstellations: params.get('showConstellations') !== 'false',
    showGrid: params.get('showGrid') !== 'false',
    showNorth: params.get('showNorth') !== 'false',
    theme: params.get('theme') || DEFAULT_STATE.theme,
    title: params.get('title') || DEFAULT_STATE.title,
    subtitle: params.get('subtitle') || DEFAULT_STATE.subtitle,
  }
}

function buildDateTime(dateString, timeString, timezoneHours) {
  const [year, month, day] = dateString.split('-').map(Number)
  const [hour, minute] = timeString.split(':').map(Number)
  const utcMs = Date.UTC(year, month - 1, day, hour - timezoneHours, minute)
  return new Date(utcMs)
}

function seededBackgroundStars(seed, count = 260) {
  const rand = seededRandom(seed)
  return Array.from({ length: count }, (_, index) => {
    const ra = rand() * 360
    const dec = Math.asin(rand() * 2 - 1) * (180 / Math.PI)
    const magnitude = 2.5 + rand() * 4.5
    return {
      id: `bg-${index}`,
      ra,
      dec,
      magnitude,
    }
  })
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(totalMinutes) {
  const minutesInDay = 24 * 60
  const normalized = ((Math.round(totalMinutes) % minutesInDay) + minutesInDay) % minutesInDay
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function estimatedTimezoneFromLongitude(longitude) {
  return Math.round((longitude / 15) * 2) / 2
}

function mapLatLonToPoint(latitude, longitude, width = 1000, height = 500) {
  const x = ((longitude + 180) / 360) * width
  const y = ((90 - latitude) / 180) * height
  return { x, y }
}

function mapPointToLatLon(x, y, width = 1000, height = 500) {
  const longitude = (x / width) * 360 - 180
  const latitude = 90 - (y / height) * 180
  return {
    latitude: clamp(latitude, -90, 90),
    longitude: clamp(longitude, -180, 180),
  }
}

function App() {
  const [state, setState] = useState(parseQuery)
  const svgRef = useRef(null)

  useEffect(() => {
    const params = new URLSearchParams()
    Object.entries(state).forEach(([key, value]) => {
      if (value === DEFAULT_STATE[key]) return
      params.set(key, String(value))
    })
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`
    window.history.replaceState(null, '', next)
  }, [state])

  const timezoneHours = Number(state.timezone) || 0
  const latitude = clamp(Number(state.latitude) || 0, -90, 90)
  const longitude = clamp(Number(state.longitude) || 0, -180, 180)
  const dateTime = useMemo(
    () => buildDateTime(state.date, state.time, timezoneHours),
    [state.date, state.time, timezoneHours],
  )
  const timeMinutes = useMemo(() => timeToMinutes(state.time), [state.time])

  const allStars = useMemo(() => {
    const seed = makeSeed(`${state.locationName}-${state.date}-${state.time}`)
    return [...brightStars, ...seededBackgroundStars(seed)]
  }, [state.locationName, state.date, state.time])

  const skyData = useMemo(() => {
    const width = 1000
    const height = 1000
    const visibleStars = []
    const hiddenStars = []

    for (const star of allStars) {
      const horizontal = equatorialToHorizontal({
        ra: star.ra,
        dec: star.dec,
        latitude,
        longitude,
        date: dateTime,
      })
      const projected = projectToSky({
        altitude: horizontal.altitude,
        azimuth: horizontal.azimuth,
        width,
        height,
      })
      const displayMagnitude = star.magnitude
      const brightness = clamp(1.4 - (displayMagnitude + 1.5) * 0.18, 0.15, 1)
      const radius = clamp(4.8 - displayMagnitude * 0.85, 0.8, 5.8)
      const item = {
        ...star,
        ...horizontal,
        ...projected,
        brightness,
        radius,
      }
      if (horizontal.altitude >= -0.5) visibleStars.push(item)
      else hiddenStars.push(item)
    }

    const byId = new Map(visibleStars.map((star) => [star.id, star]))
    const constellationSegments = constellations.flatMap((constellation) =>
      constellation.lines
        .map(([from, to]) => [byId.get(from), byId.get(to)])
        .filter(([from, to]) => from && to),
    )

    return {
      width,
      height,
      visibleStars,
      hiddenStars,
      constellationSegments,
      siderealTime: localSiderealTime(dateTime, longitude),
    }
  }, [allStars, latitude, longitude, dateTime])

  const visibleCount = skyData.visibleStars.length
  const hiddenCount = skyData.hiddenStars.length
  const currentTheme = THEMES[state.theme] || THEMES.midnight
  const pinnedPoint = mapLatLonToPoint(latitude, longitude)

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href)
  }

  async function handleDownloadSvg() {
    const svg = svgRef.current
    if (!svg) return
    const clone = svg.cloneNode(true)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const xml = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${state.locationName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-star-map.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  function setField(name, value) {
    setState((prev) => ({ ...prev, [name]: value }))
  }

  function applyPreset(preset) {
    setState((prev) => ({
      ...prev,
      locationName: preset.label,
      latitude: String(preset.latitude),
      longitude: String(preset.longitude),
      timezone: String(preset.timezone),
    }))
  }

  function handleDropPin(event) {
    const svg = event.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 1000
    const y = ((event.clientY - rect.top) / rect.height) * 500
    const { latitude: nextLat, longitude: nextLon } = mapPointToLatLon(x, y)
    const estimatedTimezone = estimatedTimezoneFromLongitude(nextLon)

    setState((prev) => ({
      ...prev,
      locationName: 'Custom pin',
      latitude: nextLat.toFixed(4),
      longitude: nextLon.toFixed(4),
      timezone: String(estimatedTimezone),
    }))
  }

  return (
    <main
      className="app-shell"
      style={{
        background: currentTheme.background,
        color: '#f4f8ff',
      }}
    >
      <section className="hero">
        <div>
          <p className="eyebrow">Live star map generator</p>
          <h1>Generate the sky from any place and date.</h1>
          <p className="hero-copy">
            Pick a location, choose a moment, and the app plots a sky dome with
            real star positions, constellation lines, and export-ready output.
          </p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Visible stars</span>
            <strong>{visibleCount}</strong>
          </div>
          <div>
            <span>Below horizon</span>
            <strong>{hiddenCount}</strong>
          </div>
          <div>
            <span>Sidereal time</span>
            <strong>{normalizeAngle(skyData.siderealTime).toFixed(1)}°</strong>
          </div>
        </div>
      </section>

      <section className="layout">
        <aside className="control-panel" style={{ background: currentTheme.card }}>
          <div className="panel-section">
            <h2>Location</h2>
            <label>
              Place name
              <input
                value={state.locationName}
                onChange={(event) => setField('locationName', event.target.value)}
                placeholder="City or place"
              />
            </label>
            <div className="two-up">
              <label>
                Latitude
                <input
                  type="number"
                  step="0.0001"
                  value={state.latitude}
                  onChange={(event) => setField('latitude', event.target.value)}
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step="0.0001"
                  value={state.longitude}
                  onChange={(event) => setField('longitude', event.target.value)}
                />
              </label>
            </div>
            <label>
              Timezone offset
              <input
                type="number"
                step="0.5"
                value={state.timezone}
                onChange={(event) => setField('timezone', event.target.value)}
              />
            </label>

            <div className="pin-map-card">
              <div className="map-heading">
                <div>
                  <strong>Drop a pin</strong>
                  <p>Click anywhere on the world map to set latitude and longitude.</p>
                </div>
                <span>{latitude.toFixed(2)}°, {longitude.toFixed(2)}°</span>
              </div>

              <svg
                className="pin-map"
                viewBox="0 0 1000 500"
                role="img"
                aria-label="World map pin selector"
                onClick={handleDropPin}
              >
                <defs>
                  <linearGradient id="mapOcean" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#163a63" />
                    <stop offset="100%" stopColor="#0b1d33" />
                  </linearGradient>
                </defs>
                <rect width="1000" height="500" rx="24" fill="url(#mapOcean)" />
                {[0, 30, 60, -30, -60].map((lat) => {
                  const y = 250 - (lat / 180) * 500
                  return <line key={lat} x1="0" x2="1000" y1={y} y2={y} stroke="rgba(255,255,255,0.1)" strokeDasharray="8 10" />
                })}
                {[-180, -120, -60, 0, 60, 120, 180].map((lon) => {
                  const x = ((lon + 180) / 360) * 1000
                  return <line key={lon} y1="0" y2="500" x1={x} x2={x} stroke="rgba(255,255,255,0.1)" strokeDasharray="8 10" />
                })}
                <circle
                  cx={pinnedPoint.x}
                  cy={pinnedPoint.y}
                  r="11"
                  fill="#fefefe"
                  opacity="0.95"
                />
                <circle
                  cx={pinnedPoint.x}
                  cy={pinnedPoint.y}
                  r="24"
                  fill="rgba(255,255,255,0.18)"
                />
                <path
                  d={`M ${pinnedPoint.x} ${pinnedPoint.y + 10} C ${pinnedPoint.x - 8} ${pinnedPoint.y + 32}, ${pinnedPoint.x + 8} ${pinnedPoint.y + 32}, ${pinnedPoint.x} ${pinnedPoint.y + 54} C ${pinnedPoint.x - 8} ${pinnedPoint.y + 32}, ${pinnedPoint.x + 8} ${pinnedPoint.y + 32}, ${pinnedPoint.x} ${pinnedPoint.y + 10} Z`}
                  fill="#ff6b6b"
                />
                <text x="24" y="34" fill="rgba(255,255,255,0.72)" fontSize="20">
                  Click to drop a pin
                </text>
              </svg>
            </div>
          </div>

          <div className="panel-section">
            <h2>Date & time</h2>
            <div className="two-up">
              <label>
                Date
                <input
                  type="date"
                  value={state.date}
                  onChange={(event) => setField('date', event.target.value)}
                />
              </label>
              <label>
                Time
                <input
                  type="time"
                  value={state.time}
                  onChange={(event) => setField('time', event.target.value)}
                />
              </label>
            </div>
            <label className="slider-label">
              Time slider
              <input
                type="range"
                min="0"
                max="1435"
                step="5"
                value={timeMinutes}
                onChange={(event) => setField('time', minutesToTime(Number(event.target.value)))}
              />
            </label>
            <div className="range-row">
              <span>00:00</span>
              <span>{state.time}</span>
              <span>23:55</span>
            </div>
            <p className="hint">Shown as local time using {formatOffset(timezoneHours)}.</p>
          </div>

          <div className="panel-section">
            <h2>Style</h2>
            <label>
              Theme
              <select
                value={state.theme}
                onChange={(event) => setField('theme', event.target.value)}
              >
                {Object.entries(THEMES).map(([key, theme]) => (
                  <option key={key} value={key}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                value={state.title}
                onChange={(event) => setField('title', event.target.value)}
              />
            </label>
            <label>
              Subtitle
              <input
                value={state.subtitle}
                onChange={(event) => setField('subtitle', event.target.value)}
              />
            </label>
            <div className="toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={state.showLabels}
                  onChange={(event) => setField('showLabels', event.target.checked)}
                />{' '}
                Labels
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={state.showConstellations}
                  onChange={(event) => setField('showConstellations', event.target.checked)}
                />{' '}
                Constellations
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={state.showGrid}
                  onChange={(event) => setField('showGrid', event.target.checked)}
                />{' '}
                Grid
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={state.showNorth}
                  onChange={(event) => setField('showNorth', event.target.checked)}
                />{' '}
                North marker
              </label>
            </div>
          </div>

          <div className="panel-section">
            <h2>Quick presets</h2>
            <div className="preset-grid">
              {cityPresets.map((preset) => (
                <button key={preset.label} type="button" onClick={() => applyPreset(preset)}>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="action-row">
            <button type="button" className="primary" onClick={handleDownloadSvg}>
              Download SVG
            </button>
            <button type="button" onClick={handleCopyLink}>
              Copy link
            </button>
          </div>
        </aside>

        <section className="preview-panel" aria-label="Star map preview">
          <div className="preview-header">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>{state.title}</h2>
              <p className="preview-copy">{state.subtitle}</p>
            </div>
            <div className="preview-meta">
              <span>{state.locationName}</span>
              <span>
                {state.date} · {state.time}
              </span>
            </div>
          </div>

          <div className="sky-frame">
            <svg
              ref={svgRef}
              viewBox="0 0 1000 1000"
              role="img"
              aria-label={`Star map for ${state.locationName} on ${state.date} at ${state.time}`}
            >
              <defs>
                <radialGradient id="skyGlow" cx="50%" cy="40%" r="70%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.09)" />
                  <stop offset="60%" stopColor="rgba(255,255,255,0.02)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
                <filter id="starBlur">
                  <feGaussianBlur stdDeviation="1.6" />
                </filter>
              </defs>

              <rect width="1000" height="1000" fill="#040711" />
              <circle cx="500" cy="500" r="470" fill="url(#skyGlow)" />
              <circle
                cx="500"
                cy="500"
                r="424"
                fill="none"
                stroke="rgba(255,255,255,0.28)"
                strokeWidth="3"
              />

              {state.showGrid &&
                [15, 30, 45, 60, 75].map((altitude) => {
                  const radius = ((90 - altitude) / 90) * 424
                  return (
                    <circle
                      key={altitude}
                      cx="500"
                      cy="500"
                      r={radius}
                      fill="none"
                      stroke="rgba(255,255,255,0.08)"
                      strokeDasharray="8 12"
                    />
                  )
                })}

              {state.showGrid &&
                [0, 90, 180, 270].map((azimuth) => {
                  const angle = degToRad(azimuth)
                  const x = 500 + 424 * Math.sin(angle)
                  const y = 500 - 424 * Math.cos(angle)
                  return (
                    <line
                      key={azimuth}
                      x1="500"
                      y1="500"
                      x2={x}
                      y2={y}
                      stroke="rgba(255,255,255,0.08)"
                      strokeDasharray="8 12"
                    />
                  )
                })}

              {state.showConstellations &&
                skyData.constellationSegments.map(([from, to], index) => (
                  <line
                    key={`${from.id}-${to.id}-${index}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={currentTheme.line}
                    strokeWidth="2"
                  />
                ))}

              {skyData.visibleStars.map((star) => (
                <g key={star.id}>
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={star.radius}
                    fill={currentTheme.starGlow}
                    opacity={star.brightness}
                    filter="url(#starBlur)"
                  />
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={Math.max(0.7, star.radius * 0.36)}
                    fill="#fffdf7"
                    opacity={Math.min(1, star.brightness + 0.2)}
                  />
                  {state.showLabels && star.magnitude < 1.6 && (
                    <text x={star.x + 10} y={star.y - 8} fill="rgba(255,255,255,0.72)" fontSize="18">
                      {star.id}
                    </text>
                  )}
                </g>
              ))}

              {state.showNorth && (
                <g>
                  <line
                    x1="500"
                    y1="500"
                    x2="500"
                    y2="76"
                    stroke="rgba(255,255,255,0.38)"
                    strokeWidth="2"
                  />
                  <circle cx="500" cy="78" r="8" fill="rgba(255,255,255,0.8)" />
                  <text
                    x="500"
                    y="60"
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.8)"
                    fontSize="18"
                  >
                    N
                  </text>
                </g>
              )}

              <text x="56" y="70" fill="rgba(255,255,255,0.9)" fontSize="24">
                {state.locationName}
              </text>
              <text x="56" y="104" fill="rgba(255,255,255,0.68)" fontSize="18">
                {state.date} · {state.time} · {formatOffset(timezoneHours)}
              </text>
              <text x="944" y="942" textAnchor="end" fill="rgba(255,255,255,0.55)" fontSize="16">
                {visibleCount} stars visible
              </text>
            </svg>
          </div>

          <div className="info-grid">
            <div>
              <span>Latitude</span>
              <strong>{Number(state.latitude).toFixed(4)}°</strong>
            </div>
            <div>
              <span>Longitude</span>
              <strong>{Number(state.longitude).toFixed(4)}°</strong>
            </div>
            <div>
              <span>Local time</span>
              <strong>
                {state.date} {state.time}
              </strong>
            </div>
            <div>
              <span>Mode</span>
              <strong>{THEMES[state.theme]?.name || state.theme}</strong>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
