import type { Actor, ActorKind, Scene } from '../model/types';
import { bodyGap, furnitureCorners, lineOfSight, type Seg, type Shape } from './geometry';
import { buildPath, pointAt, type SampledPath } from './path';
import type { ActorParams } from './sample';

/** Body plans: the walker/pusher is a circle; carts sit ahead of the pusher. */
export interface BodyPlan {
  personR: number;
  /** cart footprint: across × along the direction of travel, or null */
  cart: { w: number; l: number } | null;
  /** distance from the pusher centre to the cart centre along the path */
  cartAhead: number;
  /** forklifts: the driver sits inside the cart footprint (no extra circle) */
  driverInside: boolean;
}

export const BODY: Record<ActorKind, BodyPlan> = {
  person: { personR: 0.25, cart: null, cartAhead: 0, driverInside: false },
  trolley: { personR: 0.25, cart: { w: 0.6, l: 1.2 }, cartAhead: 0.25 + 0.6, driverInside: false },
  bed: { personR: 0.25, cart: { w: 1.0, l: 2.2 }, cartAhead: 0.25 + 1.1, driverInside: false },
  forklift: { personR: 0.25, cart: { w: 1.2, l: 2.5 }, cartAhead: 0, driverInside: true },
};

export const DEFAULT_MASS: Record<ActorKind, number> = { person: 70, trolley: 190, bed: 270, forklift: 3000 };

/** Static parts of a scene, prepared once per run. */
export interface Compiled {
  occluders: Seg[];
  scene: Scene;
}

export function compile(scene: Scene): Compiled {
  const occluders: Seg[] = scene.walls.map((w) => ({ ax: w.a.x, ay: w.a.y, bx: w.b.x, by: w.b.y }));
  for (const f of scene.furniture) {
    if (f.height !== 'tall') continue;
    const c = furnitureCorners(f);
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      occluders.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
  }
  return { occluders, scene };
}

export interface ActorPose {
  present: boolean;
  x: number;
  y: number;
  /** heading unit vector */
  hx: number;
  hy: number;
  v: number;
  shapes: Shape[];
  /** has the actor noticed the other one */
  noticed: boolean;
  braking: boolean;
}

export interface ReplayOutcome {
  contact: boolean;
  /** minimum clearance between the two bodies (m); 0 at contact */
  minClearance: number;
  /** time of contact, or of closest approach (s) */
  tClosest: number;
  /** contact point, or the point between them at closest approach */
  px: number;
  py: number;
  /** relative speed at contact (m/s), 0 without contact */
  relSpeed: number;
  /** ½·μ·v_rel² at contact (J) */
  energy: number;
  /** last simulated time (s) */
  tEnd: number;
}

export interface RecordOptions {
  /** record the reference point every k steps (k ≥ 1) */
  every: number;
  /** output, length = actors × frames × 2; filled with NaN when absent */
  out: Float32Array;
  /** offset into out */
  offset: number;
  frames: number;
}

interface State {
  path: SampledPath;
  actor: Actor;
  p: ActorParams;
  plan: BodyPlan;
  s: number;
  v: number;
  started: boolean;
  exited: boolean;
  noticeT: number;
  brakeT: number;
  pose: ActorPose;
}

const tmp = { x: 0, y: 0 };
const tmp2 = { x: 0, y: 0 };

function makePose(): ActorPose {
  return { present: false, x: 0, y: 0, hx: 1, hy: 0, v: 0, shapes: [], noticed: false, braking: false };
}

function updatePose(st: State): void {
  st.pose.present = st.started && !st.exited;
  st.pose.v = st.v;
  st.pose.noticed = st.noticeT < Infinity;
  st.pose.braking = st.brakeT < Infinity;
  if (st.pose.present) poseAt(st, st.s, st.pose);
}

