import createGlobe, { Globe } from 'cobe'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { countryFlag, countryName } from '@renderer/utils/country-name'
import { clampGlobeTheta, locationToGlobeAngles, projectGlobeLocation } from './globe-math'

export interface ProxyGlobeNode {
  groupName: string
  groupType: string
  current: boolean
  proxy: ControllerProxiesDetail
}

export interface ProxyGlobeCountry {
  countryCode: string
  location: [number, number]
  nodes: ProxyGlobeNode[]
}

interface ProxyGlobeProps {
  countries: ProxyGlobeCountry[]
  locale: string
  switchingProxy: string | null
  onSelect: (groupName: string, proxyName: string) => Promise<void>
}

export function buildProxyGlobeCountries(groups: ControllerMixedGroup[]): {
  countries: ProxyGlobeCountry[]
  unresolvedNodes: number
} {
  const byCountry = new Map<string, ProxyGlobeCountry>()
  let unresolvedNodes = 0

  groups.forEach((group) => {
    group.all.forEach((proxy) => {
      if (!proxy || 'all' in proxy) return
      if (!proxy.location) {
        unresolvedNodes += 1
        return
      }

      const { countryCode, location } = proxy.location
      const country: ProxyGlobeCountry = byCountry.get(countryCode) || {
        countryCode,
        location,
        nodes: []
      }
      const alreadyAdded = country.nodes.some(
        (node) => node.groupName === group.name && node.proxy.name === proxy.name
      )
      if (!alreadyAdded) {
        country.nodes.push({
          groupName: group.name,
          groupType: group.type,
          current: group.now === proxy.name,
          proxy
        })
      }
      byCountry.set(countryCode, country)
    })
  })

  return { countries: [...byCountry.values()], unresolvedNodes }
}

function markerId(countryCode: string): string {
  return `country-${countryCode.toLowerCase()}`
}

function CountryNameLabel({
  countryCode,
  locale
}: {
  countryCode: string
  locale: string
}): React.ReactElement {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="proxy-globe-emoji shrink-0" aria-hidden="true">
        {countryFlag(countryCode)}
      </span>
      <span className="truncate">{countryName(countryCode, locale)}</span>
    </span>
  )
}

function shortestPhiTarget(currentPhi: number, targetPhi: number): number {
  const twoPi = Math.PI * 2
  return currentPhi + ((((targetPhi - currentPhi) % twoPi) + 3 * Math.PI) % twoPi) - Math.PI
}

const AUTO_ROTATE_SPEED = 0.0012
const AUTO_ROTATE_RESUME_DELAY = 2500

interface PositionedMarker {
  countryCode: string
  x: number
  y: number
  originX: number
  originY: number
}

