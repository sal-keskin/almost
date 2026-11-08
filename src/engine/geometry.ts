import type { Furniture, Vec2 } from '../model/types';

export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/** A body part: circle (r > 0, no poly) or convex polygon. */
export interface Shape {
  /** circle centre (or polygon centroid) */
  x: number;
  y: number;
  r: number;
  /** polygon vertices as flat [x0,y0,x1,y1,...]; empty for circles */
  poly: number[];
}

export function furnitureCorners(f: Furniture): Vec2[] {
  const a = (f.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const hw = f.w / 2;
  const hd = f.d / 2;
  const pts: Array<[number, number]> = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return pts.map(([x, y]) => ({ x: f.center.x + x * c - y * s, y: f.center.y + x * s + y * c }));
}

function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

/** Proper or touching intersection of segments p1p2 and p3p4. */
export function segmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): boolean {
  const d1 = cross(x3, y3, x4, y4, x1, y1);
  const d2 = cross(x3, y3, x4, y4, x2, y2);
  const d3 = cross(x1, y1, x2, y2, x3, y3);
  const d4 = cross(x1, y1, x2, y2, x4, y4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True if nothing in `occluders` crosses the sight line p→q. */
export function lineOfSight(px: number, py: number, qx: number, qy: number, occluders: Seg[]): boolean {
  for (let i = 0; i < occluders.length; i++) {
    const s = occluders[i];
    if (segmentsIntersect(px, py, qx, qy, s.ax, s.ay, s.bx, s.by)) return false;
  }
  return true;
}

export interface Closest {
  d: number;
  /** closest point on the segment */
  x: number;
  y: number;
}

export function pointSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): Closest {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { d: Math.hypot(px - x, py - y), x, y };
}

export function pointInPoly(px: number, py: number, poly: number[]): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[2 * i], yi = poly[2 * i + 1];
    const xj = poly[2 * j], yj = poly[2 * j + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface Gap {
  /** clearance in metres; ≤ 0 means the shapes overlap */
  d: number;
  /** a point between the two shapes at the closest approach */
  x: number;
  y: number;
}

function circlePoly(c: Shape, p: Shape): Gap {
  const poly = p.poly;
  const n = poly.length / 2;
  let best: Closest = { d: Infinity, x: 0, y: 0 };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cl = pointSegment(c.x, c.y, poly[2 * i], poly[2 * i + 1], poly[2 * j], poly[2 * j + 1]);
    if (cl.d < best.d) best = cl;
  }
  if (pointInPoly(c.x, c.y, poly)) return { d: -c.r, x: c.x, y: c.y };
  return { d: best.d - c.r, x: best.x, y: best.y };
}

function polyPoly(a: Shape, b: Shape): Gap {
  const pa = a.poly, pb = b.poly;
  const na = pa.length / 2, nb = pb.length / 2;
  for (let i = 0; i < na; i++) if (pointInPoly(pa[2 * i], pa[2 * i + 1], pb)) return { d: 0, x: pa[2 * i], y: pa[2 * i + 1] };
  for (let i = 0; i < nb; i++) if (pointInPoly(pb[2 * i], pb[2 * i + 1], pa)) return { d: 0, x: pb[2 * i], y: pb[2 * i + 1] };
  for (let i = 0; i < na; i++) {
    const i2 = (i + 1) % na;
    for (let j = 0; j < nb; j++) {
      const j2 = (j + 1) % nb;
      if (segmentsIntersect(pa[2 * i], pa[2 * i + 1], pa[2 * i2], pa[2 * i2 + 1], pb[2 * j], pb[2 * j + 1], pb[2 * j2], pb[2 * j2 + 1])) {
        return { d: 0, x: (pa[2 * i] + pb[2 * j]) / 2, y: (pa[2 * i + 1] + pb[2 * j + 1]) / 2 };
      }
    }
  }
  let best: Gap = { d: Infinity, x: 0, y: 0 };
  const scan = (p: number[], q: number[]) => {
    const np = p.length / 2, nq = q.length / 2;
    for (let i = 0; i < np; i++) {
      for (let j = 0; j < nq; j++) {
        const j2 = (j + 1) % nq;
        const cl = pointSegment(p[2 * i], p[2 * i + 1], q[2 * j], q[2 * j + 1], q[2 * j2], q[2 * j2 + 1]);
        if (cl.d < best.d) best = { d: cl.d, x: (cl.x + p[2 * i]) / 2, y: (cl.y + p[2 * i + 1]) / 2 };
      }
    }
  };
  scan(pa, pb);
  scan(pb, pa);
  return best;
}

export function shapeGap(a: Shape, b: Shape): Gap {
  const ac = a.poly.length === 0;
  const bc = b.poly.length === 0;
  if (ac && bc) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const d = dist - a.r - b.r;
    const t = dist > 0 ? (a.r + Math.max(d, 0) / 2) / dist : 0;
    return { d, x: a.x + dx * t, y: a.y + dy * t };
  }
  if (ac) return circlePoly(a, b);
  if (bc) return circlePoly(b, a);
  return polyPoly(a, b);
}

/** Smallest gap between two bodies made of several shapes. */
export function bodyGap(a: Shape[], b: Shape[]): Gap {
  let best: Gap = { d: Infinity, x: 0, y: 0 };
  for (const sa of a) for (const sb of b) {
    const g = shapeGap(sa, sb);
    if (g.d < best.d) best = g;
  }
  return best;
}

export function snap(v: number, grid = 0.1): number {
  return Math.round(v / grid) * grid;
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
