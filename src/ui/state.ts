import type { SwarmResult } from '../engine/swarm';
import type { Track } from '../engine/simulate';

export type Screen = 'draw' | 'actors' | 'luck';
export type DrawTool = 'select' | 'wall' | 'furniture';

export type Selection =
  | { kind: 'wall'; id: string }
  | { kind: 'furniture'; id: string }
  | { kind: 'vertex'; actor: number; index: number }
  | null;

export interface UIState {
  screen: Screen;
  drawTool: DrawTool;
  selection: Selection;
  /** actor whose path is editable */
  actor: number;
  /** timeline time (s) */
  t: number;
  playing: boolean;
  dial: number;
  n: number;
  seed: number;
  result: SwarmResult | null;
  /** scene or settings changed since the result was produced */
  stale: boolean;
  progress: { done: number; n: number } | null;
  /** replay being inspected in the Luck screen */
  inspect: number | null;
  /** timeline track: the reported event, or the inspected replay */
  track: Track | null;
}

export function initialUI(): UIState {
  return {
    screen: 'draw',
    drawTool: 'select',
    selection: null,
    actor: 0,
    t: 0,
    playing: false,
    dial: 1,
    n: 400,
    seed: 21,
    result: null,
    stale: true,
    progress: null,
    inspect: null,
    track: null,
  };
}
