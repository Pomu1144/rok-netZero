import type { Game } from '../game/game';
import type { Result } from '../game/logic';

/** What panels need from the app shell. */
export interface UiCtx {
  game: Game;
  goWorld: (x?: number, y?: number) => void;
  goCity: (plotId?: string) => void;
  /** run an action; shows an error toast + sound when it fails */
  run: (fn: (s: Game['state']) => Result | void, okSound?: () => void) => boolean;
  openMarch: (targetId: string, kind: 'attack' | 'gather' | 'scout') => void;
  openReport: (reportId: string) => void;
  openPlot: (plotId: string) => void;
}
