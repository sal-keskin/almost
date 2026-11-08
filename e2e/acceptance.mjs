/**
 * M1 acceptance checks in a real browser (Chromium via Playwright).
 * Usage: npm run build && npm run preview (in another shell) && npm run acceptance
 * Env: ALMOST_URL (default http://localhost:4173/), CPU_THROTTLE (default 1)
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const URL = process.env.ALMOST_URL ?? 'http://localhost:4173/';
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function fresh(page) {
  await page.goto(URL);
  // start from the test scene, not whatever IndexedDB holds
  await page.evaluate(async () => {
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase('almost');
      req.onsuccess = req.onerror = req.onblocked = () => r();
    });
  });
  await page.goto(URL);
  await page.waitForFunction(() => window.__almost?.ui?.track);
}

async function runAndWait(page, cfg) {
  return page.evaluate(async (cfg) => {
    const a = window.__almost;
    Object.assign(a.ui, cfg);
    const before = a.lastRun?.at ?? -1;
    if (a.ui.screen !== 'luck') a.setScreen('luck');
    a.run();
    const t0 = performance.now();
    while (!(a.lastRun && a.lastRun.at !== before && a.lastRun.n === cfg.n && a.lastRun.seed === cfg.seed)) await new Promise((r) => setTimeout(r, 10));
    return { ...a.lastRun, wall: performance.now() - t0 };
  }, cfg);
}

async function desktopChecks(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await fresh(page);
  const throttle = Number(process.env.CPU_THROTTLE ?? 1);
  if (throttle > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }

  // 1. Same seed → identical swarm and scores
  const a = await runAndWait(page, { seed: 21, n: 1000, dial: 1 });
  const b = await runAndWait(page, { seed: 22, n: 1000, dial: 1 });
  const c = await runAndWait(page, { seed: 21, n: 1000, dial: 1 });
  check('Same seed gives an identical swarm and identical scores', a.hash === c.hash && a.luck.p === c.luck.p && a.luck.lo === c.luck.lo && b.hash !== a.hash,
    `seed 21 → hash ${a.hash} twice (${(a.luck.p * 100).toFixed(1)}%); seed 22 → ${b.hash}`);

  // 2. Baseline Luck Score clearly above zero, about one in three
  check('Baseline Luck Score clearly above zero (~1 in 3)', a.luck.lo > 0.2 && a.luck.p > 0.25 && a.luck.p < 0.45,
    `${(a.luck.p * 100).toFixed(1)}% of 1,000 (95% CI ${(a.luck.lo * 100).toFixed(1)}–${(a.luck.hi * 100).toFixed(1)}%)`);

  // 4. 1,000 replays under 2 s, interface stays responsive
  const perf = await page.evaluate(async () => {
    const a = window.__almost;
    const gaps = [];
    let longest = 0;
    const longTasks = [];
    const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(e.duration)));
    po.observe({ type: 'longtask', buffered: false });
    let last = performance.now();
    let on = true;
    const tick = (now) => {
      gaps.push(now - last);
      longest = Math.max(longest, now - last);
      last = now;
      if (on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // an input event mid-run: how long until it is handled?
    const before = a.lastRun.at;
    a.ui.seed = 4242;
    a.ui.n = 1000;
    a.run();
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 150));
    const inputLatency = await new Promise((r) => {
      const s = performance.now();
      setTimeout(() => r(performance.now() - s), 0);
    });
    while (!(a.lastRun.at !== before && a.lastRun.seed === 4242)) await new Promise((r) => setTimeout(r, 5));
    const wall = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 700)); // include the 600 ms swarm fade-in
    on = false;
    po.disconnect();
    gaps.sort((x, y) => x - y);
    return { worker: a.lastRun.ms, wall, longest, p95: gaps[Math.floor(gaps.length * 0.95)], longTasks, inputLatency };
  });
  check('1,000 replays run in under 2 s', perf.wall < 2000,
    `worker ${perf.worker.toFixed(0)} ms, click-to-result ${perf.wall.toFixed(0)} ms (CPU throttle ×${throttle})`);
  check('Interface stays responsive during the run', perf.longest < 120 && perf.inputLatency < 50,
    `longest frame gap ${perf.longest.toFixed(0)} ms, p95 ${perf.p95.toFixed(0)} ms, main-thread long tasks ${perf.longTasks.length ? perf.longTasks.map((d) => d.toFixed(0)).join('/') + ' ms' : 'none'}, timer latency mid-run ${perf.inputLatency.toFixed(1)} ms`);
  check('No uncaught page errors (desktop)', errors.length === 0, errors.join(' | ') || 'none');
  await ctx.close();
}

// ---------- touch ----------
async function touchChecks(browser) {
  const ctx = await browser.newContext({ ...devices['iPad Pro 11 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await fresh(page);
  const cdp = await ctx.newCDPSession(page);

  const touch = async (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  const drag = async (from, to, steps = 10) => {
    await touch('touchStart', [from]);
    for (let i = 1; i <= steps; i++) await touch('touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]);
    await touch('touchEnd', []);
    // human pacing: Chromium suppresses a tap that lands <~100 ms after a drag ends
    await page.waitForTimeout(400);
  };
  const tapAt = async (p) => {
    await touch('touchStart', [p]);
    await touch('touchEnd', []);
    await page.waitForTimeout(250);
  };
  const tapSel = async (sel) => {
    const loc = page.locator(sel).first();
    await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(async () => {
      throw new Error(`not found: ${sel}; selection=${await page.evaluate(() => JSON.stringify(window.__almost.ui.selection))}`);
    });
    const box = await loc.boundingBox();
    await tapAt([box.x + box.width / 2, box.y + box.height / 2]);
  };
  const scr = (x, y) =>
    page.evaluate(([x, y]) => {
      const r = document.querySelector('canvas').getBoundingClientRect();
      const [sx, sy] = window.__almost.cam.toScreen(x, y);
      return [r.left + sx, r.top + sy];
    }, [x, y]);
  const S = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__almost.store.scene)));
  const U = () => page.evaluate(() => ({ ...window.__almost.ui, result: null, track: null }));

  const steps = [];
  const step = (name, ok, detail = '') => {
    steps.push({ name, ok, detail });
    if (process.env.VERBOSE) console.log('   step', ok, name, detail);
  };

  // Draw: wall tool
  let s0 = await S();
  await tapSel('[data-tool=wall]');
  await page.waitForFunction(() => window.__almost.ui.drawTool === 'wall', null, { timeout: 2000 }).catch(() => {});
  step('tap Wall tool', (await U()).drawTool === 'wall');
  await drag(await scr(3, 3), await scr(7, 3));
  let s1 = await S();
  const nw = s1.walls[s1.walls.length - 1];
  step('draw a wall by dragging', s1.walls.length === s0.walls.length + 1 && Math.abs(nw.b.x - nw.a.x - 4) < 0.11, `${nw.a.x},${nw.a.y} → ${nw.b.x},${nw.b.y}`);

  // select tool: drag cabinet
  await tapSel('[data-tool=select]');
  await page.waitForFunction(() => window.__almost.ui.drawTool === 'select', null, { timeout: 2000 });
  const cab0 = s1.furniture[0].center;
  await drag(await scr(cab0.x, cab0.y), await scr(cab0.x - 4, cab0.y));
  s1 = await S();
  step('drag the cabinet 4 m along the wall', Math.abs(s1.furniture[0].center.x - (cab0.x - 4)) < 0.11, `x ${cab0.x} → ${s1.furniture[0].center.x}`);

  // drag a wall end
  const w = s1.walls[s1.walls.length - 1];
  await drag(await scr(w.b.x, w.b.y), await scr(w.b.x, w.b.y + 1));
  s1 = await S();
  step('drag a wall end', Math.abs(s1.walls[s1.walls.length - 1].b.y - (w.b.y + 1)) < 0.11);

  // inspector: rotate furniture by tapping a button
  await drag(await scr(s1.furniture[0].center.x, s1.furniture[0].center.y), await scr(s1.furniture[0].center.x, s1.furniture[0].center.y), 1);
  const rot0 = (await S()).furniture[0].rotation;
  await tapSel('.panel button:has-text("Rotate")');
  step('rotate furniture from the panel', (await S()).furniture[0].rotation === (rot0 + 90) % 360);

  // furniture tool: tap to place
  const nf = (await S()).furniture.length;
  await tapSel('[data-tool=furniture]');
  await page.waitForFunction(() => window.__almost.ui.drawTool === 'furniture', null, { timeout: 2000 });
  await tapAt(await scr(4, 6));
  step('place furniture with a tap', (await S()).furniture.length === nf + 1);

  // undo by tap
  await tapSel('[aria-label=Undo]');
  step('undo with a tap', (await S()).furniture.length === nf);

  // pinch zoom with two fingers
  const sc0 = await page.evaluate(() => window.__almost.cam.scale);
  const c = await scr(7, 6);
  await touch('touchStart', [[c[0] - 40, c[1]], [c[0] + 40, c[1]]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[c[0] - 40 - i * 10, c[1]], [c[0] + 40 + i * 10, c[1]]]);
  await touch('touchEnd', []);
  const sc1 = await page.evaluate(() => window.__almost.cam.scale);
  step('pinch to zoom', sc1 > sc0 * 1.5, `${sc0.toFixed(1)} → ${sc1.toFixed(1)} px/m`);
  await tapSel('[aria-label="Fit to scene"]');

  // Actors: drag a path vertex, tap a segment to insert one
  await tapSel('[data-screen=actors]');
  await page.waitForFunction(() => window.__almost.ui.screen === 'actors', null, { timeout: 2000 });
  s1 = await S();
  const v = s1.actors[0].path[0];
  await drag(await scr(v.x, v.y), await scr(v.x + 1, v.y));
  let s2 = await S();
  step('drag a path point', Math.abs(s2.actors[0].path[0].x - (v.x + 1)) < 0.11);
  const p0 = s2.actors[0].path[0], p1 = s2.actors[0].path[1];
  const n0 = s2.actors[0].path.length;
  await tapAt(await scr((p0.x + p1.x) / 2, (p0.y + p1.y) / 2));
  s2 = await S();
  step('tap a path to add a point', s2.actors[0].path.length === n0 + 1);
  await tapSel('.panel button:has-text("Remove point")');
  step('remove the point with a tap', (await S()).actors[0].path.length === n0);

  // edit a distribution by touch + on-screen keyboard
  const inp = page.locator('.dist input').nth(4); // speed mean
  const ib = await inp.boundingBox();
  await tapAt([ib.x + ib.width / 2, ib.y + ib.height / 2]);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('1.4');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  step('edit a spread in the variation table', (await S()).actors[0].speed.mean === 1.4);
  await tapSel('[aria-label=Undo]');
  await tapSel('[aria-label=Undo]');
  await tapSel('[aria-label=Undo]');

  // timeline scrub by touch
  const rb = await page.locator('.timeline input[type=range]').boundingBox();
  await drag([rb.x + rb.width * 0.9, rb.y + rb.height / 2], [rb.x + rb.width * 0.3, rb.y + rb.height / 2]);
  const tNow = (await U()).t;
  step('scrub the timeline', tNow < 5, `t = ${tNow.toFixed(2)} s`);
  await tapSel('.timeline button:has-text("Closest")');

  // Luck: dial by touch
  await tapSel('[data-screen=luck]');
  await page.waitForFunction(() => window.__almost.ui.screen === 'luck', null, { timeout: 2000 });
  await page.waitForFunction(() => window.__almost.lastRun);
  const db = await page.locator('.dial').boundingBox();
  const cx = db.x + db.width / 2, cy = db.y + db.height / 2, r = db.width * 0.33;
  const before = await page.evaluate(() => window.__almost.lastRun.at);
  // from ×1 (upper left) clockwise to about ×2 (upper right)
  const pts = [];
  for (let a = -45; a <= 45; a += 10) pts.push([cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)]);
  await touch('touchStart', [pts[0]]);
  for (const p of pts.slice(1)) await touch('touchMove', [p]);
  await touch('touchEnd', []);
  await page.waitForFunction((b) => window.__almost.lastRun.at !== b && window.__almost.lastRun.dial > 1.5, before, { timeout: 10000 });
  const dialRun = await page.evaluate(() => window.__almost.lastRun);
  step('turn the Luck dial and rerun', dialRun.dial > 1.5, `dial ×${dialRun.dial.toFixed(2)} → ${(dialRun.luck.p * 100).toFixed(1)}%`);

  // tap a contact point to inspect a replay
  const target = await page.evaluate(() => {
    const a = window.__almost;
    // find a contact point in the swarm
    return a.ui.result ? null : null;
  });
  void target;
  const cp = await page.evaluate(() => {
    const a = window.__almost;
    const r = a.ui.result;
    for (let i = 0; i < r.n; i++) if (r.contact[i]) return { i, x: r.px[i], y: r.py[i] };
    return null;
  });
  if (cp) {
    await tapAt(await scr(cp.x, cp.y));
    const ins = (await U()).inspect;
    step('tap a contact point to inspect a replay', ins !== null, `replay #${ins}`);
  } else step('tap a contact point to inspect a replay', false, 'no contact');

  const failed = steps.filter((s) => !s.ok);
  for (const s of steps) console.log(`   ${s.ok ? '✓' : '✗'} ${s.name}${s.detail ? ` (${s.detail})` : ''}`);
  check('Every edit works by touch on a tablet (M1 edits)', failed.length === 0, `${steps.length - failed.length}/${steps.length} touch steps`);
  check('No uncaught page errors (tablet)', errors.length === 0, errors.join(' | ') || 'none');
  await page.screenshot({ path: 'e2e/out/tablet-luck.png' });
  await ctx.close();
}

const browser = await chromium.launch();
try {
  await desktopChecks(browser);
  await touchChecks(browser);
} finally {
  await browser.close();
}
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
