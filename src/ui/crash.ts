import { restoreBackup } from '../game/state';

/**
 * Error boundary. Uncaught errors and rejected promises show an ink recovery panel
 * instead of a frozen screen: carry on, reload, restore the backup save, or copy
 * a report. Noise from the browser itself is ignored.
 */

const IGNORE = [/ResizeObserver loop/, /Script error\.?$/, /extension:\/\//, /The play\(\) request was interrupted/];

let shownAt = 0;
let count = 0;
const recent: string[] = [];

function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}\n${(e.stack ?? '').split('\n').slice(1, 6).join('\n')}`;
  return String(e);
}

export function reportError(e: unknown, where = 'game'): void {
  const text = describe(e);
  if (IGNORE.some((r) => r.test(text))) return;
  count++;
  recent.unshift(`[${where}] ${text}`);
  recent.length = Math.min(recent.length, 5);
  console.error(e);
  // one panel at a time, and not more than every few seconds
  if (document.querySelector('.crash') || Date.now() - shownAt < 4000) return;
  shownAt = Date.now();
  show();
}

function show(): void {
  const root = document.createElement('div');
  root.className = 'crash';
  root.setAttribute('role', 'alertdialog');
  root.innerHTML = `
    <div class="crash-card">
      <div class="crash-seal">乱</div>
      <div class="kicker">The scribes have spilled their ink</div>
      <h2>Something went wrong</h2>
      <p class="muted">Your kingdom is saved. You can carry on, reload the realm, or return to the backup kept a few minutes ago.</p>
      <div class="crash-actions">
        <button class="btn btn-gold" data-c="continue">Carry on</button>
        <button class="btn" data-c="reload">Reload</button>
        <button class="btn" data-c="backup">Restore backup</button>
        <button class="btn btn-sm" data-c="copy">Copy report</button>
      </div>
      <pre class="crash-log"></pre>
    </div>`;
  (root.querySelector('.crash-log') as HTMLElement).textContent = recent.join('\n\n');
  root.addEventListener('click', (ev) => {
    const c = (ev.target as HTMLElement).closest('[data-c]')?.getAttribute('data-c');
    if (c === 'continue') root.remove();
    if (c === 'reload') location.reload();
    if (c === 'backup') {
      if (restoreBackup()) location.reload();
      else (root.querySelector('p') as HTMLElement).textContent = 'No backup is available yet. Reloading usually puts things right.';
    }
    if (c === 'copy') {
      const text = `Realm of Kings error report (${count})\n${navigator.userAgent}\n\n${recent.join('\n\n')}`;
      void navigator.clipboard?.writeText(text);
      (ev.target as HTMLElement).textContent = 'Copied';
    }
  });
  document.body.appendChild(root);
}

export function installCrashGuard(): void {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, 'window'));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'promise'));
}

/** Wrap a per-frame callback so one bad frame never stops the loop. */
export function guarded<T extends unknown[]>(fn: (...a: T) => void, where: string): (...a: T) => void {
  return (...a: T) => {
    try {
      fn(...a);
    } catch (e) {
      reportError(e, where);
    }
  };
}
