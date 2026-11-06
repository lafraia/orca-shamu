// Adapted from Bloub by Jérémy Perret, MIT. See resources/licenses/bloub.txt for source and license.
import type { BotIdentity } from '../../../../shared/bot-identity'

type Point = { x: number; y: number }
type Vec3 = [number, number, number]
const r2 = (n: number): number => Math.round(n * 100) / 100

function closedPath(points: Point[]): string {
  const n = points.length
  let d = `M${r2(points[0].x)} ${r2(points[0].y)}`
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n],
      p1 = points[i],
      p2 = points[(i + 1) % n],
      p3 = points[(i + 2) % n]
    d += `C${r2(p1.x + (p2.x - p0.x) / 6)} ${r2(p1.y + (p2.y - p0.y) / 6)} ${r2(p2.x - (p3.x - p1.x) / 6)} ${r2(p2.y - (p3.y - p1.y) / 6)} ${r2(p2.x)} ${r2(p2.y)}`
  }
  return `${d}Z`
}

export function blobBodyPath(shape: NonNullable<BotIdentity['shape']>, phase = 0): string {
  return closedPath(
    Array.from({ length: 48 }, (_, index) => {
      const angle = (index / 48) * Math.PI * 2
      const radius =
        shape === 'star'
          ? 35 + 8 * Math.cos(6 * angle)
          : shape === 'cloud'
            ? 38 + 4 * Math.cos(5 * angle) + 2 * Math.sin(3 * angle)
            : shape === 'squircle'
              ? 37 / (Math.abs(Math.cos(angle)) ** 4 + Math.abs(Math.sin(angle)) ** 4) ** 0.25
              : 43
      const wave = 1 + phase * 0.045 * Math.sin(3 * angle + 0.5)
      return { x: 50 + Math.cos(angle) * radius * wave, y: 50 + Math.sin(angle) * radius * wave }
    })
  )
}

function spin(u: Vec3, v: Vec3, degrees: number): [Vec3, Vec3] {
  const angle = (degrees * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle)
  return [
    [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s],
    [v[0] * c - u[0] * s, v[1] * c - u[1] * s, v[2] * c - u[2] * s]
  ]
}

export function blobEyeTransforms(expression: BotIdentity['expression']): string[] {
  let forward: Vec3 = [0, 0, 1],
    right: Vec3 = [1, 0, 0],
    down: Vec3 = [0, 1, 0]
  ;[forward, right] = spin(forward, right, expression === 'curious' ? -18 : 28.49)
  ;[down, forward] = spin(down, forward, 28.62)
  ;[right, down] = spin(right, down, expression === 'curious' ? 13 : -13)
  return [-1, 1].map((side) => {
    const [eye, tangent] = spin(forward, right, 15.46 * side)
    return `matrix(${r2(tangent[0])} ${r2(tangent[1])} ${r2(down[0])} ${r2(down[1])} ${r2(50 + eye[0] * 43)} ${r2(50 + eye[1] * 43)})`
  })
}
