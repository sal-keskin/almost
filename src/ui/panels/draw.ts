import { t } from '../../i18n';
import type { Furniture, HeightClass } from '../../model/types';
import { h, icon, numInput } from '../dom';
import type { AppHost } from '../host';
import type { DrawTool } from '../state';

export function drawPanel(app: AppHost): HTMLElement {
  const { ui, store } = app;
  const scene = store.scene;
  const root = h('div.panel-body');
  root.style.display = 'contents';

  root.append(
    h('div.label', { text: t('screen.draw') }),
    h('h2', { text: t('draw.title') }),
    h('p.lede', { text: t('draw.lede') }),
  );

  const tools: DrawTool[] = ['select', 'wall', 'furniture'];
  const seg = h('div.segmented', { role: 'group' });
  for (const tool of tools) {
    seg.append(
      h('button.btn', {
        'aria-pressed': ui.drawTool === tool ? 'true' : 'false',
        'data-tool': tool,
        text: t(`draw.tool.${tool}` as const),
        onclick: () => {
          ui.drawTool = tool;
          app.panel();
          app.redraw();
        },
      }),
    );
  }
  root.append(h('div.section', {}, seg, h('p.hint', { text: t(`draw.hint.${ui.drawTool}` as const) })));

  // inspector
  const insp = h('div.section');
  const sel = ui.selection;
  if (sel?.kind === 'wall') {
    const w = scene.walls.find((x) => x.id === sel.id);
    if (w) {
      const len = Math.hypot(w.a.x - w.b.x, w.a.y - w.b.y);
      const coord = (end: 'a' | 'b', axis: 'x' | 'y') =>
        h('label.field', {}, `${end.toUpperCase()}.${axis}`, numInput(w[end][axis], (v) => store.edit((s) => {
          const ww = s.walls.find((x) => x.id === w.id);
          if (ww) ww[end][axis] = Math.round(v * 10) / 10;
        }), { label: `${end}.${axis}` }));
      insp.append(
        h('div.label', { text: t('draw.wall') }),
        h('p.mono.muted', { text: t('draw.length', { v: len.toFixed(2) }) }),
        h('div.row', {}, coord('a', 'x'), coord('a', 'y')),
        h('div.row', {}, coord('b', 'x'), coord('b', 'y')),
        deleteBtn(app),
      );
    }
  } else if (sel?.kind === 'furniture') {
    const f = scene.furniture.find((x) => x.id === sel.id);
    if (f) {
      const upd = (fn: (ff: Furniture) => void) => store.edit((s) => {
        const ff = s.furniture.find((x) => x.id === f.id);
        if (ff) fn(ff);
      });
      const label = h('input', { value: f.label, 'aria-label': t('draw.label') });
      label.addEventListener('change', () => upd((ff) => (ff.label = label.value.slice(0, 40))));
      const height = h('select', { 'aria-label': t('draw.height') });
      for (const hc of ['low', 'waist', 'tall'] as HeightClass[]) {
        height.append(h('option', { value: hc, selected: f.height === hc, text: t(`draw.height.${hc}` as const) }));
      }
      height.addEventListener('change', () => upd((ff) => (ff.height = height.value as HeightClass)));
      insp.append(
        h('div.label', { text: t('draw.furniture') }),
        h('label.field', {}, t('draw.label'), label),
        h('div.row', {},
          h('label.field', {}, t('draw.width'), numInput(f.w, (v) => upd((ff) => (ff.w = Math.max(0.1, v))), { step: 0.05, min: 0.1 })),
          h('label.field', {}, t('draw.depth'), numInput(f.d, (v) => upd((ff) => (ff.d = Math.max(0.1, v))), { step: 0.05, min: 0.1 })),
        ),
        h('div.row', {},
          h('label.field', {}, t('draw.rotation'), numInput(f.rotation, (v) => upd((ff) => (ff.rotation = ((v % 360) + 360) % 360)), { step: 15 })),
          h('label.field', {}, t('draw.height'), height),
        ),
        h('div.row', {},
          h('button.btn', { html: icon.rotate + `<span>${t('draw.rotate')}</span>`, onclick: () => upd((ff) => (ff.rotation = (ff.rotation + 90) % 360)) }),
          deleteBtn(app),
        ),
      );
    }
  } else {
    insp.append(h('p.hint', { text: t('draw.nothing') }));
  }
  root.append(insp);

  root.append(
    h('div.section', {},
      h('button.btn.primary', { text: t('draw.next'), onclick: () => app.setScreen('actors') }),
    ),
  );
  return root;
}

function deleteBtn(app: AppHost): HTMLElement {
  return h('button.btn', {
    html: icon.trash + `<span>${t('draw.delete')}</span>`,
    onclick: () => deleteSelection(app),
  });
}

export function deleteSelection(app: AppHost): void {
  const sel = app.ui.selection;
  if (!sel) return;
  if (sel.kind === 'wall') app.store.edit((s) => (s.walls = s.walls.filter((w) => w.id !== sel.id)));
  else if (sel.kind === 'furniture') app.store.edit((s) => (s.furniture = s.furniture.filter((f) => f.id !== sel.id)));
  else if (sel.kind === 'vertex') {
    const path = app.store.scene.actors[sel.actor].path;
    if (path.length <= 2) return;
    app.store.edit((s) => s.actors[sel.actor].path.splice(sel.index, 1));
  }
  app.ui.selection = null;
  app.panel();
  app.redraw();
}
