import { num, pct, t } from '../../i18n';
import { PARAM_KEYS } from '../../engine/sample';
import { h, icon } from '../dom';
import { createDial } from '../dial';
import type { AppHost } from '../host';

const N_OPTIONS = [100, 400, 1000, 2000];

/** The Luck panel is mounted once per visit and updated in place, so the dial survives runs. */
export function luckPanel(app: AppHost): { el: HTMLElement; update(): void } {
  const { ui, store } = app;
  const root = h('div.panel-body');
  root.style.display = 'contents';

  const dialValue = h('div.dial-value', { 'aria-hidden': 'true' });
  const dial = createDial(
    ui.dial,
    (v) => {
      ui.dial = v;
      dialValue.textContent = `×${v.toFixed(2)}`;
    },
    (v) => {
      ui.dial = v;
      app.run();
    },
  );
  dialValue.textContent = `×${ui.dial.toFixed(2)}`;
  const resetDial = h('button.btn', {
    text: '×1',
    'aria-label': 'Reset dial to ×1',
    onclick: () => {
      ui.dial = 1;
      dial.set(1);
      dialValue.textContent = '×1.00';
      app.run();
    },
  });

  const nSel = h('select', { 'aria-label': t('luck.replays') });
  N_OPTIONS.forEach((n) => nSel.append(h('option', { value: n, selected: n === ui.n, text: String(n) })));
  nSel.addEventListener('change', () => {
    ui.n = parseInt(nSel.value, 10);
    app.run();
  });
  const seedIn = h('input', { type: 'number', inputmode: 'numeric', value: ui.seed, 'aria-label': t('luck.seed'), min: 0, step: 1 });
  seedIn.addEventListener('change', () => {
    const v = parseInt(seedIn.value, 10);
    if (Number.isFinite(v) && v >= 0) {
      ui.seed = v >>> 0;
      app.run();
    }
  });
  const dice = h('button.btn.icon', {
    html: icon.dice,
    'aria-label': t('luck.newSeed'),
    title: t('luck.newSeed'),
    onclick: () => {
      ui.seed = Math.floor(Math.random() * 100000);
      seedIn.value = String(ui.seed);
      app.run();
    },
  });
  const runBtn = h('button.btn.primary', { onclick: () => app.run(), 'data-run': '' });

  const results = h('div', {});
  results.style.display = 'contents';

  root.append(
    h('div.label', { text: t('screen.luck') }),
    h('h2', { text: t('luck.title') }),
    h('p.lede', { text: t('luck.lede') }),
    h('div.section', {},
      h('div.label', { text: t('luck.dial') }),
      h('div.dial-wrap', {}, dial.el, h('div', {}, dialValue, h('p.hint', { text: t('luck.dialHelp') }), h('div.row', {}, resetDial))),
      h('div.row', {}, h('label.field', {}, t('luck.replays'), nSel), h('label.field', {}, t('luck.seed'), seedIn), dice),
      runBtn,
    ),
    results,
  );

  function update() {
    const r = ui.result;
    runBtn.textContent = ui.progress ? t('luck.running', { d: ui.progress.done, n: ui.progress.n }) : t('luck.run', { n: ui.n });
    results.replaceChildren();
    if (!r) {
      results.append(h('div.empty', {}, h('div.aurora'), h('p', { text: t('luck.empty') })));
      return;
    }
    const scene = store.scene;
    const cards = h('div.cards');
    cards.append(
      h('div.card.wide', { 'data-score': '' },
        h('div.label', { text: t('luck.score') }),
        h('div.big', { text: pct(r.luck.p) }),
        h('p', { text: t('luck.scoreOf', { n: r.n, lo: pct(r.luck.lo), hi: pct(r.luck.hi) }) }),
      ),
      h('div.card', {},
        h('div.label', { text: t('luck.near') }),
        h('div.mid', { text: pct(r.nearMisses / r.n) }),
        h('p.muted', { text: `${r.nearMisses} ${t('luck.nearOf', { m: num(scene.sim.nearMiss, 1) })}` }),
      ),
    );
    // least strange contact: a preview of what the M2 adversary searches for
    let best = -1;
    for (let i = 0; i < r.n; i++) if (r.contact[i] && (best < 0 || r.strangeness[i] < r.strangeness[best])) best = i;
    const ls = h('div.card', {}, h('div.label', { text: t('luck.leastStrange') }));
    if (best >= 0) {
      ls.append(
        h('div.mid', { text: `${num(r.strangeness[best], 1)} sd` }),
        h('button.replay-pick', {
          text: t('luck.leastStrangeVal', { i: best, sd: num(r.strangeness[best], 2), pct: pct(1 - r.strangePct[best], 1) }),
          onclick: () => app.inspect(best),
        }),
      );
    } else ls.append(h('p.muted', { text: t('luck.noContact') }));
    cards.append(ls);
    results.append(cards);

    if (ui.stale) results.append(h('p.guard', { text: t('luck.stale') }));
    results.append(h('p.guard', { text: t('luck.guard', { dial: ui.dial.toFixed(2) }) }));

    // inspected replay
    const insp = h('div.section');
    if (ui.inspect !== null && ui.inspect < r.n) {
      const i = ui.inspect;
      const dims = scene.actors.reduce((s, a) => s + PARAM_KEYS.filter((k) => a[k].sd > 0).length, 0);
      const tbl = h('table.assume');
      tbl.append(h('tr', {}, h('th', { text: '' }), ...PARAM_KEYS.map((k) => h('th', { text: t(`param.${k}`) }))));
      scene.actors.forEach((a, ai) => {
        tbl.append(
          h('tr', {},
            h('td', { text: a.role }),
            ...PARAM_KEYS.map((_, ki) => h('td.mono', { text: num(r.params[(i * r.actors + ai) * PARAM_KEYS.length + ki], 2) })),
          ),
        );
      });
      insp.append(
        h('div.row', {}, h('div.label', { text: t('luck.replay', { i }) }), h('button.btn', { text: '×', 'aria-label': 'Close', onclick: () => app.inspect(null) })),
        h('p.mono', {
          text: r.contact[i]
            ? t('luck.outcomeContact', { v: num(r.relSpeed[i], 2), e: num(r.energy[i], 0) })
            : t('luck.outcomeMiss', { c: num(r.minClearance[i], 2) }),
        }),
        h('p.mono.muted', { text: t('luck.strangeness', { sd: num(r.strangeness[i], 2), k: dims, pct: pct(r.strangePct[i]) }) }),
        tbl,
      );
    } else {
      insp.append(h('p.hint', { text: t('luck.inspect') }));
    }
    results.append(insp);

    // assumptions
    const at = h('table.assume');
    at.append(h('tr', {}, h('th', { text: '' }), h('th', { text: '' }), h('th', { text: `${t('actors.mean')} · ${t('actors.sd')}×${ui.dial.toFixed(2)}` }), h('th', { text: `${t('actors.min')}–${t('actors.max')}` })));
    scene.actors.forEach((a) => {
      PARAM_KEYS.forEach((k, ki) => {
        const d = a[k];
        at.append(
          h('tr', {},
            h('td', { text: ki === 0 ? a.role : '' }),
            h('td', { text: t(`param.${k}`) }),
            h('td.mono', { text: `${num(d.mean, 2)} · ${num(d.sd * ui.dial, 2)}` }),
            h('td.mono', { text: `${num(d.min, 2)}–${num(d.max, 2)}` }),
          ),
        );
      });
    });
    results.append(
      h('div.section', {}, h('div.label', { text: t('luck.assumptions') }), at,
        h('p.mono.muted', { text: `${t('actors.decel')}: ${scene.actors.map((a) => `${a.role} ${num(a.decel, 1)}`).join(' · ')} · notice TTC < ${num(scene.sim.noticeTTC, 1)} s · step 1/${Math.round(1 / scene.sim.dt)} s · horizon ${num(scene.sim.horizon, 0)} s` }),
      ),
    );
  }

  update();
  return { el: root, update };
}
