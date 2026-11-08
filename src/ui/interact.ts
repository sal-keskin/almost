import type { Store } from '../model/store';
import type { Vec2 } from '../model/types';
import { furnitureCorners, pointInPoly, pointSegment, snap } from '../engine/geometry';
import type { Camera } from './camera';
import type { UIState } from './state';

export interface InteractHost {
  store: Store;
  ui: UIState;
  cam: Camera;
  /** something visual changed */
  redraw(): void;
  /** selection or panel-relevant state changed */
  panel(): void;
  /** user tapped a point in the Luck screen */
  pick(sx: number, sy: number): void;
}

const HIT = 22; // px, touch-sized
const TAP = 8; // px of movement still counted as a tap

let uid = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

type Gesture =
  | { kind: 'pan'; lx: number; ly: number }
  | { kind: 'wall-end'; id: string; end: 'a' | 'b' }
  | { kind: 'wall-move'; id: string; start: Vec2; a: Vec2; b: Vec2 }
  | { kind: 'furn-move'; id: string; start: Vec2; c: Vec2 }
  | { kind: 'wall-new'; id: string }
  | { kind: 'vertex'; actor: number; index: number }
  | { kind: 'tap-furniture' }
  | { kind: 'tap-pick' };

/** Pointer Events for mouse, pen and touch alike. One finger edits; two fingers pan and zoom. */
export function attachInteraction(canvas: HTMLCanvasElement, host: InteractHost): void {
  const pts = new Map<number, { x: number; y: number }>();
  let g: Gesture | null = null;
  let downAt = { x: 0, y: 0 };
  let moved = false;
  let pinch: { d: number; mx: number; my: number } | null = null;

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const world = (p: { x: number; y: number }): Vec2 => {
    const [x, y] = host.cam.toWorld(p.x, p.y);
    return { x, y };
  };
  const snapped = (p: { x: number; y: number }): Vec2 => {
    const w = world(p);
    return { x: snap(w.x), y: snap(w.y) };
  };

  function startSingle(p: { x: number; y: number }) {
    const { ui, store, cam } = host;
    const scene = store.scene;
    if (ui.screen === 'draw') {
      if (ui.drawTool === 'wall') {
        const a = snapped(p);
        const id = newId('w');
        store.begin();
        store.live((s) => s.walls.push({ id, a, b: { ...a } }));
        ui.selection = { kind: 'wall', id };
        g = { kind: 'wall-new', id };
        return;
      }
      if (ui.drawTool === 'furniture') {
        g = { kind: 'tap-furniture' };
        return;
      }
      // select tool: the nearest wall end wins if it is close; a tap inside furniture
      // wins over a wall end that is merely within the touch radius; then wall bodies
      const wp = world(p);
      let endHit: { id: string; end: 'a' | 'b'; d: number } | null = null;
      for (const w of scene.walls) {
        for (const end of ['a', 'b'] as const) {
          const [sx, sy] = cam.toScreen(w[end].x, w[end].y);
          const d = Math.hypot(sx - p.x, sy - p.y);
          if (d < HIT && (!endHit || d < endHit.d)) endHit = { id: w.id, end, d };
        }
      }
      let furnHit: string | null = null;
      for (let i = scene.furniture.length - 1; i >= 0 && !furnHit; i--) {
        const f = scene.furniture[i];
        const poly = furnitureCorners(f).flatMap((c) => [c.x, c.y]);
        if (pointInPoly(wp.x, wp.y, poly) || Math.hypot(f.center.x - wp.x, f.center.y - wp.y) * cam.scale < HIT) furnHit = f.id;
      }
      if (endHit && (!furnHit || endHit.d < HIT * 0.45)) {
        store.begin();
        ui.selection = { kind: 'wall', id: endHit.id };
        g = { kind: 'wall-end', id: endHit.id, end: endHit.end };
        host.panel();
        return;
      }
      if (furnHit) {
        const f = scene.furniture.find((x) => x.id === furnHit)!;
        store.begin();
        ui.selection = { kind: 'furniture', id: f.id };
        g = { kind: 'furn-move', id: f.id, start: wp, c: { ...f.center } };
        host.panel();
        return;
      }
      for (const w of scene.walls) {
        const d = pointSegment(wp.x, wp.y, w.a.x, w.a.y, w.b.x, w.b.y).d * cam.scale;
        if (d < HIT * 0.6) {
          store.begin();
          ui.selection = { kind: 'wall', id: w.id };
          g = { kind: 'wall-move', id: w.id, start: wp, a: { ...w.a }, b: { ...w.b } };
          host.panel();
          return;
        }
      }
      if (ui.selection) {
        ui.selection = null;
        host.panel();
      }
      g = { kind: 'pan', lx: p.x, ly: p.y };
      return;
    }
    if (ui.screen === 'actors') {
      // vertices of the active actor first, then the other actors
      const order = [ui.actor, ...scene.actors.map((_, i) => i).filter((i) => i !== ui.actor)];
      for (const ai of order) {
        const path = scene.actors[ai].path;
        for (let k = 0; k < path.length; k++) {
          const [sx, sy] = cam.toScreen(path[k].x, path[k].y);
          if (Math.hypot(sx - p.x, sy - p.y) < HIT) {
            store.begin();
            ui.actor = ai;
            ui.selection = { kind: 'vertex', actor: ai, index: k };
            g = { kind: 'vertex', actor: ai, index: k };
            host.panel();
            return;
          }
        }
      }
      // tap on a path segment inserts a point there
      const wp = world(p);
      for (const ai of order) {
        const path = scene.actors[ai].path;
        for (let k = 0; k < path.length - 1; k++) {
          const cl = pointSegment(wp.x, wp.y, path[k].x, path[k].y, path[k + 1].x, path[k + 1].y);
          if (cl.d * cam.scale < HIT * 0.6) {
            store.begin();
            const np = { x: snap(cl.x), y: snap(cl.y) };
            store.live((s) => s.actors[ai].path.splice(k + 1, 0, np));
            ui.actor = ai;
            ui.selection = { kind: 'vertex', actor: ai, index: k + 1 };
            g = { kind: 'vertex', actor: ai, index: k + 1 };
            host.panel();
            return;
          }
        }
      }
      g = { kind: 'pan', lx: p.x, ly: p.y };
      return;
    }
    // luck: tap picks a replay, drag pans
    g = { kind: 'tap-pick' };
  }

  function moveSingle(p: { x: number; y: number }) {
    const { store, cam } = host;
    if (!g) return;
    switch (g.kind) {
      case 'pan':
        cam.pan(p.x - g.lx, p.y - g.ly);
        g.lx = p.x;
        g.ly = p.y;
        host.redraw();
        return;
      case 'tap-pick':
      case 'tap-furniture':
        if (moved) g = { kind: 'pan', lx: p.x, ly: p.y };
        return;
      case 'wall-new':
      case 'wall-end': {
        const s = snapped(p);
        const id = g.id;
        const end = g.kind === 'wall-new' ? 'b' : g.end;
        store.live((sc) => {
          const w = sc.walls.find((x) => x.id === id);
          if (w) w[end] = s;
        });
        break;
      }
      case 'wall-move': {
        const wp = world(p);
        const dx = snap(wp.x - g.start.x), dy = snap(wp.y - g.start.y);
        const { id, a, b } = g;
        store.live((sc) => {
          const w = sc.walls.find((x) => x.id === id);
          if (w) {
            w.a = { x: snap(a.x + dx), y: snap(a.y + dy) };
            w.b = { x: snap(b.x + dx), y: snap(b.y + dy) };
          }
        });
        break;
      }
      case 'furn-move': {
        const wp = world(p);
        const dx = snap(wp.x - g.start.x), dy = snap(wp.y - g.start.y);
        const { id, c } = g;
        store.live((sc) => {
          const f = sc.furniture.find((x) => x.id === id);
          if (f) f.center = { x: +(c.x + dx).toFixed(3), y: +(c.y + dy).toFixed(3) };
        });
        break;
      }
      case 'vertex': {
        const s = snapped(p);
        const { actor, index } = g;
        store.live((sc) => {
          sc.actors[actor].path[index] = s;
        });
        break;
      }
    }
  }

  function endSingle(p: { x: number; y: number }) {
    const { store, ui } = host;
    if (!g) return;
    if (g.kind === 'tap-furniture' && !moved) {
      const c = snapped(p);
      const id = newId('f');
      store.edit((s) =>
        s.furniture.push({ id, label: 'Furniture', center: c, w: 1.0, d: 0.5, rotation: 0, height: 'tall' }),
      );
      ui.selection = { kind: 'furniture', id };
      ui.drawTool = 'select';
      host.panel();
    } else if (g.kind === 'tap-pick' && !moved) {
      host.pick(p.x, p.y);
    } else if (g.kind === 'wall-new') {
      const id = g.id;
      const w = store.scene.walls.find((x) => x.id === id);
      if (!w || Math.hypot(w.a.x - w.b.x, w.a.y - w.b.y) < 0.2) {
        store.cancel();
        ui.selection = null;
      } else store.commit();
      host.panel();
    } else if (store.inTxn) {
      store.commit();
      host.panel();
    }
    g = null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) {
      downAt = p;
      moved = false;
      startSingle(p);
    } else if (pts.size === 2) {
      // second finger: abandon the single-finger edit, start pinch/pan
      if (host.store.inTxn) host.store.cancel();
      g = null;
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
    host.redraw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      host.cam.pan(mx - pinch.mx, my - pinch.my);
      if (pinch.d > 0) host.cam.zoomAt(mx, my, d / pinch.d);
      pinch = { d, mx, my };
      host.redraw();
      return;
    }
    if (!moved && Math.hypot(p.x - downAt.x, p.y - downAt.y) > TAP) moved = true;
    moveSingle(p);
  });

  const up = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.delete(e.pointerId);
    if (pinch) {
      if (pts.size < 2) pinch = null;
      g = null;
      return;
    }
    if (e.type === 'pointercancel') {
      if (host.store.inTxn) host.store.cancel();
      g = null;
      return;
    }
    endSingle(p);
    host.redraw();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      host.cam.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
      host.redraw();
    },
    { passive: false },
  );
}
