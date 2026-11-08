# ALMOST — near-miss simulator (M1)

Every near miss is a collision that didn't happen. ALMOST turns a worker's account of a
three-second near miss into hundreds of plausible replays and measures how much luck kept
people apart.

This is **Milestone M1**: the Corner 3B editor (walls, furniture, two actors, paths,
timeline), the Luck dial, the swarm view and the Luck Score with a Wilson 95% interval.
Local-first and static: no server, no accounts. Scenes autosave to IndexedDB on the device
and can be exported/imported as JSON.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # engine tests (Vitest)
npm run build && npm run preview   # then, in another shell:
npm run acceptance   # browser acceptance checks (Playwright/Chromium)
```

`?lang=tr` previews the Turkish strings file (full Turkish UI is M4).

## Layout

- `src/engine/` — pure TypeScript simulation (runs in a Web Worker and in Node):
  `prng` (mulberry32 + per-replay seeds), `stats` (truncated normal, Wilson, χ percentile),
  `geometry`, `path`, `sample` (variation vector, Luck dial, strangeness), `simulate`, `swarm`, `worker`.
- `src/model/` — scene types, the Corner 3B test scene, store with undo/redo, persistence.
- `src/ui/` — camera, canvas rendering, swarm layer, pointer/touch tools, dial, panels.
- `tests/` — engine tests; `e2e/acceptance.mjs` — M1 acceptance checks in a browser.

## Model notes (M1)

- Step 1/60 s, horizon 12 s. Actors brake (after their reaction time) once they **can see**
  each other (rays blocked by walls and tall furniture) and, continuing on their paths at
  current speed, would touch within 2 s. Side-stepping is a v3 option.
- Corner 3B defaults are calibrated so the reported event (every mean) stops ~0.32 m apart
  and the baseline Luck Score is ~35% (1,000 replays, seed 21, dial ×1).
- Defaults not given in the brief are marked `assumed` in `src/model/corner3b.ts`.
- The Luck Score describes one reconstructed scene under stated spreads. It is not an
  incidence rate; the interval covers sampling error only.
