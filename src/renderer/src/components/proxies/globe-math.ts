export interface GlobeMarkerProjection {
  x: number
  y: number
  visible: boolean
}

export function clampGlobeTheta(theta: number): number {
  const maxTheta = Math.PI / 2 - 0.01
  return Math.max(-maxTheta, Math.min(maxTheta, theta))
}

export function locationToGlobeAngles([latitude, longitude]: [number, number]): [number, number] {
  return [
    Math.PI - ((longitude * Math.PI) / 180 - Math.PI / 2),
    clampGlobeTheta((latitude * Math.PI) / 180)
  ]
}

export function nearestGlobePhi(currentPhi: number, targetPhi: number): number {
  const twoPi = Math.PI * 2
  return currentPhi + ((((targetPhi - currentPhi) % twoPi) + 3 * Math.PI) % twoPi) - Math.PI
}

export function projectGlobeLocation(
  location: [number, number],
  phi: number,
  theta: number,
  width: number,
  height: number,
  scale = 1
): GlobeMarkerProjection {
  const [latitude, longitude] = location
  const latitudeRadians = (latitude * Math.PI) / 180
  const longitudeRadians = (longitude * Math.PI) / 180 - Math.PI
  const cosLatitude = Math.cos(latitudeRadians)
  const point: [number, number, number] = [
    -cosLatitude * Math.cos(longitudeRadians),
    Math.sin(latitudeRadians),
    cosLatitude * Math.sin(longitudeRadians)
  ]
  const markerRadius = 0.84 * scale
  const x3 = point[0] * markerRadius
  const y3 = point[1] * markerRadius
  const z3 = point[2] * markerRadius
  const cosTheta = Math.cos(theta)
  const cosPhi = Math.cos(phi)
  const sinTheta = Math.sin(theta)
  const sinPhi = Math.sin(phi)
  const aspect = width / height || 1
  const rotatedX = cosPhi * x3 + sinPhi * z3
  const rotatedY = sinPhi * sinTheta * x3 + cosTheta * y3 - cosPhi * sinTheta * z3
  const rotatedZ = -sinPhi * cosTheta * x3 + sinTheta * y3 + cosPhi * cosTheta * z3

  return {
    x: (rotatedX / aspect + 1) / 2,
    y: (-rotatedY + 1) / 2,
    visible: rotatedZ >= 0 || rotatedX * rotatedX + rotatedY * rotatedY >= 0.64 * scale * scale
  }
}
