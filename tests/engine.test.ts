import { describe, expect, it } from 'vitest';
import { corner3b } from '../src/model/corner3b';
import { mulberry32 } from '../src/engine/prng';
import { chiPercentile, phi, phiInv, truncNormal, wilson } from '../src/engine/stats';
import { allocate, finalize, reportedOutcome, runRange, runSwarm, swarmHash } from '../src/engine/swarm';
import { compile } from '../src/engine/simulate';
import { drawReplay } from '../src/engine/sample';

describe('prng', () => {
  it('mulberry32 is reproducible', () => {
    const a = mulberry32(21), b = mulberry32(21);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
});

describe('stats', () => {
  it('Φ and Φ⁻¹ round-trip', () => {
    for (const p of [0.001, 0.025, 0.3, 0.5, 0.9, 0.999]) expect(phi(phiInv(p))).toBeCloseTo(p, 6);
  });
  it('Wilson 140/400 matches the brief (30%–40%)', () => {
    const w = wilson(140, 400);
    expect(w.lo).toBeCloseTo(0.3049, 3);
    expect(w.hi).toBeCloseTo(0.398, 3);
  });
  it('Wilson stays inside [0,1] at the edges', () => {
    expect(wilson(0, 50).lo).toBe(0);
    expect(wilson(50, 50).hi).toBe(1);
    expect(wilson(0, 50).hi).toBeGreaterThan(0.05);
  });
  it('truncated normal respects bounds at any dial', () => {
    const d = { mean: 1.3, sd: 0.18, min: 0.8, max: 1.9 };
    const r = mulberry32(5);
    for (const dial of [0, 0.5, 1, 3]) {
      for (let i = 0; i < 2000; i++) {
        const x = truncNormal(d, dial, r());
        expect(x).toBeGreaterThanOrEqual(0.8);
        expect(x).toBeLessThanOrEqual(1.9);
      }
    }
    expect(truncNormal(d, 0, 0.123)).toBe(1.3);
  });
  it('χ percentile: √k is roughly the median', () => {
    expect(chiPercentile(Math.sqrt(8), 8)).toBeGreaterThan(0.5);
    expect(chiPercentile(Math.sqrt(8), 8)).toBeLessThan(0.62);
  });
});

describe('Corner 3B', () => {
  it('reported event: no contact, they stop about 0.3 m apart', () => {
    const o = reportedOutcome(corner3b());
    expect(o.contact).toBe(false);
    expect(o.minClearance).toBeGreaterThan(0.2);
    expect(o.minClearance).toBeLessThan(0.45);
  });

  it('acceptance: same seed gives an identical swarm and identical scores', () => {
    const a = runSwarm(corner3b(), { seed: 21, n: 400, dial: 1 });
    const b = runSwarm(corner3b(), { seed: 21, n: 400, dial: 1 });
    expect(swarmHash(a)).toBe(swarmHash(b));
    expect(a.luck).toEqual(b.luck);
    const c = runSwarm(corner3b(), { seed: 22, n: 400, dial: 1 });
    expect(swarmHash(c)).not.toBe(swarmHash(a));
  });

  it('chunked runs equal one-shot runs; replay i does not depend on N', () => {
    const scene = corner3b();
    const one = runSwarm(scene, { seed: 7, n: 300, dial: 1 });
    const compiled = compile(scene);
    const r = allocate(scene, { seed: 7, n: 300, dial: 1 });
    for (let i = 0; i < 300; i += 37) runRange(compiled, r, i, Math.min(300, i + 37));
    finalize(scene, r);
    expect(swarmHash(r)).toBe(swarmHash(one));
    const d100 = drawReplay(scene, 7, 42, 1), d999 = drawReplay(scene, 7, 42, 1);
    expect(d100).toEqual(d999);
  });

  it('acceptance: baseline Luck Score clearly above zero, about one in three', () => {
    const r = runSwarm(corner3b(), { seed: 21, n: 1000, dial: 1 });
    expect(r.luck.lo).toBeGreaterThan(0.2);
    expect(r.luck.p).toBeGreaterThan(0.25);
    expect(r.luck.p).toBeLessThan(0.45);
  });

  it('dial 0 collapses the swarm onto the reported event', () => {
    const r = runSwarm(corner3b(), { seed: 21, n: 50, dial: 0 });
    expect(r.contacts).toBe(0);
    for (let i = 0; i < 50; i++) expect(r.strangeness[i]).toBe(0);
  });

  it('moving the cabinet off the corner lowers the Luck Score', () => {
    const base = runSwarm(corner3b(), { seed: 21, n: 400, dial: 1 });
    const s = corner3b();
    s.furniture[0].center.x -= 4;
    const moved = runSwarm(s, { seed: 21, n: 400, dial: 1 });
    expect(moved.luck.hi).toBeLessThan(base.luck.lo);
  });

  it('performance: 1,000 replays of a 12 s scene in under 2 s (Node, single thread)', () => {
    runSwarm(corner3b(), { seed: 1, n: 100, dial: 1 }); // warm-up
    const r = runSwarm(corner3b(), { seed: 21, n: 1000, dial: 1 });
    expect(r.ms).toBeLessThan(2000);
  });
});
