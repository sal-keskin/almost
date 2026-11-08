import type { Actor, Scene } from '../model/types';
import { furnitureCorners } from '../engine/geometry';
import { buildPath } from '../engine/path';
import { meanDraw } from '../engine/sample';
import type { ActorPose } from '../engine/simulate';
import type { Camera } from './camera';
import type { UIState } from './state';
import type { SwarmLayer } from './swarmLayer';

export const C = {
  ground: '#1B1916',
  display: '#FFFFFF',
  body: '#E6E1D8',
  muted: '#A9A398',
  gold: '#E8B95A',
  periwinkle: '#8F89FF',
  hair: 'rgba(255,255,255,0.26)',
  hairSoft: 'rgba(255,255,255,0.08)',
};

const MONO = '"Geist Mono", ui-monospace, monospace';

export function poseAtTime(ui: UIState): ActorPose[] | null {
  const tr = ui.track;
  if (!tr || tr.poses.length === 0) return null;
  const k = Math.max(0, Math.min(tr.poses.length - 1, Math.round(ui.t / tr.dt)));
  return tr.poses[k];
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  scene: Scene,
  ui: UIState,
  layer: SwarmLayer,
  dpr: number,
  w: number,
  h: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, w, h);
  grid(ctx, cam, scene, w, h);

  const luck = ui.screen === 'luck';

  // swarm trajectories (cached bitmap)
  if (luck && ui.result) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = ui.stale ? 0.35 : 1;
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  furniture(ctx, cam, scene, ui);
  walls(ctx, cam, scene, ui);
  labels(ctx, cam, scene);

  // planned paths
  scene.actors.forEach((a, i) => plannedPath(ctx, cam, a, i, ui));

  // reported event / inspected replay trajectory up to t
  if (ui.track) trackLine(ctx, cam, ui);

  if (luck && ui.result && !ui.stale) {
    contactPoints(ctx, cam, ui);
    swarmNow(ctx, cam, ui);
  }

  const poses = poseAtTime(ui);
  if (poses) poses.forEach((p, i) => actorBody(ctx, cam, p, scene.actors[i], i === ui.actor && ui.screen === 'actors'));

  scaleBar(ctx, cam, w, h);
}

function grid(ctx: CanvasRenderingContext2D, cam: Camera, scene: Scene, w: number, h: number) {
  const [x0, y0] = cam.toWorld(0, 0);
  const [x1, y1] = cam.toWorld(w, h);
  ctx.lineWidth = 1;
  // 1 m grid
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.beginPath();
  for (let x = Math.ceil(x0); x <= x1; x++) {
    const [sx] = cam.toScreen(x, 0);
    ctx.moveTo(Math.round(sx) + 0.5, 0);
    ctx.lineTo(Math.round(sx) + 0.5, h);
  }
  for (let y = Math.ceil(y0); y <= y1; y++) {
    const [, sy] = cam.toScreen(0, y);
    ctx.moveTo(0, Math.round(sy) + 0.5);
    ctx.lineTo(w, Math.round(sy) + 0.5);
  }
  ctx.stroke();
  // scene bounds as a hairline frame
  const [bx, by] = cam.toScreen(0, 0);
  ctx.strokeStyle = C.hairSoft;
  ctx.strokeRect(bx + 0.5, by + 0.5, scene.bounds.w * cam.scale, scene.bounds.h * cam.scale);
}

function walls(ctx: CanvasRenderingContext2D, cam: Camera, scene: Scene, ui: UIState) {
  ctx.lineCap = 'round';
  for (const wl of scene.walls) {
    const sel = ui.selection?.kind === 'wall' && ui.selection.id === wl.id && ui.screen === 'draw';
    const [ax, ay] = cam.toScreen(wl.a.x, wl.a.y);
    const [bx, by] = cam.toScreen(wl.b.x, wl.b.y);
    ctx.strokeStyle = sel ? C.periwinkle : 'rgba(255,255,255,0.88)';
    ctx.lineWidth = sel ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    if (ui.screen === 'draw' && ui.drawTool === 'select') {
      handle(ctx, ax, ay, sel);
      handle(ctx, bx, by, sel);
    }
  }
}

export function handle(ctx: CanvasRenderingContext2D, x: number, y: number, active: boolean) {
  ctx.beginPath();
  ctx.arc(x, y, active ? 7 : 5, 0, Math.PI * 2);
  ctx.fillStyle = C.ground;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = active ? C.periwinkle : C.body;
  ctx.stroke();
}

