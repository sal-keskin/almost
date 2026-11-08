import type { Actor, Dist, Scene } from '../model/types';
import { mulberry32, replaySeed } from './prng';
import { chiPercentile, truncNormal } from './stats';

/** One actor's draw from the variation vector. */
export interface ActorParams {
  start: number;
  speed: number;
  cut: number;
  reaction: number;
}

export const PARAM_KEYS = ['start', 'speed', 'cut', 'reaction'] as const;
export type ParamKey = (typeof PARAM_KEYS)[number];

export function actorDists(a: Actor): Record<ParamKey, Dist> {
  return { start: a.start, speed: a.speed, cut: a.cut, reaction: a.reaction };
}

export interface Draw {
  params: ActorParams[];
  /** Mahalanobis distance from the typical replay, in base-spread (dial = 1) sd units */
  strangeness: number;
  /** χ_k percentile of that distance (0..1): how unusual the replay really is */
  strangePct: number;
  /** number of parameters with non-zero spread */
  dims: number;
}

/** The reported event: every parameter at its mean. */
export function meanDraw(scene: Scene): Draw {
  return drawWith(scene, 0, () => 0.5);
}

export function drawReplay(scene: Scene, seed: number, i: number, dial: number): Draw {
  return drawWith(scene, dial, mulberry32(replaySeed(seed, i)));
}

function drawWith(scene: Scene, dial: number, rnd: () => number): Draw {
  let z2 = 0;
  let dims = 0;
  const params = scene.actors.map((a) => {
    const d = actorDists(a);
    const out = {} as ActorParams;
    for (const k of PARAM_KEYS) {
      const u = rnd(); // always consume, so streams stay aligned when a spread is zero
      const v = truncNormal(d[k], dial, u);
      out[k] = v;
      if (d[k].sd > 0) {
        dims++;
        const z = (v - d[k].mean) / d[k].sd;
        z2 += z * z;
      }
    }
    return out;
  });
  const strangeness = Math.sqrt(z2);
  return { params, strangeness, strangePct: chiPercentile(strangeness, dims), dims };
}
