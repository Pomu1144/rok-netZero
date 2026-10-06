import { tick, type GameEvent, type Result } from './logic';
import { Rng } from './rng';
import { loadGame, newGame, saveGame, type GameState } from './state';

type Listener = () => void;
type EventListener = (e: GameEvent) => void;

/** Max offline progress applied on load (in real ms). */
const OFFLINE_CAP_MS = 8 * 3600_000;

export class Game {
  state: GameState;
  rng: Rng;
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  lastReal = performance.now();
  private saveTimer = 0;
  offlineMs = 0;
  /** true when the last offline stretch hit the cap */
  offlineCapped = false;

  constructor() {
    const loaded = loadGame();
    if (loaded) {
      this.state = loaded.state;
      const away = Math.max(0, Date.now() - loaded.savedAt);
      this.offlineMs = Math.min(OFFLINE_CAP_MS, away);
      this.offlineCapped = away > OFFLINE_CAP_MS;
    } else {
      this.state = newGame();
    }
    this.rng = new Rng((Date.now() ^ this.state.seed) >>> 0);
  }

  /** Apply real time that passed while the app was backgrounded (capped like offline time). */
  resumeAfter(realMs: number): GameEvent[] {
    this.lastReal = performance.now();
    this.offlineMs = Math.min(OFFLINE_CAP_MS, Math.max(0, realMs));
    this.offlineCapped = realMs > OFFLINE_CAP_MS;
    const events = this.catchUp();
    if (events.length) {
      this.emitEvents(events);
      this.save();
    }
    return events;
  }

  /** Apply time that passed while the tab was closed. */
  catchUp(): GameEvent[] {
    if (this.offlineMs <= 0) return [];
    const events: GameEvent[] = [];
    let left = this.offlineMs * this.state.speed;
    while (left > 0) {
      const step = Math.min(left, 5000);
      events.push(...tick(this.state, step, this.rng));
      left -= step;
    }
    this.offlineMs = 0;
    return events;
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onEvent(l: EventListener): () => void {
    this.eventListeners.add(l);
    return () => this.eventListeners.delete(l);
  }

  emitChange(): void {
    for (const l of this.listeners) l();
  }

  emitEvents(events: GameEvent[]): void {
    for (const e of events) for (const l of this.eventListeners) l(e);
  }

  /** Run a state-mutating action, then notify. */
  act(fn: (s: GameState) => Result | void): Result {
    const r = fn(this.state) ?? { ok: true as const };
    this.emitChange();
    this.save();
    return r;
  }

  update(): void {
    const now = performance.now();
    // clamp huge gaps (background tabs) to keep the sim stable; catch-up is chunked
    const dtReal = Math.min(now - this.lastReal, 60_000);
    this.lastReal = now;
    let left = dtReal * this.state.speed;
    const events: GameEvent[] = [];
    while (left > 0) {
      const step = Math.min(left, 2000);
      events.push(...tick(this.state, step, this.rng));
      left -= step;
    }
    if (events.length) {
      this.emitEvents(events);
      this.save();
    }
    this.saveTimer += dtReal;
    if (this.saveTimer > 5000) {
      this.saveTimer = 0;
      this.save();
    }
  }

  save(): void {
    saveGame(this.state);
  }

  reset(): void {
    this.state = newGame();
    this.save();
    this.emitChange();
  }
}