/** Body shapes and heading with the reference point at arc length `s`. */
function poseAt(st: State, s: number, pose: ActorPose): void {
  pointAt(st.path, s, tmp);
  pose.x = tmp.x;
  pose.y = tmp.y;
  const plan = st.plan;
  const look = plan.cart && plan.cartAhead > 0 ? plan.cartAhead : 0.1;
  pointAt(st.path, s + look, tmp2);
  let hx = tmp2.x - tmp.x, hy = tmp2.y - tmp.y;
  const hl = Math.hypot(hx, hy) || 1;
  hx /= hl;
  hy /= hl;
  pose.hx = hx;
  pose.hy = hy;
  const shapes = pose.shapes;
  shapes.length = 0;
  if (!plan.driverInside) shapes.push({ x: tmp.x, y: tmp.y, r: plan.personR, poly: [] });
  if (plan.cart) {
    const cx = tmp.x + hx * plan.cartAhead, cy = tmp.y + hy * plan.cartAhead;
    const ax = hx * (plan.cart.l / 2), ay = hy * (plan.cart.l / 2);
    const bx = -hy * (plan.cart.w / 2), by = hx * (plan.cart.w / 2);
    shapes.push({
      x: cx,
      y: cy,
      r: 0,
      poly: [cx + ax + bx, cy + ay + by, cx + ax - bx, cy + ay - by, cx - ax - bx, cy - ay - by, cx - ax + bx, cy - ay + by],
    });
  }
}

const predA = makePose();
const predB = makePose();
const PRED_DT = 0.1;

/**
 * Would the two bodies touch within `horizon` seconds if both kept going
 * along their paths at their current speeds? Path-aware, so people walking
 * past each other in separate lanes do not trigger braking.
 */
function predictConflict(a: State, b: State, horizon: number): boolean {
  for (let tt = 0; tt <= horizon + 1e-9; tt += PRED_DT) {
    const sa = a.s + a.v * tt, sb = b.s + b.v * tt;
    if (sa >= a.path.length || sb >= b.path.length) return false;
    poseAt(a, sa, predA);
    poseAt(b, sb, predB);
    if (bodyGap(predA.shapes, predB.shapes).d <= 0) return true;
  }
  return false;
}

/** Sight targets on a body: its centres plus cart corners. */
function sightTargets(pose: ActorPose): number[] {
  const t: number[] = [];
  for (const sh of pose.shapes) {
    t.push(sh.x, sh.y);
    for (let i = 0; i < sh.poly.length; i++) t.push(sh.poly[i]);
  }
  return t;
}

function canSee(eye: ActorPose, other: ActorPose, occ: Seg[]): boolean {
  const t = sightTargets(other);
  for (let i = 0; i < t.length; i += 2) if (lineOfSight(eye.x, eye.y, t[i], t[i + 1], occ)) return true;
  return false;
}

export interface Sim {
  states: State[];
  t: number;
  compiled: Compiled;
}

export function initSim(compiled: Compiled, params: ActorParams[]): Sim {
  const states: State[] = compiled.scene.actors.map((actor, i) => {
    const p = params[i];
    return {
      actor,
      p,
      plan: BODY[actor.kind],
      path: buildPath(actor.path, p.cut, actor.cornerRadius),
      s: 0,
      v: p.speed,
      started: false,
      exited: false,
      noticeT: Infinity,
      brakeT: Infinity,
      pose: makePose(),
    };
  });
  return { states, t: 0, compiled };
}

/**
 * Advance one step. Order: presence → notice → speed → move.
 * Returns the gap between actors 0 and 1 after the move (Infinity if one is absent).
 */
function step(sim: Sim, dt: number): void {
  const { states } = sim;
  const { scene, occluders } = sim.compiled;
  const t = sim.t;
  for (const st of states) {
    if (!st.started && t >= st.p.start) {
      // an actor with a negative start time is already under way at t = 0
      st.started = true;
      st.s = st.v * Math.max(0, t - st.p.start);
    }
  }
  for (const st of states) updatePose(st);
  // noticing: the other is visible and, on current paths and speeds, contact is under noticeTTC away
  if (states.length >= 2) {
    const a = states[0], b = states[1];
    if (a.pose.present && b.pose.present && (a.noticeT === Infinity || b.noticeT === Infinity)) {
      const g = bodyGap(a.pose.shapes, b.pose.shapes).d;
      const closing = a.v + b.v;
      if (closing > 1e-6 && g < closing * scene.sim.noticeTTC) {
        const seeA = a.noticeT === Infinity && canSee(a.pose, b.pose, occluders);
        const seeB = b.noticeT === Infinity && canSee(b.pose, a.pose, occluders);
        if ((seeA || seeB) && predictConflict(a, b, scene.sim.noticeTTC)) {
          if (seeA) {
            a.noticeT = t;
            a.brakeT = t + a.p.reaction;
          }
          if (seeB) {
            b.noticeT = t;
            b.brakeT = t + b.p.reaction;
          }
        }
      }
    }
  }
  for (const st of states) {
    if (!st.started || st.exited) continue;
    if (t >= st.brakeT) st.v = Math.max(0, st.v - st.actor.decel * dt);
    st.s += st.v * dt;
    if (st.s >= st.path.length) st.exited = true;
  }
  sim.t = t + dt;
  for (const st of states) updatePose(st);
}

