import type { GameState } from './game/state';

/**
 * Accessibility preferences: text size, reduced motion (following the device by
 * default) and a colour-safe palette that never relies on red against green.
 * Renderers read the live flags; the DOM is styled through classes on <html>.
 */

export type MotionPref = 'system' | 'reduce' | 'full';
export const TEXT_SIZES = [0.9, 1, 1.15, 1.3] as const;

let reduce = false;
let safe = false;
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function reducedMotion(): boolean {
  return reduce;
}

export function colorSafe(): boolean {
  return safe;
}

/** Route and marker colours: attack, gather, scout, returning. Colour-safe swaps red/green for orange/blue. */
export function routeColor(kind: 'attack' | 'gather' | 'scout' | 'return'): string {
  if (safe) return { attack: 'rgba(230,159,0,0.95)', gather: 'rgba(86,180,233,0.95)', scout: 'rgba(240,228,66,0.95)', return: 'rgba(241,235,220,0.75)' }[kind];
  return { attack: 'rgba(217,96,79,0.95)', gather: 'rgba(143,181,138,0.95)', scout: 'rgba(232,207,140,0.95)', return: 'rgba(241,235,220,0.75)' }[kind];
}

export function applyA11y(s: GameState): void {
  const a = s.a11y ?? {};
  const root = document.documentElement;
  const text = a.text ?? 1;
  root.style.setProperty('--ui-scale', String(text));
  // the HUD grows half as much so it never crowds the playfield
  root.style.setProperty('--hud-scale', String(1 + (text - 1) * 0.5));
  const motion = a.motion ?? 'system';
  reduce = motion === 'reduce' || (motion === 'system' && !!media?.matches);
  safe = !!a.colorSafe;
  root.classList.toggle('reduce-motion', reduce);
  root.classList.toggle('color-safe', safe);
}

/** Keep following the device setting while the preference is "system". */
export function watchSystemMotion(get: () => GameState): void {
  media?.addEventListener?.('change', () => applyA11y(get()));
}
