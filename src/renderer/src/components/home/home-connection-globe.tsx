import createGlobe, { Globe } from 'cobe'
import { useEffect, useId, useRef } from 'react'
import { countryFlag } from '@renderer/utils/country-name'
import {
  locationToGlobeAngles,
  nearestGlobePhi,
  projectGlobeLocation
} from '@renderer/components/proxies/globe-math'

interface HomeConnectionGlobeProps {
  location?: ControllerProxyLocation
  connected: boolean
  hovered: boolean
  title?: string
}

type Color = [number, number, number]

type AnimationState = {
  startedAt: number
  duration: number
  fromPhi: number
  toPhi: number
  fromTheta: number
  toTheta: number
  fromBaseColor: Color
  toBaseColor: Color
  fromGlowColor: Color
  toGlowColor: Color
  fromMarkerColor: Color
  toMarkerColor: Color
}

const NEUTRAL_ROTATION: [number, number] = [4, 0.2]
const DISCONNECTED_BASE_COLOR: Color = [0.3, 0.3, 0.3]
const DISCONNECTED_GLOW_COLOR: Color = [0.1, 0.1, 0.1]
const DISCONNECTED_MARKER_COLOR: Color = [1, 1, 1]
const CONNECTED_BASE_COLOR: Color = [0.3, 0.5, 0.3]
const CONNECTED_GLOW_COLOR: Color = [0.1, 0.3, 0.1]
const CONNECTED_MARKER_COLOR: Color = [0.1, 1, 0.2]
const HOVER_GLOW_COLOR: Color = [0.3, 0.3, 0.3]
const STATE_ANIMATION_DURATION = 700
const HOVER_ANIMATION_DURATION = 250
const HOME_GLOBE_SCALE = 1.08
const AUTO_ROTATION_SPEED = (Math.PI * 2) / 90000
const MAP_SAMPLES = 8000

function colorsForConnection(
  connected: boolean,
  hovered: boolean
): {
  baseColor: Color
  glowColor: Color
  markerColor: Color
} {
  const colors = connected
    ? {
        baseColor: CONNECTED_BASE_COLOR,
        glowColor: CONNECTED_GLOW_COLOR,
        markerColor: CONNECTED_MARKER_COLOR
      }
    : {
        baseColor: DISCONNECTED_BASE_COLOR,
        glowColor: DISCONNECTED_GLOW_COLOR,
        markerColor: DISCONNECTED_MARKER_COLOR
      }

  return !connected && hovered ? { ...colors, glowColor: HOVER_GLOW_COLOR } : colors
}