/** Run one replay to contact, horizon, or until nobody is moving. */
export function simulate(compiled: Compiled, params: ActorParams[], rec?: RecordOptions): ReplayOutcome {
  const scene = compiled.scene;
  const { dt, horizon } = scene.sim;
  const sim = initSim(compiled, params);
  const steps = Math.round(horizon / dt);
  const out: ReplayOutcome = { contact: false, minClearance: Infinity, tClosest: 0, px: NaN, py: NaN, relSpeed: 0, energy: 0, tEnd: 0 };
  const n = sim.states.length;
  const record = (k: number) => {
    if (!rec || k % rec.every !== 0) return;
    const f = k / rec.every;
    if (f >= rec.frames) return;
    for (let i = 0; i < n; i++) {
      const pose = sim.states[i].pose;
      const o = rec.offset + (i * rec.frames + f) * 2;
      rec.out[o] = pose.present ? pose.x : NaN;
      rec.out[o + 1] = pose.present ? pose.y : NaN;
    }
  };
  for (const st of sim.states) updatePose(st);
  record(0);
  let k = 0;
  for (k = 1; k <= steps; k++) {
    step(sim, dt);
    record(k);
    if (n >= 2) {
      const A = sim.states[0].pose, B = sim.states[1].pose;
      if (A.present && B.present) {
        const g = bodyGap(A.shapes, B.shapes);
        if (g.d < out.minClearance) {
          out.minClearance = Math.max(0, g.d);
          out.tClosest = sim.t;
          out.px = g.x;
          out.py = g.y;
        }
        if (g.d <= 0) {
          out.contact = true;
          const vx = A.hx * A.v - B.hx * B.v, vy = A.hy * A.v - B.hy * B.v;
          out.relSpeed = Math.hypot(vx, vy);
          const ma = sim.states[0].actor.massKg, mb = sim.states[1].actor.massKg;
          const mu = (ma * mb) / (ma + mb);
          out.energy = 0.5 * mu * out.relSpeed * out.relSpeed;
          break;
        }
      }
    }
    // nobody can move any more: freeze the rest of the recording
    const moving = sim.states.some((st) => (!st.started || (!st.exited && st.v > 0)));
    if (!moving) break;
  }
  out.tEnd = Math.min(sim.t, horizon);
  if (rec) {
    // hold last known positions until the horizon so the swarm shows where people ended
    const last = Math.floor(Math.min(k, steps) / rec.every);
    for (let i = 0; i < n; i++) {
      const pose = sim.states[i].pose;
      for (let f = last + 1; f < rec.frames; f++) {
        const o = rec.offset + (i * rec.frames + f) * 2;
        rec.out[o] = out.contact || !pose.present ? NaN : pose.x;
        rec.out[o + 1] = out.contact || !pose.present ? NaN : pose.y;
      }
    }
  }
  if (!isFinite(out.minClearance)) out.minClearance = Infinity;
  return out;
}

/** Step-by-step poses for the timeline (reported event). */
export interface Track {
  dt: number;
  times: number[];
  poses: ActorPose[][];
  outcome: ReplayOutcome;
}

export function trackReplay(compiled: Compiled, params: ActorParams[]): Track {
  const scene = compiled.scene;
  const { dt, horizon } = scene.sim;
  const outcome = simulate(compiled, params);
  const sim = initSim(compiled, params);
  for (const st of sim.states) updatePose(st);
  const clone = (p: ActorPose): ActorPose => ({ ...p, shapes: p.shapes.map((s) => ({ ...s, poly: [...s.poly] })) });
  const times = [0];
  const poses = [sim.states.map((s) => clone(s.pose))];
  // sample at 30 Hz for the scrubber, up to the end of the replay
  const every = Math.max(1, Math.round(1 / 30 / dt));
  const steps = Math.round(Math.min(horizon, outcome.tEnd + 0.5) / dt);
  for (let k = 1; k <= steps; k++) {
    step(sim, dt);
    if (k % every === 0 || k === steps) {
      times.push(sim.t);
      poses.push(sim.states.map((s) => clone(s.pose)));
    }
    if (outcome.contact && sim.t >= outcome.tClosest - 1e-9) break;
  }
  return { dt: dt * every, times, poses, outcome };
}
