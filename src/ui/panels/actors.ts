import { num, t } from '../../i18n';
import type { Actor, ActorKind, Dist, Role } from '../../model/types';
import { PARAM_KEYS, type ParamKey } from '../../engine/sample';
import { DEFAULT_MASS } from '../../engine/simulate';
import { h, icon, numInput } from '../dom';
import type { AppHost } from '../host';
import { deleteSelection } from './draw';

const ROLES: Role[] = ['Nurse', 'Porter', 'Visitor', 'Doctor', 'Cleaner', 'Patient'];
const KINDS: ActorKind[] = ['person', 'trolley', 'bed', 'forklift'];

export function distTable(actor: Actor, onEdit: (k: ParamKey, field: keyof Dist, v: number) => void): HTMLElement {
  const grid = h('div.dist');
  grid.append(h('span'), ...(['mean', 'sd', 'min', 'max'] as const).map((k) => h('span.h', { text: t(`actors.${k}`) })));
  for (const k of PARAM_KEYS) {
    const d = actor[k];
    grid.append(h('span', { text: t(`param.${k}`) }));
    for (const f of ['mean', 'sd', 'min', 'max'] as const) {
      grid.append(numInput(d[f], (v) => onEdit(k, f, v), { step: k === 'speed' || k === 'cut' ? 0.01 : 0.05, label: `${t(`param.${k}`)} ${f}` }));
    }
  }
  return grid;
}

export function actorsPanel(app: AppHost): HTMLElement {
  const { ui, store } = app;
  const scene = store.scene;
  const root = h('div.panel-body');
  root.style.display = 'contents';
  root.append(
    h('div.label', { text: t('screen.actors') }),
    h('h2', { text: t('actors.title') }),
    h('p.lede', { text: t('actors.lede') }),
  );

  scene.actors.forEach((a, i) => {
    const upd = (fn: (x: Actor) => void) => store.edit((s) => fn(s.actors[i]));
    const selected = i === ui.actor;
    const card = h('div.actor-card', { 'data-selected': selected ? 'true' : 'false', 'data-actor': i });
    card.addEventListener('pointerdown', () => {
      if (ui.actor !== i) {
        ui.actor = i;
        app.panel();
        app.redraw();
      }
    });
    const role = h('select', { 'aria-label': t('actors.role') });
    ROLES.forEach((r) => role.append(h('option', { value: r, selected: r === a.role, text: r })));
    role.addEventListener('change', () => upd((x) => (x.role = role.value as Role)));
    const kind = h('select', { 'aria-label': t('actors.kind') });
    KINDS.forEach((k) => kind.append(h('option', { value: k, selected: k === a.kind, text: t(`actors.kind.${k}` as const) })));
    kind.addEventListener('change', () =>
      upd((x) => {
        x.kind = kind.value as ActorKind;
        x.massKg = DEFAULT_MASS[x.kind];
      }),
    );
    card.append(
      h('div.who', {}, h('span.badge', { text: a.role[0] }), h('strong', { text: `${String.fromCharCode(65 + i)} · ${a.role}` })),
      h('div.row', {}, h('label.field', {}, t('actors.role'), role), h('label.field', {}, t('actors.kind'), kind)),
    );
    if (selected) {
      card.append(
        h('div.row', {},
          h('label.field', {}, t('actors.mass'), numInput(a.massKg, (v) => upd((x) => (x.massKg = Math.max(1, v))), { step: 5, min: 1 })),
          h('label.field', {}, t('actors.decel'), numInput(a.decel, (v) => upd((x) => (x.decel = Math.max(0.1, v))), { step: 0.1, min: 0.1 })),
          h('label.field', {}, t('actors.radius'), numInput(a.cornerRadius, (v) => upd((x) => (x.cornerRadius = Math.max(0, v))), { step: 0.1, min: 0 })),
        ),
        h('div.label', { text: t('actors.dist') }),
        distTable(a, (k, f, v) =>
          upd((x) => {
            const d = { ...x[k], [f]: v };
            d.sd = Math.max(0, d.sd);
            if (d.min > d.max) [d.min, d.max] = [d.max, d.min];
            x[k] = d;
          }),
        ),
        h('div.row', {},
          h('button.btn', {
            text: t('actors.reverse'),
            onclick: () => upd((x) => x.path.reverse()),
          }),
          ui.selection?.kind === 'vertex' && ui.selection.actor === i
            ? h('button.btn', { html: icon.trash + `<span>${t('actors.removeVertex')}</span>`, disabled: a.path.length <= 2, onclick: () => deleteSelection(app) })
            : null,
        ),
      );
    }
    root.append(card);
  });

  // reported event
  const tr = ui.track;
  const rep = h('div.section');
  rep.append(h('div.label', { text: t('actors.reported') }), h('p.guard', { text: `${t('actors.account')}: “${scene.reported.note}”` }));
  if (tr && ui.inspect === null) {
    const o = tr.outcome;
    rep.append(
      h('p.mono', {
        text: o.contact
          ? t('actors.contactVal', { t: num(o.tClosest, 2) })
          : t('actors.closestVal', { c: num(o.minClearance, 2), t: num(o.tClosest, 2) }),
      }),
      h('button.btn', {
        html: icon.target + `<span>${t('actors.closest')}</span>`,
        onclick: () => {
          ui.t = o.tClosest;
          ui.playing = false;
          app.panel();
          app.redraw();
        },
      }),
    );
  }
  root.append(rep);
  root.append(h('div.section', {}, h('button.btn.primary', { text: t('actors.next'), onclick: () => app.setScreen('luck') })));
  return root;
}
