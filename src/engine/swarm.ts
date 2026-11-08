import type { RunConfig, Scene } from '../model/types';
import { drawReplay, meanDraw, PARAM_KEYS } from './sample';
import { compile, simulate, type Compiled } from './simulate';
import { wilson, type Interval } from './stats';

export const RECORD_HZ = 15;

/** Everything a run produces, in transferable typed arrays. */
export interface SwarmResult {
  config: RunConfig;
  n: number;
  actors: number;
  /** recorded frames per actor per replay */
  frames: number;
  recordHz: number;
  /** n × actors × frames × 2 (x, y), NaN when absent */
  traj: Float32Array;
  contact: Uint8Array;
  minClearance: Float32Array;
  tClosest: Float32Array;
  px: Float32Array;
  py: Float32Array;
  relSpeed: Float32Array;
  energy: Float32Array;
  strangeness: Float32Array;
  strangePct: Float32Array;
  /** n × actors × 4 (start, speed, cut, reaction) */
  params: Float32Array;
  contacts: number;
  nearMisses: number;
  luck: Interval;
  ms: number;
}

export function framesFor(scene: Scene): number {
  return Math.floor(scene.sim.horizon * RECORD_HZ) + 1;
}

export function allocate(scene: Scene, config: RunConfig): SwarmResult {
  const n = config.n;
  const a = scene.actors.length;
  const frames = framesFor(scene);
  return {
    config,
    n,
    actors: a,
    frames,
    recordHz: RECORD_HZ,
    traj: new Float32Array(n * a * frames * 2),
    contact: new Uint8Array(n),
    minClearance: new Float32Array(n),
    tClosest: new Float32Array(n),
    px: new Float32Array(n),
    py: new Float32Array(n),
    relSpeed: new Float32Array(n),
    energy: new Float32Array(n),
    strangeness: new Float32Array(n),
    strangePct: new Float32Array(n),
    params: new Float32Array(n * a * PARAM_KEYS.length),
    contacts: 0,
    nearMisses: 0,
    luck: { p: 0, lo: 0, hi: 1 },
    ms: 0,
  };
}

/** Run replays [from, to) into `r`. Pure and deterministic per replay index. */
export function runRange(compiled: Compiled, r: SwarmResult, from: number, to: number): void {
  const scene = compiled.scene;
  const every = Math.max(1, Math.round(1 / RECORD_HZ / scene.sim.dt));
  const stride = r.actors * r.frames * 2;
  for (let i = from; i < to; i++) {
    const d = drawReplay(scene, r.config.seed, i, r.config.dial);
    const o = simulate(compiled, d.params, { every, out: r.traj, offset: i * stride, frames: r.frames });
    r.contact[i] = o.contact ? 1 : 0;
    r.minClearance[i] = o.minClearance;
    r.tClosest[i] = o.tClosest;
    r.px[i] = o.px;
    r.py[i] = o.py;
    r.relSpeed[i] = o.relSpeed;
    r.energy[i] = o.energy;
    r.strangeness[i] = d.strangeness;
    r.strangePct[i] = d.strangePct;
    d.params.forEach((p, ai) => {
      PARAM_KEYS.forEach((k, ki) => {
        r.params[(i * r.actors + ai) * PARAM_KEYS.length + ki] = p[k];
      });
    });
  }
}

export function finalize(scene: Scene, r: SwarmResult): SwarmResult {
  let c = 0, nm = 0;
  for (let i = 0; i < r.n; i++) {
    if (r.contact[i]) c++;
    else if (r.minClearance[i] < scene.sim.nearMiss) nm++;
  }
  r.contacts = c;
  r.nearMisses = nm;
  r.luck = wilson(c, r.n);
  return r;
}

/** Convenience for tests and Node scripts. */
export function runSwarm(scene: Scene, config: RunConfig): SwarmResult {
  const t0 = performance.now();
  const compiled = compile(scene);
  const r = allocate(scene, config);
  runRange(compiled, r, 0, config.n);
  finalize(scene, r);
  r.ms = performance.now() - t0;
  return r;
}

export function reportedOutcome(scene: Scene) {
  return simulate(compile(scene), meanDraw(scene).params);
}

/** FNV-1a over the result arrays: one number to compare swarms. */
export function swarmHash(r: SwarmResult): string {
  let h = 0x811c9dc5;
  const feed = (arr: ArrayBufferView) => {
    const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < b.length; i++) {
      h ^= b[i];
      h = Math.imul(h, 0x01000193);
    }
  };
  [r.traj, r.contact, r.minClearance, r.tClosest, r.px, r.py, r.relSpeed, r.energy, r.strangeness, r.params].forEach(feed);
  return (h >>> 0).toString(16).padStart(8, '0');
}
