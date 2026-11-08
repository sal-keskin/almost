import type { SwarmResult } from '../engine/swarm';
import type { Camera } from './camera';

const GOLD = '232,185,90';

export function ghostAlpha(n: number): number {
  return Math.min(0.14, Math.max(0.035, 0.14 * Math.sqrt(150 / n)));
}
export function goldAlpha(n: number): number {
  return Math.min(0.42, Math.max(0.1, 0.42 * Math.sqrt(120 / n)));
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Cached bitmap of the swarm's trajectories. It accumulates replays in index
 * order, so the fade-in (oldest replays first) costs one batch per frame.
 */
export class SwarmLayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private result: SwarmResult | null = null;
  private drawn = 0;
  private camVersion = -1;
  private animStart = 0;
  private dpr = 1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  setResult(r: SwarmResult | null, animate = true): void {
    this.result = r;
    this.drawn = 0;
    this.clear();
    this.animStart = animate && !reducedMotion() ? performance.now() : -1;
  }

  resize(w: number, h: number, dpr: number): void {
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.dpr = dpr;
      this.drawn = 0;
    }
  }

  private clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Bring the bitmap up to date. Returns true while the fade-in is still running. */
  update(cam: Camera): boolean {
    const r = this.result;
    if (cam.version !== this.camVersion) {
      this.camVersion = cam.version;
      this.drawn = 0;
      this.clear();
      if (this.animStart >= 0 && performance.now() - this.animStart > 650) this.animStart = -1;
    }
    if (!r) return false;
    let target = r.n;
    if (this.animStart >= 0) {
      const k = Math.min(1, (performance.now() - this.animStart) / 600);
      target = Math.floor(r.n * k);
      if (k >= 1) this.animStart = -1;
    }
    if (target > this.drawn) {
      this.draw(cam, r, this.drawn, target);
      this.drawn = target;
    }
    return this.drawn < r.n;
  }

  private draw(cam: Camera, r: SwarmResult, from: number, to: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const gA = ghostAlpha(r.n), cA = goldAlpha(r.n);
    const stride = r.actors * r.frames * 2;
    const { scale, ox, oy } = cam;
    for (let i = from; i < to; i++) {
      const contact = r.contact[i] === 1;
      ctx.strokeStyle = contact ? `rgba(${GOLD},${cA})` : `rgba(255,255,255,${gA})`;
      ctx.beginPath();
      for (let a = 0; a < r.actors; a++) {
        let pen = false;
        let lx = NaN, ly = NaN;
        const base = i * stride + a * r.frames * 2;
        for (let f = 0; f < r.frames; f++) {
          const x = r.traj[base + 2 * f];
          if (x !== x) {
            pen = false;
            continue;
          }
          const y = r.traj[base + 2 * f + 1];
          if (pen && x === lx && y === ly) continue;
          const sx = ox + x * scale, sy = oy + y * scale;
          if (pen) ctx.lineTo(sx, sy);
          else ctx.moveTo(sx, sy);
          pen = true;
          lx = x;
          ly = y;
        }
      }
      ctx.stroke();
    }
  }
}
