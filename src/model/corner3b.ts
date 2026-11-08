import type { Scene } from './types';

/**
 * Test scene · Corner 3B.
 * L-shaped hospital corridor, 2.0 m wide, 90° corner. The inside corner is at (12, 9).
 * Horizontal arm (toward Ward 3B) runs west; vertical arm (toward the lift) runs north.
 * Defaults follow the brief; values marked "assumed" are not given in it.
 */
export function corner3b(): Scene {
  return {
    version: 1,
    name: 'Corner 3B',
    bounds: { w: 15.5, h: 12 },
    walls: [
      { id: 'w-inner-h', a: { x: 1, y: 9 }, b: { x: 12, y: 9 } },
      { id: 'w-inner-v', a: { x: 12, y: 9 }, b: { x: 12, y: 1 } },
      { id: 'w-outer-h', a: { x: 1, y: 11 }, b: { x: 14, y: 11 } },
      { id: 'w-outer-v', a: { x: 14, y: 11 }, b: { x: 14, y: 1 } },
    ],
    furniture: [
      {
        id: 'cabinet',
        label: 'Supply cabinet',
        center: { x: 11.475, y: 9.275 },
        w: 1.05,
        d: 0.55,
        rotation: 0,
        height: 'tall',
      },
    ],
    doors: [],
    labels: [
      { id: 'l-ward', at: { x: 1.2, y: 8.6 }, text: '← TO WARD 3B' },
      { id: 'l-lift', at: { x: 13, y: 0.6 }, text: 'TO LIFT ↑' },
      { id: 'l-name', at: { x: 1.2, y: 11.6 }, text: 'CORNER 3B · 2.0 m CORRIDOR' },
    ],
    actors: [
      {
        id: 'a',
        role: 'Nurse',
        kind: 'person',
        massKg: 70,
        // from the ward toward the lift; sometimes cuts the corner
        path: [
          { x: 1.5, y: 10.6 },
          { x: 13.2, y: 10.6 },
          { x: 13.2, y: 1.5 },
        ],
        cornerRadius: 1.0,
        start: { mean: 0.8, sd: 0.4, min: -0.4, max: 2.0 }, // assumed
        speed: { mean: 1.3, sd: 0.18, min: 0.8, max: 1.9 },
        cut: { mean: 0.2, sd: 0.2, min: -0.3, max: 0.8 }, // assumed
        reaction: { mean: 0.9, sd: 0.2, min: 0.4, max: 2.0 },
        decel: 2.0,
      },
      {
        id: 'b',
        role: 'Porter',
        kind: 'trolley',
        massKg: 190, // 120 kg linen trolley + 70 kg porter
        // from the lift toward the ward, keeping right (= along the inside wall)
        path: [
          { x: 12.65, y: 1.5 },
          { x: 12.65, y: 10.15 },
          { x: 1.5, y: 10.15 },
        ],
        cornerRadius: 0.6,
        start: { mean: 0.0, sd: 0.4, min: -1.2, max: 1.2 }, // assumed spread
        speed: { mean: 1.1, sd: 0.15, min: 0.6, max: 1.6 }, // bounds assumed
        cut: { mean: 0.0, sd: 0.08, min: -0.2, max: 0.2 }, // assumed
        reaction: { mean: 0.9, sd: 0.2, min: 0.4, max: 2.0 },
        decel: 1.2,
      },
    ],
    sim: { dt: 1 / 60, horizon: 12, noticeTTC: 2, nearMiss: 0.5 },
    reported: { note: 'They met at the corner and stopped about 0.3 m apart.', clearance: 0.3 },
  };
}
