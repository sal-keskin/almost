import '@fontsource/schibsted-grotesk/800.css';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/600.css';
import './styles/tokens.css';
import './styles/app.css';

import { num, t } from './i18n';
import { corner3b } from './model/corner3b';
import { Store } from './model/store';
import { exportScene, importScene, loadLocal, saveLocal } from './model/persist';
import { compile, trackReplay } from './engine/simulate';
import { meanDraw, PARAM_KEYS, type ActorParams } from './engine/sample';
import { bodyGap } from './engine/geometry';
import { Camera } from './ui/camera';
import { h, icon } from './ui/dom';
import { attachInteraction } from './ui/interact';
import { drawScene, poseAtTime } from './ui/render';
import { initialUI, type Screen } from './ui/state';
import { SwarmLayer } from './ui/swarmLayer';
import { Runner } from './ui/runner';
import { drawPanel, deleteSelection } from './ui/panels/draw';
import { actorsPanel } from './ui/panels/actors';
import { luckPanel } from './ui/panels/luck';
import type { AppHost } from './ui/host';

async function boot() {
  const saved = await loadLocal();
  const store = new Store(saved ?? corner3b());
  const ui = initialUI();
  const cam = new Camera();
  const layer = new SwarmLayer();
  const runner = new Runner();

  // ---------- DOM ----------
  const tabsEl = h('nav.tabs', { role: 'tablist', 'aria-label': 'Screens' });
  const screens: Array<{ id: Screen | 'fix' | 'duel' | 'library' | 'report'; m?: string }> = [
    { id: 'draw' }, { id: 'actors' }, { id: 'luck' },
    { id: 'fix', m: 'M2' }, { id: 'duel', m: 'M2' }, { id: 'library', m: 'M4' }, { id: 'report', m: 'M4' },
  ];
  for (const s of screens) {
    const b = h('button.tab', {
      role: 'tab',
      'data-screen': s.id,
      disabled: !!s.m,
      title: s.m ? t('screen.later', { m: s.m }) : undefined,
      onclick: () => !s.m && setScreen(s.id as Screen),
    }, t(`screen.${s.id}` as const), s.m ? h('span.tag', { text: s.m }) : null);
    tabsEl.append(b);
  }
  const undoBtn = h('button.btn.icon', { html: icon.undo, 'aria-label': t('top.undo'), title: t('top.undo'), onclick: () => store.undo() });
  const redoBtn = h('button.btn.icon', { html: icon.redo, 'aria-label': t('top.redo'), title: t('top.redo'), onclick: () => store.redo() });
  const topbar = h('header.topbar', {},
    h('div.wordmark-wrap', {}, h('span.wordmark', { 'data-text': 'ALMOST', text: 'ALMOST' }), h('span.label.muted', { text: t('app.tagline') })),
    tabsEl,
    h('div.top-actions', {},
      undoBtn,
      redoBtn,
      h('button.btn.icon', {
        html: icon.upload, 'aria-label': t('top.import'), title: t('top.import'),
        onclick: async () => {
          const s = await importScene();
          if (s) store.replace(s);
          else alert(t('top.importFailed'));
        },
      }),
      h('button.btn.icon', { html: icon.download, 'aria-label': t('top.export'), title: t('top.export'), onclick: () => exportScene(store.scene) }),
      h('button.btn.icon', {
        html: icon.reset, 'aria-label': t('top.reset'), title: t('top.reset'),
        onclick: () => confirm(t('top.resetConfirm')) && store.replace(corner3b()),
      }),
    ),
  );

  const canvas = h('canvas', { 'aria-label': 'Scene canvas', role: 'img' });
  const legend = h('div.legend', { 'aria-hidden': 'true' });
  legend.innerHTML = `
    <span><i style="background:#fff"></i>${t('legend.reported')}</span>
    <span><i style="background:rgba(255,255,255,.35)"></i>${t('legend.replay')}</span>
    <span><i style="background:var(--gold)"></i>${t('legend.contact')}</span>
    <span><i class="dot" style="background:var(--gold)"></i>${t('legend.point')}</span>`;
  const meta = h('div.stage-meta.mono');
  const progress = h('div.progress-bar');
  const fitBtn = h('button.btn.icon', { html: icon.fit, 'aria-label': 'Fit to scene', title: 'Fit', onclick: () => { fit(); redraw(); } });
  fitBtn.style.cssText = 'position:absolute;right:12px;top:12px;background:var(--ground)';
  const canvasWrap = h('div.canvas-wrap', {}, canvas, legend, meta, progress, fitBtn);

  const playBtn = h('button.btn.icon', { html: icon.play, 'aria-label': t('timeline.play') });
  const scrub = h('input', { type: 'range', min: 0, max: 12, step: 1 / 30, value: 0, 'aria-label': 'Timeline' });
  const closestBtn = h('button.btn', { html: icon.target + `<span>${t('timeline.closest')}</span>` });
  const readout = h('div.readout.mono');
  const timeline = h('div.timeline', {}, playBtn, scrub, readout, closestBtn);
  const stage = h('section.stage', {}, canvasWrap, timeline);
  const panelEl = h('aside.panel', { 'aria-live': 'polite' });
  document.querySelector('#app')!.append(h('div.app', {}, topbar, h('main.main', {}, stage, panelEl)));

  // ---------- host ----------
  let dirty = true;
  const redraw = () => {
    dirty = true;
  };
  let luck: ReturnType<typeof luckPanel> | null = null;

  function panel() {
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    for (const b of tabsEl.querySelectorAll<HTMLButtonElement>('.tab')) b.setAttribute('aria-selected', String(b.dataset.screen === ui.screen));
    if (ui.screen === 'luck') {
      if (!luck) {
        luck = luckPanel(host);
        panelEl.replaceChildren(luck.el);
      }
      luck.update();
    } else {
      luck = null;
      panelEl.replaceChildren(ui.screen === 'draw' ? drawPanel(host) : actorsPanel(host));
    }
    legend.style.display = ui.screen === 'luck' && ui.result ? 'grid' : 'none';
    const r = ui.result;
    meta.textContent = ui.screen === 'luck' && r
      ? t('luck.meta', { n: r.n, seed: r.config.seed, dial: r.config.dial.toFixed(2), ms: Math.round(r.ms) })
      : `${store.scene.name} · 0.1 m grid`;
    progress.style.width = ui.progress ? `${(100 * ui.progress.done) / ui.progress.n}%` : '0';
    updateTimeline();
  }

  function setScreen(s: Screen) {
    if (ui.screen === s) return;
    ui.screen = s;
    ui.selection = null;
    panelEl.scrollTop = 0;
    window.scrollTo({ top: 0 });
    if (s !== 'luck' && ui.inspect !== null) {
      ui.inspect = null;
      recomputeTrack();
    }
    panel();
    redraw();
    if (s === 'luck' && (ui.stale || !ui.result)) run();
  }

  function paramsFor(i: number): ActorParams[] {
    const r = ui.result!;
    return store.scene.actors.map((_, ai) => {
      const o: Partial<ActorParams> = {};
      PARAM_KEYS.forEach((k, ki) => (o[k] = r.params[(i * r.actors + ai) * PARAM_KEYS.length + ki]));
      return o as ActorParams;
    });
  }

  function recomputeTrack() {
    const scene = store.scene;
    if (scene.actors.length < 2 || scene.actors.some((a) => a.path.length < 2)) {
      ui.track = null;
      return;
    }
    const params = ui.inspect !== null && ui.result && !ui.stale ? paramsFor(ui.inspect) : meanDraw(scene).params;
    ui.track = trackReplay(compile(scene), params);
  }

  let runTimer = 0;
  function run() {
    clearTimeout(runTimer);
    const scene = JSON.parse(JSON.stringify(store.scene));
    const config = { seed: ui.seed, n: ui.n, dial: ui.dial };
    ui.progress = { done: 0, n: config.n };
    panel();
    runner
      .run(scene, config, (done, n) => {
        ui.progress = { done, n };
        if (luck) luck.update();
        progress.style.width = `${(100 * done) / n}%`;
      })
      .then((r) => {
        if (!r) return; // superseded
        ui.progress = null;
        ui.result = r;
        ui.stale = false;
        ui.inspect = null;
        layer.setResult(r);
        recomputeTrack();
        panel();
        redraw();
        (window as any).__almost.lastRun = { ms: r.ms, n: r.n, seed: r.config.seed, dial: r.config.dial, luck: r.luck, contacts: r.contacts, hash: r.hash, at: performance.now() };
      });
  }

  function inspect(i: number | null) {
    ui.inspect = i;
    recomputeTrack();
    if (ui.track) ui.t = Math.min(ui.track.outcome.tClosest, ui.track.times[ui.track.times.length - 1]);
    panel();
    redraw();
  }

  const host: AppHost = { store, ui, redraw, panel, setScreen, run, inspect };

  attachInteraction(canvas, {
    store,
    ui,
    cam,
    redraw,
    panel,
    pick(sx, sy) {
      const r = ui.result;
      if (!r || ui.stale) return;
      let best = -1, bd = 22;
      for (let i = 0; i < r.n; i++) {
        if (!r.contact[i]) continue;
        const [x, y] = cam.toScreen(r.px[i], r.py[i]);
        const d = Math.hypot(x - sx, y - sy);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      inspect(best >= 0 ? best : null);
    },
  });

  // ---------- store reactions ----------
  let saveTimer = 0;
  store.subscribe((_s, reason) => {
    recomputeTrack();
    ui.stale = true;
    if (ui.inspect !== null) ui.inspect = null;
    if (reason === 'live') {
      redraw();
      updateTimeline();
      return;
    }
    if (ui.selection?.kind === 'vertex' && !store.scene.actors[ui.selection.actor]?.path[ui.selection.index]) ui.selection = null;
    panel();
    redraw();
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveLocal(store.scene), 400);
    if (ui.screen === 'luck') {
      clearTimeout(runTimer);
      runTimer = window.setTimeout(run, 250);
    }
  });

  // ---------- timeline ----------
  function updateTimeline() {
    const tr = ui.track;
    const end = tr ? tr.times[tr.times.length - 1] : store.scene.sim.horizon;
    scrub.max = String(end);
    ui.t = Math.min(ui.t, end);
    scrub.value = String(ui.t);
    playBtn.innerHTML = ui.playing ? icon.pause : icon.play;
    playBtn.setAttribute('aria-label', ui.playing ? t('timeline.pause') : t('timeline.play'));
    const poses = poseAtTime(ui);
    let txt = `t ${num(ui.t, 2)} s`;
    if (poses && poses[0]?.present && poses[1]?.present) {
      const g = bodyGap(poses[0].shapes, poses[1].shapes).d;
      txt += ` · ${g <= 0 ? t('timeline.contact') : t('timeline.clearance', { c: num(g, 2) })}`;
    }
    readout.textContent = txt;
  }
  scrub.addEventListener('input', () => {
    ui.t = parseFloat(scrub.value);
    ui.playing = false;
    updateTimeline();
    redraw();
  });
  playBtn.addEventListener('click', () => {
    const tr = ui.track;
    if (!tr) return;
    const end = tr.times[tr.times.length - 1];
    if (!ui.playing && ui.t >= end - 1e-6) ui.t = 0;
    ui.playing = !ui.playing;
    lastFrame = performance.now();
    updateTimeline();
  });
  closestBtn.addEventListener('click', () => {
    if (!ui.track) return;
    ui.playing = false;
    ui.t = ui.track.outcome.tClosest;
    updateTimeline();
    redraw();
  });

  // ---------- keyboard ----------
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      store.redo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selection) {
      e.preventDefault();
      deleteSelection(host);
    } else if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      playBtn.click();
    }
  });

  // ---------- canvas sizing and frame loop ----------
  const ctx = canvas.getContext('2d')!;
  let cssW = 0, cssH = 0, dpr = 1, fitted = false;
  function fit() {
    cam.fit(store.scene.bounds.w, store.scene.bounds.h, cssW, cssH);
  }
  new ResizeObserver(() => {
    const r = canvasWrap.getBoundingClientRect();
    cssW = r.width;
    cssH = r.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    layer.resize(cssW, cssH, dpr);
    if (!fitted || cssW > 0) {
      fit();
      fitted = true;
    }
    redraw();
  }).observe(canvasWrap);

  let lastFrame = performance.now();
  function frame(now: number) {
    if (ui.playing && ui.track) {
      const end = ui.track.times[ui.track.times.length - 1];
      ui.t = Math.min(end, ui.t + (now - lastFrame) / 1000);
      if (ui.t >= end) ui.playing = false;
      updateTimeline();
      dirty = true;
    }
    lastFrame = now;
    let animating = false;
    if (ui.screen === 'luck') animating = layer.update(cam);
    if ((dirty || animating) && cssW > 0) {
      drawScene(ctx, cam, store.scene, ui, layer, dpr, cssW, cssH);
      dirty = animating;
    }
    requestAnimationFrame(frame);
  }

  (window as any).__almost = { store, ui, cam, run, setScreen, inspect, lastRun: null };

  recomputeTrack();
  if (ui.track) ui.t = ui.track.outcome.tClosest;
  panel();
  requestAnimationFrame(frame);
}

boot();
