import { t } from '../i18n';

const MIN = 0, MAX = 3;
const A0 = -135, A1 = 135; // degrees, 0 = up

const toAngle = (v: number) => A0 + ((v - MIN) / (MAX - MIN)) * (A1 - A0);

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arc(cx: number, cy: number, r: number, d0: number, d1: number): string {
  const [x0, y0] = polar(cx, cy, r, d0);
  const [x1, y1] = polar(cx, cy, r, d1);
  const large = d1 - d0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

/**
 * The Luck dial: a rotary control from ×0 (the reported event) to ×3.
 * Works by drag (touch, pen, mouse) and keyboard; exposes role="slider".
 */
export function createDial(value: number, onInput: (v: number) => void, onCommit: (v: number) => void): { el: HTMLElement; set(v: number): void } {
  const el = document.createElement('div');
  el.className = 'dial';
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', t('luck.dial'));
  el.setAttribute('aria-valuemin', String(MIN));
  el.setAttribute('aria-valuemax', String(MAX));
  const ticks: string[] = [];
  for (let v = 0; v <= 3.001; v += 0.25) {
    const major = Math.abs(v - Math.round(v)) < 1e-6;
    const [x0, y0] = polar(66, 66, major ? 52 : 55, toAngle(v));
    const [x1, y1] = polar(66, 66, 60, toAngle(v));
    ticks.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${major ? '#E6E1D8' : 'rgba(255,255,255,.3)'}" stroke-width="1.5" stroke-linecap="round"/>`);
    if (major) {
      const [lx, ly] = polar(66, 66, 70, toAngle(v));
      ticks.push(`<text x="${lx}" y="${ly}" fill="#A9A398" font-size="10" font-family="Geist Mono, monospace" text-anchor="middle" dominant-baseline="middle">${v}</text>`);
    }
  }
  el.innerHTML = `<svg viewBox="0 0 132 132" aria-hidden="true">
    <circle cx="66" cy="66" r="44" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"/>
    <path class="track" d="${arc(66, 66, 44, A0, A1)}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="6" stroke-linecap="round"/>
    <path class="fill" fill="none" stroke="#E8B95A" stroke-width="6" stroke-linecap="round"/>
    ${ticks.join('')}
    <line class="needle" x1="66" y1="66" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>
    <circle class="knob" r="9" fill="#1B1916" stroke="#FFFFFF" stroke-width="1.5"/>
  </svg>`;
  const fill = el.querySelector<SVGPathElement>('.fill')!;
  const needle = el.querySelector<SVGLineElement>('.needle')!;
  const knob = el.querySelector<SVGCircleElement>('.knob')!;
  let v = value;

  function paint() {
    const a = toAngle(v);
    fill.setAttribute('d', v > 0.001 ? arc(66, 66, 44, A0, a) : '');
    const [kx, ky] = polar(66, 66, 44, a);
    knob.setAttribute('cx', String(kx));
    knob.setAttribute('cy', String(ky));
    needle.setAttribute('x2', String(kx));
    needle.setAttribute('y2', String(ky));
    el.setAttribute('aria-valuenow', v.toFixed(2));
    el.setAttribute('aria-valuetext', `×${v.toFixed(2)}`);
  }
  paint();

  function fromPointer(e: PointerEvent): number {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
    if (deg > 180) deg -= 360;
    deg = Math.max(A0, Math.min(A1, deg));
    const raw = MIN + ((deg - A0) / (A1 - A0)) * (MAX - MIN);
    return Math.round(raw * 20) / 20; // 0.05 steps
  }

  let dragging = false;
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.setPointerCapture(e.pointerId);
    v = fromPointer(e);
    paint();
    onInput(v);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const nv = fromPointer(e);
    if (nv !== v) {
      v = nv;
      paint();
      onInput(v);
    }
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    onCommit(v);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.25 : 0.05;
    let nv = v;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nv = v + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nv = v - step;
    else if (e.key === 'Home') nv = MIN;
    else if (e.key === 'End') nv = MAX;
    else return;
    e.preventDefault();
    v = Math.round(Math.max(MIN, Math.min(MAX, nv)) * 100) / 100;
    paint();
    onInput(v);
    onCommit(v);
  });

  return {
    el,
    set(nv: number) {
      v = nv;
      paint();
    },
  };
}
