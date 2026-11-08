/**
 * Calibration helper: prints the reported (mean) replay and the baseline
 * Luck Score for Corner 3B, optionally sweeping one actor's start time.
 *   npx vite-node scripts/calibrate.ts [startB values...]
 */
import { corner3b } from '../src/model/corner3b';
import { reportedOutcome, runSwarm } from '../src/engine/swarm';

const sweep = process.argv.slice(2).map(Number).filter((v) => !Number.isNaN(v));
const values = sweep.length ? sweep : [corner3b().actors[1].start.mean];
for (const sb of values) {
  const scene = corner3b();
  scene.actors[1].start.mean = sb;
  const rep = reportedOutcome(scene);
  const r = runSwarm(scene, { seed: 21, n: 1000, dial: 1 });
  const moved = corner3b();
  moved.actors[1].start.mean = sb;
  moved.furniture[0].center.x -= 4;
  const rm = runSwarm(moved, { seed: 21, n: 1000, dial: 1 });
  console.log(
    `startB=${sb.toFixed(2)} reported: contact=${rep.contact} clear=${rep.minClearance.toFixed(2)} t=${rep.tClosest.toFixed(2)} | ` +
      `luck=${(r.luck.p * 100).toFixed(1)}% [${(r.luck.lo * 100).toFixed(1)}–${(r.luck.hi * 100).toFixed(1)}] near=${r.nearMisses} ${r.ms.toFixed(0)}ms | cabinet moved 4 m: ${(rm.luck.p * 100).toFixed(1)}%`,
  );
}