function furniture(ctx: CanvasRenderingContext2D, cam: Camera, scene: Scene, ui: UIState) {
  for (const f of scene.furniture) {
    const sel = ui.selection?.kind === 'furniture' && ui.selection.id === f.id && ui.screen === 'draw';
    const pts = furnitureCorners(f).map((p) => cam.toScreen(p.x, p.y));
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    if (f.height === 'tall') {
      // tall furniture blocks sight: hatched
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(230,225,216,0.22)';
      ctx.lineWidth = 1;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      ctx.beginPath();
      for (let k = minX - (maxY - minY); k < maxX; k += 6) {
        ctx.moveTo(k, maxY);
        ctx.lineTo(k + (maxY - minY), minY);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.lineWidth = sel ? 2 : 1.5;
    ctx.strokeStyle = sel ? C.periwinkle : C.body;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    if (cam.scale > 30) {
      const [cx, cy] = cam.toScreen(f.center.x, f.center.y);
      ctx.fillStyle = C.muted;
      ctx.font = `10px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const [, by] = cam.toScreen(0, Math.max(...furnitureCorners(f).map((p) => p.y)));
      ctx.fillText(f.label.toUpperCase(), cx, Math.max(by, cy) + 5);
    }
  }
}

function labels(ctx: CanvasRenderingContext2D, cam: Camera, scene: Scene) {
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const l of scene.labels) {
    const [x, y] = cam.toScreen(l.at.x, l.at.y);
    ctx.fillText(l.text, x, y);
  }
}

const pathCache = new Map<string, { key: string; pts: Array<[number, number]> }>();

function plannedPath(ctx: CanvasRenderingContext2D, cam: Camera, a: Actor, i: number, ui: UIState) {
  const key = JSON.stringify([a.path, a.cut.mean, a.cornerRadius]);
  let c = pathCache.get(a.id);
  if (!c || c.key !== key) {
    const sp = buildPath(a.path, a.cut.mean, a.cornerRadius);
    const pts: Array<[number, number]> = [];
    for (let k = 0; k < sp.xs.length; k += 5) pts.push([sp.xs[k], sp.ys[k]]);
    pts.push([sp.xs[sp.xs.length - 1], sp.ys[sp.ys.length - 1]]);
    c = { key, pts };
    pathCache.set(a.id, c);
  }
  const editing = ui.screen === 'actors';
  const active = editing && i === ui.actor;
  ctx.save();
  ctx.setLineDash(active ? [] : [4, 5]);
  ctx.lineWidth = active ? 1.5 : 1;
  ctx.strokeStyle = active ? 'rgba(255,255,255,0.7)' : 'rgba(230,225,216,0.32)';
  ctx.beginPath();
  c.pts.forEach(([x, y], k) => {
    const [sx, sy] = cam.toScreen(x, y);
    if (k) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  });
  ctx.stroke();
  ctx.restore();
  // direction arrow at the end
  const n = c.pts.length;
  if (n >= 2) {
    const [ex, ey] = cam.toScreen(c.pts[n - 1][0], c.pts[n - 1][1]);
    const [px, py] = cam.toScreen(c.pts[n - 2][0], c.pts[n - 2][1]);
    const ang = Math.atan2(ey - py, ex - px);
    ctx.strokeStyle = active ? C.display : 'rgba(230,225,216,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ex - 9 * Math.cos(ang - 0.5), ey - 9 * Math.sin(ang - 0.5));
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - 9 * Math.cos(ang + 0.5), ey - 9 * Math.sin(ang + 0.5));
    ctx.stroke();
  }
  if (editing) {
    a.path.forEach((p, k) => {
      const [sx, sy] = cam.toScreen(p.x, p.y);
      const sel = ui.selection?.kind === 'vertex' && ui.selection.actor === i && ui.selection.index === k;
      if (active || sel) handle(ctx, sx, sy, sel);
    });
  }
}

function trackLine(ctx: CanvasRenderingContext2D, cam: Camera, ui: UIState) {
  const tr = ui.track!;
  const kmax = Math.min(tr.poses.length - 1, Math.round(ui.t / tr.dt));
  const inspected = ui.inspect !== null;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // in the swarm view, a ground-coloured halo keeps the reported line legible
  const passes: Array<[string, number]> = ui.screen === 'luck' ? [[C.ground, 5], [inspected ? C.gold : C.display, 2]] : [[inspected ? C.gold : C.display, 1.75]];
  for (const [colour, width] of passes) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  for (let a = 0; a < tr.poses[0].length; a++) {
    ctx.beginPath();
    let pen = false;
    for (let k = 0; k <= kmax; k++) {
      const p = tr.poses[k][a];
      if (!p.present) {
        pen = false;
        continue;
      }
      const [sx, sy] = cam.toScreen(p.x, p.y);
      if (pen) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
      pen = true;
    }
    ctx.stroke();
  }
  }
  // contact / closest marker
  const o = tr.outcome;
  if (ui.t >= o.tClosest - 1e-6 && isFinite(o.px)) {
    const [sx, sy] = cam.toScreen(o.px, o.py);
    ctx.beginPath();
    ctx.arc(sx, sy, o.contact ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = o.contact ? C.gold : C.display;
    ctx.fill();
  }
}

function contactPoints(ctx: CanvasRenderingContext2D, cam: Camera, ui: UIState) {
  const r = ui.result!;
  ctx.fillStyle = C.gold;
  for (let i = 0; i < r.n; i++) {
    if (!r.contact[i]) continue;
    const [sx, sy] = cam.toScreen(r.px[i], r.py[i]);
    ctx.beginPath();
    ctx.arc(sx, sy, i === ui.inspect ? 6 : 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (ui.inspect !== null) {
    const i = ui.inspect;
    const [sx, sy] = cam.toScreen(r.px[i], r.py[i]);
    ctx.strokeStyle = C.display;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, 11, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Where every replay's actors are at the timeline time. */
function swarmNow(ctx: CanvasRenderingContext2D, cam: Camera, ui: UIState) {
  const r = ui.result!;
  const f = Math.min(r.frames - 1, Math.max(0, Math.round(ui.t * r.recordHz)));
  if (f === 0) return;
  const stride = r.actors * r.frames * 2;
  for (let i = 0; i < r.n; i++) {
    ctx.fillStyle = r.contact[i] ? 'rgba(232,185,90,0.8)' : 'rgba(255,255,255,0.35)';
    for (let a = 0; a < r.actors; a++) {
      const o = i * stride + (a * r.frames + f) * 2;
      const x = r.traj[o];
      if (x !== x) continue;
      const [sx, sy] = cam.toScreen(x, r.traj[o + 1]);
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }
  }
}

function actorBody(ctx: CanvasRenderingContext2D, cam: Camera, p: ActorPose, a: Actor, active: boolean) {
  if (!p.present) return;
  ctx.lineWidth = active ? 2 : 1.5;
  for (const sh of p.shapes) {
    ctx.beginPath();
    if (sh.poly.length) {
      for (let k = 0; k < sh.poly.length; k += 2) {
        const [sx, sy] = cam.toScreen(sh.poly[k], sh.poly[k + 1]);
        if (k) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
      }
      ctx.closePath();
    } else {
      const [sx, sy] = cam.toScreen(sh.x, sh.y);
      ctx.arc(sx, sy, sh.r * cam.scale, 0, Math.PI * 2);
    }
    ctx.fillStyle = C.ground;
    ctx.fill();
    ctx.strokeStyle = p.braking ? C.gold : C.display;
    ctx.stroke();
  }
  // role initial
  const [sx, sy] = cam.toScreen(p.x, p.y);
  ctx.fillStyle = C.display;
  ctx.font = `600 ${Math.max(9, Math.min(13, cam.scale * 0.22))}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(a.role[0], sx, sy + 0.5);
}

function scaleBar(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) {
  const len = cam.scale; // 1 m
  const x1 = w - 22, x0 = x1 - len, y = h - 46;
  ctx.strokeStyle = C.body;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y - 4);
  ctx.lineTo(x0, y + 4);
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.moveTo(x1, y - 4);
  ctx.lineTo(x1, y + 4);
  ctx.stroke();
  ctx.fillStyle = C.muted;
  ctx.font = `10px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('1 m', (x0 + x1) / 2, y - 6);
}

/** The reported event uses every mean. */
export function reportedParams(scene: Scene) {
  return meanDraw(scene).params;
}
