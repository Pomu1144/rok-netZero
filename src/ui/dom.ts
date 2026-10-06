import { assetUrl } from '../assets';
import { reducedMotion } from '../a11y';
import { sfx } from '../audio';
import { COMMANDER_BY_ID } from '../data/commanders';
import { ITEMS, type ItemId } from '../data/items';
import { RES_KEYS, type Cost, type ResKey } from '../data/types';
import type { GameState, Reward } from '../game/state';
import { esc, fmt } from './format';

export function $(sel: string, root: ParentNode = document): HTMLElement {
  return root.querySelector(sel) as HTMLElement;
}

export function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

/** Delegate clicks on [data-act] elements inside `root`. */
export function onAct(root: HTMLElement, handlers: Record<string, (target: HTMLElement) => void>): void {
  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t || !root.contains(t)) return;
    const h = handlers[t.dataset.act!];
    if (h) {
      e.stopPropagation();
      if (t.hasAttribute('disabled')) {
        sfx.error();
        return;
      }
      h(t);
    }
  });
}

// ---------------------------------------------------------------------------
// modals

export interface ModalHandle {
  body: HTMLElement;
  refresh: () => void;
  close: () => void;
  setTitle: (t: string) => void;
}

interface ModalOpts {
  title: string;
  /** kanji pressed into the header seal */
  seal: string;
  /** small Cinzel caption above the title */
  kicker: string;
  size?: 'narrow' | 'wide' | '';
  /** live modals are re-rendered whenever game state changes */
  live?: boolean;
  render: (body: HTMLElement, h: ModalHandle) => void;
  onClose?: () => void;
}

const open: { opts: ModalOpts; handle: ModalHandle; root: HTMLElement }[] = [];

export function openModal(opts: ModalOpts): ModalHandle {
  sfx.open();
  const root = el(`
    <div class="modal-back">
      <div class="modal ${opts.size ?? ''}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div class="seal">${esc(opts.seal)}</div>
          <div class="grow"><div class="kicker">${esc(opts.kicker)}</div><h2></h2></div>
          <button class="modal-close" aria-label="Close"></button>
          <div class="brush"></div>
        </div>
        <div class="modal-body"></div>
      </div>
    </div>`);
  const body = $('.modal-body', root);
  const title = $('.modal-head h2', root);
  title.textContent = opts.title;
  let closed = false;
  const handle: ModalHandle = {
    body,
    refresh: () => {
      const scroll = body.scrollTop;
      body.innerHTML = '';
      opts.render(body, handle);
      body.scrollTop = scroll;
      updateTimers();
    },
    close: () => {
      if (closed) return;
      closed = true;
      const i = open.findIndex((m) => m.handle === handle);
      if (i >= 0) open.splice(i, 1);
      root.classList.add('closing');
      setTimeout(() => root.remove(), 200);
      sfx.close();
      opts.onClose?.();
    },
    setTitle: (t) => (title.textContent = t),
  };
  $('.modal-close', root).addEventListener('click', () => handle.close());
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) handle.close();
  });
  $('#modal-root').appendChild(root);
  open.push({ opts, handle, root });
  handle.refresh();
  return handle;
}

export function refreshLiveModals(): void {
  for (const m of open) if (m.opts.live) m.handle.refresh();
}

export function closeAllModals(): void {
  while (open.length) open[open.length - 1].handle.close();
}

export function closeTopModal(): void {
  open[open.length - 1]?.handle.close();
}

export function anyModalOpen(): boolean {
  return open.length > 0;
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open.length) open[open.length - 1].handle.close();
});

// ---------------------------------------------------------------------------
// toasts: a brush band sweeping in

export function toast(text: string, kind: 'good' | 'bad' | 'info' = 'info', iconName?: string, onClick?: () => void): void {
  const mark = kind === 'bad' ? '<span class="mark">警</span>' : kind === 'good' ? '<span class="mark"></span>' : '';
  const t = el(`<div class="toast ${kind}">${mark}${iconName ? `<img src="${assetUrl(iconName)}" alt="">` : ''}<span>${esc(text)}</span></div>`);
  if (onClick) t.addEventListener('click', onClick);
  const root = $('#toasts');
  root.appendChild(t);
  while (root.children.length > 3) root.firstElementChild!.remove();
  setTimeout(() => t.classList.add('out'), 3400);
  setTimeout(() => t.remove(), 3900);
}