export default function ProxyGlobe({
  countries,
  locale,
  switchingProxy: _switchingProxy,
  onSelect: _onSelect
}: ProxyGlobeProps): React.ReactElement {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const globeRef = useRef<Globe | null>(null)
  const animationRef = useRef<number | null>(null)
  const phiRef = useRef(4)
  const thetaRef = useRef(0.2)
  const targetRotationRef = useRef<{ phi: number; theta: number } | null>(null)
  const pointerRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const autoRotateResumeAtRef = useRef(0)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null)
  const selectedCountryCodeRef = useRef(selectedCountryCode)
  const countriesRef = useRef(countries)
  const markerElementsRef = useRef(new Map<string, HTMLButtonElement>())
  selectedCountryCodeRef.current = selectedCountryCode
  countriesRef.current = countries

  const markers = useMemo(
    () =>
      countries.map((country) => ({
        id: markerId(country.countryCode),
        location: country.location,
        size: country.countryCode === selectedCountryCode ? 0.055 : 0.035
      })),
    [countries, selectedCountryCode]
  )

  const selectCountry = (country: ProxyGlobeCountry): void => {
    const [targetPhi, targetTheta] = locationToGlobeAngles(country.location)
    targetRotationRef.current = {
      phi: shortestPhiTarget(phiRef.current, targetPhi),
      theta: clampGlobeTheta(targetTheta)
    }
    autoRotateResumeAtRef.current = performance.now() + AUTO_ROTATE_RESUME_DELAY
    setSelectedCountryCode(country.countryCode)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const create = (width: number, height: number): void => {
      if (globeRef.current) globeRef.current.destroy()
      globeRef.current = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width,
        height,
        phi: phiRef.current,
        theta: thetaRef.current,
        dark: 1,
        diffuse: 1.2,
        scale: 1,
        mapSamples: 16000,
        mapBrightness: 5,
        mapBaseBrightness: 0.04,
        baseColor: [0.3, 0.3, 0.3],
        markerColor: [1, 1, 1],
        glowColor: [0.1, 0.1, 0.1],
        markerElevation: 0.04,
        markers
      })
    }

    const resizeObserver = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect()
      const size = Math.floor(Math.min(width, height))
      if (size <= 0) return
      if (globeRef.current) {
        globeRef.current.update({ width: size, height: size })
      } else {
        create(size, size)
      }
    })
    resizeObserver.observe(container)

    const animate = (): void => {
      const target = targetRotationRef.current
      if (target && !draggingRef.current) {
        const phiDistance = target.phi - phiRef.current
        const thetaDistance = target.theta - thetaRef.current
        phiRef.current += phiDistance * 0.08
        thetaRef.current = clampGlobeTheta(thetaRef.current + thetaDistance * 0.08)

        if (Math.abs(phiDistance) < 0.001 && Math.abs(thetaDistance) < 0.001) {
          phiRef.current = target.phi
          thetaRef.current = target.theta
          targetRotationRef.current = null
        }
      } else if (!draggingRef.current && performance.now() >= autoRotateResumeAtRef.current) {
        phiRef.current += AUTO_ROTATE_SPEED
      }

      globeRef.current?.update({ phi: phiRef.current, theta: thetaRef.current })

      const { width, height } = container.getBoundingClientRect()
      const projections = countriesRef.current.map((country) => ({
        country,
        projection: projectGlobeLocation(
          country.location,
          phiRef.current,
          thetaRef.current,
          width,
          height
        )
      }))
      const positionedMarkers: PositionedMarker[] = projections
        .filter(({ projection }) => projection.visible)
        .sort(
          (a, b) =>
            Number(b.country.countryCode === selectedCountryCodeRef.current) -
            Number(a.country.countryCode === selectedCountryCodeRef.current)
        )
        .map(({ country, projection }) => ({
          countryCode: country.countryCode,
          x: projection.x * width,
          y: projection.y * height,
          originX: projection.x * width,
          originY: projection.y * height
        }))
      const positions = new Map(
        positionedMarkers.map((marker) => [marker.countryCode, marker] as const)
      )

      projections.forEach(({ country, projection }) => {
        const marker = markerElementsRef.current.get(markerId(country.countryCode))
        if (!marker || width <= 0 || height <= 0) return
        const position = positions.get(country.countryCode)
        marker.style.left = `${position?.x ?? projection.x * width}px`
        marker.style.top = `${position?.y ?? projection.y * height}px`
        marker.style.opacity = projection.visible ? '1' : '0'
        marker.style.filter = projection.visible ? 'none' : 'blur(8px)'
        marker.style.pointerEvents = projection.visible ? 'auto' : 'none'
      })

      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)

    return (): void => {
      resizeObserver.disconnect()
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
      animationRef.current = null
      globeRef.current?.destroy()
      globeRef.current = null
    }
  }, [])

  useEffect(() => {
    globeRef.current?.update({ markers })
  }, [markers])

  useEffect(() => {
    if (
      selectedCountryCode &&
      !countries.some((country) => country.countryCode === selectedCountryCode)
    ) {
      setSelectedCountryCode(null)
      targetRotationRef.current = null
    }
  }, [countries, selectedCountryCode])

  const finishDrag = (pointerId?: number): void => {
    const canvas = canvasRef.current
    if (canvas && pointerId !== undefined && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId)
    }
    pointerRef.current = null
    draggingRef.current = false
    autoRotateResumeAtRef.current = performance.now() + AUTO_ROTATE_RESUME_DELAY
    setIsDragging(false)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    targetRotationRef.current = null
    pointerRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    draggingRef.current = true
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const pointer = pointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return

    const dx = event.clientX - pointer.x
    const dy = event.clientY - pointer.y
    pointerRef.current = { pointerId: pointer.pointerId, x: event.clientX, y: event.clientY }
    phiRef.current += dx / 200
    thetaRef.current = clampGlobeTheta(thetaRef.current + dy / 200)
  }

  return (
    <div className="proxy-globe flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 overflow-hidden px-3 pb-4">
      <div
        ref={containerRef}
        className="relative aspect-square w-[92%] max-w-[min(70vh,700px)] min-w-0 shrink"
      >
        <canvas
          ref={canvasRef}
          className={cn(
            'absolute inset-0 size-full touch-none select-none',
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          )}
          aria-label={t('pages.proxies.globeLabel')}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishDrag(event.pointerId)}
          onPointerCancel={(event) => finishDrag(event.pointerId)}
        />
        <div className="pointer-events-none absolute inset-0 z-10">
          {countries.map((country) => {
            const isSelected = country.countryCode === selectedCountryCode
            return (
              <button
                key={country.countryCode}
                type="button"
                aria-label={countryName(country.countryCode, locale)}
                title={countryName(country.countryCode, locale)}
                onClick={() => selectCountry(country)}
                className={cn(
                  'group pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full cursor-pointer flex-col items-center gap-1 rounded-md outline-none transition-[opacity,filter,transform] duration-300 hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary',
                  isSelected && 'z-10'
                )}
                ref={(element) => {
                  const key = markerId(country.countryCode)
                  if (element) {
                    markerElementsRef.current.set(key, element)
                  } else {
                    markerElementsRef.current.delete(key)
                  }
                }}
                style={{
                  left: '50%',
                  top: '50%',
                  opacity: 0,
                  filter: 'blur(8px)',
                  pointerEvents: 'none'
                }}
              >
                {isSelected && (
                  <div className="proxy-globe-marker-pyramid" aria-hidden="true">
                    <div className="proxy-globe-marker-pyramid-face" />
                    <div className="proxy-globe-marker-pyramid-face" />
                    <div className="proxy-globe-marker-pyramid-face" />
                    <div className="proxy-globe-marker-pyramid-face" />
                  </div>
                )}
                <span
                  className={cn(
                    'proxy-globe-emoji mb-3 text-2xl leading-none drop-shadow-[0_0_8px_rgba(255,255,255,0.45)] transition-opacity duration-150',
                    isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  )}
                  aria-hidden="true"
                >
                  {countryFlag(country.countryCode)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {countries.length > 0 && (
        <div className="flex max-w-full shrink-0 flex-wrap justify-center gap-1.5 overflow-auto px-2">
          {countries.map((country) => (
            <Button
              key={country.countryCode}
              type="button"
              size="sm"
              variant={country.countryCode === selectedCountryCode ? 'secondary' : 'ghost'}
              className="h-7 rounded-full px-2.5 text-xs"
              onClick={() => selectCountry(country)}
            >
              <CountryNameLabel countryCode={country.countryCode} locale={locale} />
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