function markersForLocation(
  location?: ControllerProxyLocation
): { location: [number, number]; size: number }[] {
  return location ? [{ location: location.location, size: 0.055 }] : []
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

function mixColor(from: Color, to: Color, progress: number): Color {
  return [
    mix(from[0], to[0], progress),
    mix(from[1], to[1], progress),
    mix(from[2], to[2], progress)
  ]
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2
}

export default function HomeConnectionGlobe({
  location,
  connected,
  hovered,
  title
}: HomeConnectionGlobeProps): React.ReactElement {
  const orbitPathId = `orbitPath-${useId().replace(/:/g, '')}`
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<Globe | null>(null)
  const locationRef = useRef(location)
  const connectedRef = useRef(connected)
  const hoveredRef = useRef(hovered)
  const currentPhiRef = useRef(NEUTRAL_ROTATION[0])
  const currentThetaRef = useRef(NEUTRAL_ROTATION[1])
  const currentBaseColorRef = useRef<Color>(colorsForConnection(connected, hovered).baseColor)
  const currentGlowColorRef = useRef<Color>(colorsForConnection(connected, hovered).glowColor)
  const currentMarkerColorRef = useRef<Color>(colorsForConnection(connected, hovered).markerColor)
  const animationRef = useRef<AnimationState | null>(null)
  const frameRef = useRef<number | null>(null)
  const rotationFrameRef = useRef<number | null>(null)
  const lastRotationTimeRef = useRef<number | null>(null)
  const reducedMotionRef = useRef(false)
  const mountedRef = useRef(false)
  const pulseRef = useRef<HTMLSpanElement>(null)
  const markerRef = useRef<HTMLSpanElement>(null)
  const previousCountryRef = useRef(location?.countryCode)
  const previousConnectedRef = useRef(connected)
  const previousHoveredRef = useRef(hovered)
  const locationKey = location
    ? `${location.countryCode}:${location.location[0]}:${location.location[1]}`
    : 'none'
  const previousLocationKeyRef = useRef(locationKey)
  locationRef.current = location
  connectedRef.current = connected
  hoveredRef.current = hovered

  const updateMarkerPosition = (): void => {
    const marker = markerRef.current
    const container = containerRef.current
    const currentLocation = locationRef.current
    if (!marker || !container || !currentLocation) {
      if (marker) marker.style.opacity = '0'
      return
    }

    const { width, height } = container.getBoundingClientRect()
    if (width <= 0 || height <= 0) return

    const projection = projectGlobeLocation(
      currentLocation.location,
      currentPhiRef.current,
      currentThetaRef.current,
      width,
      height,
      HOME_GLOBE_SCALE
    )
    marker.style.left = `${projection.x * width}px`
    marker.style.top = `${projection.y * height}px`
    marker.style.opacity = projection.visible ? '1' : '0'
    marker.style.filter = projection.visible ? 'none' : 'blur(8px)'
  }

  const renderAnimation = (time: number): void => {
    frameRef.current = null
    const animation = animationRef.current
    const globe = globeRef.current
    if (!animation || !globe) return

    const rawProgress = Math.min(1, (time - animation.startedAt) / animation.duration)
    const progress = easeInOutCubic(rawProgress)
    currentPhiRef.current = mix(animation.fromPhi, animation.toPhi, progress)
    currentThetaRef.current = mix(animation.fromTheta, animation.toTheta, progress)
    currentBaseColorRef.current = mixColor(animation.fromBaseColor, animation.toBaseColor, progress)
    currentGlowColorRef.current = mixColor(animation.fromGlowColor, animation.toGlowColor, progress)
    currentMarkerColorRef.current = mixColor(
      animation.fromMarkerColor,
      animation.toMarkerColor,
      progress
    )
    globe.update({
      phi: currentPhiRef.current,
      theta: currentThetaRef.current,
      baseColor: currentBaseColorRef.current,
      glowColor: currentGlowColorRef.current,
      markerColor: currentMarkerColorRef.current
    })
    updateMarkerPosition()

    if (rawProgress < 1) {
      frameRef.current = requestAnimationFrame(renderAnimation)
    } else {
      animationRef.current = null
    }
  }

  const renderRotation = (time: number): void => {
    rotationFrameRef.current = null
    const globe = globeRef.current

    if (!globe || !mountedRef.current || !connectedRef.current || reducedMotionRef.current) {
      lastRotationTimeRef.current = null
      return
    }

    const lastTime = lastRotationTimeRef.current
    lastRotationTimeRef.current = time
    if (lastTime !== null && !animationRef.current) {
      const delta = Math.min(time - lastTime, 64)
      currentPhiRef.current += delta * AUTO_ROTATION_SPEED
      globe.update({ phi: currentPhiRef.current })
      updateMarkerPosition()
    }

    rotationFrameRef.current = requestAnimationFrame(renderRotation)
  }

  const stopRotation = (): void => {
    if (rotationFrameRef.current !== null) cancelAnimationFrame(rotationFrameRef.current)
    rotationFrameRef.current = null
    lastRotationTimeRef.current = null
  }

  const startRotation = (): void => {
    if (
      rotationFrameRef.current !== null ||
      !connectedRef.current ||
      reducedMotionRef.current ||
      !globeRef.current
    ) {
      return
    }
    lastRotationTimeRef.current = null
    rotationFrameRef.current = requestAnimationFrame(renderRotation)
  }

  const startAnimation = (
    targetPhi: number,
    targetTheta: number,
    targetBase: Color,
    targetGlow: Color,
    targetMarker: Color,
    duration = STATE_ANIMATION_DURATION
  ): void => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)

    if (reducedMotionRef.current) {
      animationRef.current = null
      currentPhiRef.current = targetPhi
      currentThetaRef.current = targetTheta
      currentBaseColorRef.current = targetBase
      currentGlowColorRef.current = targetGlow
      currentMarkerColorRef.current = targetMarker
      globeRef.current?.update({
        phi: targetPhi,
        theta: targetTheta,
        baseColor: targetBase,
        glowColor: targetGlow,
        markerColor: targetMarker
      })
      updateMarkerPosition()
      return
    }

    animationRef.current = {
      startedAt: performance.now(),
      duration,
      fromPhi: currentPhiRef.current,
      toPhi: nearestGlobePhi(currentPhiRef.current, targetPhi),
      fromTheta: currentThetaRef.current,
      toTheta: targetTheta,
      fromBaseColor: currentBaseColorRef.current,
      toBaseColor: targetBase,
      fromGlowColor: currentGlowColorRef.current,
      toGlowColor: targetGlow,
      fromMarkerColor: currentMarkerColorRef.current,
      toMarkerColor: targetMarker
    }
    frameRef.current = requestAnimationFrame(renderAnimation)
  }

  const triggerPulse = (): void => {
    const pulse = pulseRef.current
    if (!pulse || reducedMotionRef.current) return
    pulse.classList.remove('home-globe-success-pulse')
    void pulse.offsetWidth
    pulse.classList.add('home-globe-success-pulse')
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    mountedRef.current = true
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = mediaQuery.matches
    const onMotionChange = (event: MediaQueryListEvent): void => {
      reducedMotionRef.current = event.matches
      if (event.matches) {
        stopRotation()
      } else if (connectedRef.current) {
        startRotation()
      }
    }
    mediaQuery.addEventListener('change', onMotionChange)

    const canvas = document.createElement('canvas')
    canvas.className = 'pointer-events-none block size-full'
    canvas.setAttribute('aria-hidden', 'true')
    container.append(canvas)

    let lastSize = 0
    let refreshTimers: ReturnType<typeof setTimeout>[] = []
    const refresh = (): void => {
      globeRef.current?.update({
        phi: currentPhiRef.current,
        theta: currentThetaRef.current,
        baseColor: currentBaseColorRef.current,
        glowColor: currentGlowColorRef.current,
        markerColor: currentMarkerColorRef.current,
        markers: markersForLocation(locationRef.current)
      })
      updateMarkerPosition()
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const size = Math.floor(Math.min(entry.contentRect.width, entry.contentRect.height))
      if (size <= 0 || size === lastSize) return
      lastSize = size
      const currentLocation = locationRef.current
      const [phi, theta] = currentLocation
        ? locationToGlobeAngles(currentLocation.location)
        : NEUTRAL_ROTATION
      const colors = colorsForConnection(connectedRef.current, hoveredRef.current)

      if (!globeRef.current) {
        currentPhiRef.current = phi
        currentThetaRef.current = theta
        currentBaseColorRef.current = colors.baseColor
        currentGlowColorRef.current = colors.glowColor
        currentMarkerColorRef.current = colors.markerColor
        globeRef.current = createGlobe(canvas, {
          devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          width: size,
          height: size,
          phi,
          theta,
          markers: markersForLocation(currentLocation),
          dark: 1,
          diffuse: 1.2,
          scale: HOME_GLOBE_SCALE,
          mapSamples: MAP_SAMPLES,
          mapBrightness: 6,
          mapBaseBrightness: 0.1,
          baseColor: colors.baseColor,
          markerColor: colors.markerColor,
          glowColor: colors.glowColor,
          markerElevation: 0.04
        })
        refreshTimers = [0, 100, 350].map((delay) => setTimeout(refresh, delay))
        if (connectedRef.current) startRotation()
      } else {
        globeRef.current.update({ width: size, height: size })
      }
      updateMarkerPosition()
    })

    resizeObserver.observe(container)
    return (): void => {
      mountedRef.current = false
      resizeObserver.disconnect()
      mediaQuery.removeEventListener('change', onMotionChange)
      refreshTimers.forEach((timer) => clearTimeout(timer))
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      stopRotation()
      animationRef.current = null
      globeRef.current?.destroy()
      globeRef.current = null
      container.replaceChildren()
    }
  }, [])

  useEffect(() => {
    if (!mountedRef.current || !globeRef.current) return

    const hoverOnlyChange =
      previousLocationKeyRef.current === locationKey &&
      previousConnectedRef.current === connected &&
      previousHoveredRef.current !== hovered

    if (hoverOnlyChange && connected) {
      previousHoveredRef.current = hovered
      return
    }

    const currentLocation = locationRef.current
    const [targetPhi, targetTheta] = currentLocation
      ? locationToGlobeAngles(currentLocation.location)
      : NEUTRAL_ROTATION
    const colors = colorsForConnection(connected, hovered)
    if (!connected) stopRotation()
    globeRef.current.update({
      markers: markersForLocation(currentLocation),
      markerColor: colors.markerColor
    })
    startAnimation(
      targetPhi,
      targetTheta,
      colors.baseColor,
      colors.glowColor,
      colors.markerColor,
      hoverOnlyChange ? HOVER_ANIMATION_DURATION : STATE_ANIMATION_DURATION
    )
    if (connected) startRotation()

    const countryChanged =
      previousCountryRef.current !== undefined &&
      currentLocation?.countryCode !== undefined &&
      previousCountryRef.current !== currentLocation.countryCode
    const connectedNow = !previousConnectedRef.current && connected
    if (countryChanged || connectedNow) triggerPulse()
    previousCountryRef.current = currentLocation?.countryCode
    previousConnectedRef.current = connected
    previousHoveredRef.current = hovered
    previousLocationKeyRef.current = locationKey
  }, [locationKey, connected, hovered])

  return (
    <div className="pointer-events-none relative size-full" aria-hidden="true">
      <div ref={containerRef} className="absolute inset-0" />
      {connected && (
        <div className="globe-overlay" aria-hidden="true">
          <div className="orbit-ring" aria-hidden="true">
            <svg className="orbit-svg" viewBox="0 0 300 300" aria-hidden="true">
              <defs>
                <path
                  id={orbitPathId}
                  d="M 150,150 m -142,0 a 142,142 0 1,0 284,0 a 142,142 0 1,0 -284,0"
                />
              </defs>
              <text className="orbit-text">
                <textPath href={`#${orbitPathId}`}>{(title + ' · ').repeat(10)}</textPath>
              </text>
            </svg>
          </div>
        </div>
      )}
      {location?.countryCode && (
        <span
          ref={markerRef}
          className="proxy-globe-emoji pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+0.75rem)] text-2xl leading-none drop-shadow-[0_0_8px_rgba(255,255,255,0.45)] transition-[opacity,filter] duration-150"
          aria-hidden="true"
          style={{ left: '50%', top: '50%', opacity: 0, filter: 'blur(8px)' }}
        >
          {countryFlag(location.countryCode)}
        </span>
      )}
      <span
        ref={pulseRef}
        className="pointer-events-none absolute inset-[10%] z-10 rounded-full border border-success/60 opacity-0"
      />
    </div>
  )
}