// ---------------------------------------------------------------------------
// shared widgets

/** A painted (full colour) game icon such as a resource or item. */
export function icon(name: string, size = 22): string {
  return `<img src="${assetUrl(name)}" width="${size}" height="${size}" alt="" style="object-fit:contain">`;
}

export function costHtml(s: GameState, cost: Cost, mult = 1): string {
  const parts = RES_KEYS.filter((k) => (cost[k] ?? 0) > 0).map((k) => {
    const need = (cost[k] ?? 0) * mult;
    const lack = s.res[k] < need;
    return `<span class="cost ${lack ? 'lack' : ''}" title="${k}">${icon(`ic_${k}`)}${fmt(need)}${lack ? ` <small>/ ${fmt(s.res[k])}</small>` : ''}</span>`;
  });
  return `<div class="costs">${parts.join('') || '<span class="muted">No cost</span>'}</div>`;
}

export function rewardHtml(r: Reward): string {
  const out: string[] = [];
  if (r.res) {
    for (const k in r.res) {
      const v = r.res[k as ResKey | 'gems'] ?? 0;
      if (v > 0) out.push(`<span class="reward">${icon(`ic_${k}`)}${fmt(v)}</span>`);
    }
  }
  if (r.items) {
    for (const k in r.items) {
      const v = r.items[k as ItemId] ?? 0;
      if (v > 0) out.push(`<span class="reward" title="${ITEMS[k as ItemId].name}">${icon(ITEMS[k as ItemId].icon)}×${v}</span>`);
    }
  }
  if (r.sculptures) {
    for (const k in r.sculptures) out.push(`<span class="reward">${icon('ic_sculpture')}${COMMANDER_BY_ID[k].name} ×${r.sculptures[k]}</span>`);
  }
  if (r.xp) out.push(`<span class="reward">${icon('ic_tome')}${fmt(r.xp)} XP</span>`);
  return `<div class="rewards">${out.join('')}</div>`;
}

// ---------------------------------------------------------------------------
// countdowns: elements with data-end (game ms) and optional data-start get live text / bars

let clock: () => number = () => 0;
export function setClock(fn: () => number): void {
  clock = fn;
}

export function updateTimers(): void {
  const now = clock();
  document.querySelectorAll<HTMLElement>('[data-end]').forEach((e) => {
    const end = Number(e.dataset.end);
    const secs = Math.max(0, (end - now) / 1000);
    if (e.dataset.start) {
      const start = Number(e.dataset.start);
      e.style.width = `${Math.min(100, Math.max(0, ((now - start) / Math.max(1, end - start)) * 100))}%`;
    } else {
      const sec = Math.ceil(secs);
      const d = Math.floor(sec / 86400);
      const h = Math.floor((sec % 86400) / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const pad = (x: number) => String(x).padStart(2, '0');
      e.textContent = d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }
  });
}

/** Animate resource icons flying from a screen point into a HUD element. */
export function flyTo(iconName: string, fromX: number, fromY: number, target: Element | null, count = 6, onArrive?: () => void): void {
  if (!target) return;
  if (reducedMotion()) {
    onArrive?.();
    return;
  }
  const r = target.getBoundingClientRect();
  const tx = r.left + 18;
  const ty = r.top + r.height / 2;
  let arrived = 0;
  for (let i = 0; i < count; i++) {
    const f = document.createElement('img');
    f.className = 'flyer';
    f.src = assetUrl(iconName);
    document.body.appendChild(f);
    const sx = fromX + (Math.random() - 0.5) * 70;
    const sy = fromY + (Math.random() - 0.5) * 40;
    const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 160;
    const my = Math.min(sy, ty) - 80 - Math.random() * 80;
    const a = f.animate(
      [
        { transform: `translate(${fromX - 17}px, ${fromY - 17}px) scale(0.4)`, opacity: 0 },
        { transform: `translate(${sx - 17}px, ${sy - 17}px) scale(1.15)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${mx - 17}px, ${my - 17}px) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${tx - 17}px, ${ty - 17}px) scale(0.55)`, opacity: 0.9 },
      ],
      { duration: 850 + i * 70, easing: 'cubic-bezier(0.45, 0, 0.3, 1)', delay: i * 45, fill: 'both' },
    );
    a.onfinish = () => {
      f.remove();
      if (++arrived === count) onArrive?.();
    };
  }
}
