import type { Vec2 } from '../model/types';

/** Uniformly resampled path: point k is at arc length k·ds. */
export interface SampledPath {
  xs: Float64Array;
  ys: Float64Array;
  ds: number;
  length: number;
}

const DS = 0.02;

/**
 * Pull each interior vertex toward the inside of its turn so that it sits
 * `cut` metres (perpendicular) inside both original edges. Negative = wider.
 */
export function applyCut(path: Vec2[], cut: number): Vec2[] {
  if (cut === 0 || path.length < 3) return path.map((p) => ({ ...p }));
  const out = path.map((p) => ({ ...p }));
  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i - 1], v = path[i], n = path[i + 1];
    const ax = p.x - v.x, ay = p.y - v.y;
    const bx = n.x - v.x, by = n.y - v.y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) continue;
    const ux = ax / la + bx / lb, uy = ay / la + by / lb;
    const lu = Math.hypot(ux, uy);
    if (lu < 1e-6) continue; // straight through
    const cosPhi = (ax * bx + ay * by) / (la * lb);
    const half = Math.acos(Math.max(-1, Math.min(1, cosPhi))) / 2;
    const s = Math.sin(half);
    if (s < 1e-3) continue;
    const k = cut / s;
    out[i] = { x: v.x + (ux / lu) * k, y: v.y + (uy / lu) * k };
  }
  return out;
}

/** Replace interior vertices by circular fillets of radius `r` (shrunk if edges are short). */
export function roundCorners(path: Vec2[], r: number): Vec2[] {
  if (path.length < 3 || r <= 0) return path.map((p) => ({ ...p }));
  const out: Vec2[] = [{ ...path[0] }];
  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i - 1], v = path[i], n = path[i + 1];
    const ax = p.x - v.x, ay = p.y - v.y;
    const bx = n.x - v.x, by = n.y - v.y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) continue;
    const cosPhi = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    const phi = Math.acos(cosPhi);
    if (phi > Math.PI - 1e-3) {
      out.push({ ...v });
      continue;
    }
    const tanHalf = Math.tan(phi / 2);
    let t = r / tanHalf;
    t = Math.min(t, la / 2, lb / 2);
    const rr = t * tanHalf;
    const u1x = ax / la, u1y = ay / la, u2x = bx / lb, u2y = by / lb;
    const sx = v.x + u1x * t, sy = v.y + u1y * t;
    const ex = v.x + u2x * t, ey = v.y + u2y * t;
    const bxs = u1x + u2x, bys = u1y + u2y;
    const bl = Math.hypot(bxs, bys);
    const dc = rr / Math.sin(phi / 2);
    const cx = v.x + (bxs / bl) * dc, cy = v.y + (bys / bl) * dc;
    const a0 = Math.atan2(sy - cy, sx - cx);
    const a1 = Math.atan2(ey - cy, ex - cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 36)));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (da * k) / steps;
      out.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) });
    }
  }
  out.push({ ...path[path.length - 1] });
  return out;
}

export function resample(pts: Vec2[], ds = DS): SampledPath {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const length = cum[cum.length - 1];
  const n = Math.max(2, Math.floor(length / ds) + 2);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = Math.min(k * ds, length);
    while (seg < pts.length - 2 && cum[seg + 1] < s) seg++;
    const l = cum[seg + 1] - cum[seg];
    const t = l > 0 ? (s - cum[seg]) / l : 0;
    xs[k] = pts[seg].x + (pts[seg + 1].x - pts[seg].x) * t;
    ys[k] = pts[seg].y + (pts[seg + 1].y - pts[seg].y) * t;
  }
  return { xs, ys, ds, length };
}

export function buildPath(path: Vec2[], cut: number, cornerRadius: number): SampledPath {
  return resample(roundCorners(applyCut(path, cut), cornerRadius));
}

/** Position at arc length s; beyond the ends the path is extended along its end tangents. */
export function pointAt(p: SampledPath, s: number, out: { x: number; y: number }): void {
  const n = p.xs.length;
  if (s <= 0) {
    const hx = p.xs[1] - p.xs[0], hy = p.ys[1] - p.ys[0];
    const l = Math.hypot(hx, hy) || 1;
    out.x = p.xs[0] + (hx / l) * s;
    out.y = p.ys[0] + (hy / l) * s;
    return;
  }
  if (s >= p.length) {
    const hx = p.xs[n - 1] - p.xs[n - 3], hy = p.ys[n - 1] - p.ys[n - 3];
    const l = Math.hypot(hx, hy) || 1;
    const e = s - p.length;
    out.x = p.xs[n - 1] + (hx / l) * e;
    out.y = p.ys[n - 1] + (hy / l) * e;
    return;
  }
  const f = s / p.ds;
  const i = Math.min(n - 2, Math.floor(f));
  const t = f - i;
  out.x = p.xs[i] + (p.xs[i + 1] - p.xs[i]) * t;
  out.y = p.ys[i] + (p.ys[i + 1] - p.ys[i]) * t;
}
