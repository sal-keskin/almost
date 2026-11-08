import type { Dist } from '../model/types';

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf, |err| < 1.5e-7). */
export function phi(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Inverse standard normal CDF (Acklam, rel. err ~1e-9). */
export function phiInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q: number, r: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Draw from a truncated normal by inverse CDF using one uniform `u`.
 * `dial` multiplies the spread; bounds always hold. dial = 0 returns the mean (clamped).
 */
export function truncNormal(d: Dist, dial: number, u: number): number {
  const sd = d.sd * dial;
  const mean = Math.min(d.max, Math.max(d.min, d.mean));
  if (!(sd > 0)) return mean;
  const lo = phi((d.min - d.mean) / sd);
  const hi = phi((d.max - d.mean) / sd);
  if (hi - lo < 1e-12) return mean;
  const x = d.mean + sd * phiInv(lo + u * (hi - lo));
  return Math.min(d.max, Math.max(d.min, x));
}

export interface Interval {
  p: number;
  lo: number;
  hi: number;
}

/** Wilson score interval for k successes out of n (default 95%). */
export function wilson(k: number, n: number, z = 1.959963984540054): Interval {
  if (n <= 0) return { p: 0, lo: 0, hi: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  // exact edges: no successes → lower bound 0, all successes → upper bound 1
  return { p, lo: k === 0 ? 0 : Math.max(0, centre - half), hi: k === n ? 1 : Math.min(1, centre + half) };
}

/** Regularised lower incomplete gamma P(a, x) (series / continued fraction). */
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const lnGa = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGa);
  }
  // Lentz continued fraction for Q
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGa) * h;
}

function lnGamma(z: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const gj of g) ser += gj / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Percentile (0..1) of a Mahalanobis distance `dist` with `k` independent dimensions (χ_k). */
export function chiPercentile(dist: number, k: number): number {
  if (k <= 0) return 0;
  return gammaP(k / 2, (dist * dist) / 2);
}
