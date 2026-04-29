import { useEffect, useMemo, useRef, useState } from 'react'
import {
  brightStars,
  cityPresets,
  constellations,
} from './catalog'
import {
  clamp,
  degToRad,
  equatorialToHorizontal,
  formatOffset,
  makeSeed,
  normalizeAngle,
  projectToSky,
  seededRandom,
  localSiderealTime,
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
    background: 'radial-gradient(circle at top, #10264b 0%, #07111f 52%, #03060d 100%)',
    line: 'rgba(180, 210, 255, 0.4)',
    starGlow: '#dff2ff',
    card: 'rgba(7, 12, 23, 0.78)',
  },
  dusk: {
    name: 'Dusk',
    background: 'radial-gradient(circle at top, #3f3a76 0%, #1c183b 45%, #09080f 100%)',
    line: 'rgba(255, 214, 170, 0.35)',
    starGlow: '#fff0d9',
    card: 'rgba(17, 13, 33, 0.78)',
  },
  desert: {
    name: 'Desert',
    background: 'radial-gradient(circle at top, #20344c 0%, #121f2c 50%, #05070a 100%)',
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

    const brightest = visibleStars
      .slice()
      .sort((a, b) => a.magnitude - b.magnitude)
      .slice(0, 12)

    return {
      width,
      height,
      visibleStars,
      hiddenStars,
      constellationSegments,
      brightest,
      siderealTime: localSiderealTime(dateTime, longitude),
    }
  }, [allStars, latitude, longitude, dateTime])

  const visibleCount = skyData.visibleStars.length
  const hiddenCount = skyData.hiddenStars.length

  const currentTheme = THEMES[state.theme] || THEMES.midnight

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
              <label><input type="checkbox" checked={state.showLabels} onChange={(event) => setField('showLabels', event.target.checked)} /> Labels</label>
              <label><input type="checkbox" checked={state.showConstellations} onChange={(event) => setField('showConstellations', event.target.checked)} /> Constellations</label>
              <label><input type="checkbox" checked={state.showGrid} onChange={(event) => setField('showGrid', event.target.checked)} /> Grid</label>
              <label><input type="checkbox" checked={state.showNorth} onChange={(event) => setField('showNorth', event.target.checked)} /> North marker</label>
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
              <span>{state.date} · {state.time}</span>
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
              <circle cx="500" cy="500" r="424" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="3" />

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
                  return <line key={azimuth} x1="500" y1="500" x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="8 12" />
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
                  <line x1="500" y1="500" x2="500" y2="76" stroke="rgba(255,255,255,0.38)" strokeWidth="2" />
                  <circle cx="500" cy="78" r="8" fill="rgba(255,255,255,0.8)" />
                  <text x="500" y="60" textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="18">
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
              <strong>{state.date} {state.time}</strong>
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
