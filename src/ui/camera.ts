/** World (metres) ↔ screen (CSS px). */
export class Camera {
  scale = 50; // px per metre
  ox = 0;
  oy = 0;
  version = 0;

  toScreen(x: number, y: number): [number, number] {
    return [this.ox + x * this.scale, this.oy + y * this.scale];
  }
  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.ox) / this.scale, (sy - this.oy) / this.scale];
  }
  fit(w: number, h: number, viewW: number, viewH: number, pad = 28): void {
    const s = Math.min((viewW - 2 * pad) / w, (viewH - 2 * pad - 40) / h);
    this.scale = Math.max(5, s);
    this.ox = (viewW - w * this.scale) / 2;
    this.oy = (viewH - 40 - h * this.scale) / 2;
    this.version++;
  }
  zoomAt(sx: number, sy: number, factor: number): void {
    const ns = Math.min(400, Math.max(8, this.scale * factor));
    const f = ns / this.scale;
    this.ox = sx - (sx - this.ox) * f;
    this.oy = sy - (sy - this.oy) * f;
    this.scale = ns;
    this.version++;
  }
  pan(dx: number, dy: number): void {
    this.ox += dx;
    this.oy += dy;
    this.version++;
  }
}
