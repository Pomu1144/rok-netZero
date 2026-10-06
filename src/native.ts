/**
 * Bridge to the native shell (Capacitor). Every call is a no-op on the web,
 * so the same bundle runs in browsers, the iOS app and the Android app.
 */
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar } from '@capacitor/status-bar';
import { SAVE_KEY, setSaveMirror } from './game/state';

export const isNative = Capacitor.isNativePlatform();

/**
 * WKWebView may evict localStorage under storage pressure, so native builds keep the
 * authoritative save in Preferences (UserDefaults / SharedPreferences). Before the game
 * loads we copy the newer of the two into localStorage, then mirror every save back.
 */
export async function initStorage(): Promise<void> {
  if (!isNative) return;
  try {
    const { value } = await Preferences.get({ key: SAVE_KEY });
    const local = localStorage.getItem(SAVE_KEY);
    const at = (raw: string | null) => {
      try {
        return raw ? (JSON.parse(raw) as { savedAt: number }).savedAt : 0;
      } catch {
        return 0;
      }
    };
    if (value && at(value) > at(local)) localStorage.setItem(SAVE_KEY, value);
  } catch {
    /* fall back to localStorage only */
  }
  let pending: string | null = null;
  let timer = 0;
  setSaveMirror((raw) => {
    pending = raw;
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      if (pending) void Preferences.set({ key: SAVE_KEY, value: pending });
      pending = null;
    }, 1500);
  });
}

/** Write a save straight to durable storage (used when restoring a backup). */
export async function persistSave(raw: string): Promise<void> {
  if (!isNative) return;
  await Preferences.set({ key: SAVE_KEY, value: raw }).catch(() => undefined);
}

export async function nativeReady(): Promise<void> {
  if (!isNative) return;
  try {
    await StatusBar.hide();
  } catch {
    /* not available on every platform */
  }
  await SplashScreen.hide({ fadeOutDuration: 400 }).catch(() => undefined);
}

let hapticsOn = true;
export function setHaptics(on: boolean): void {
  hapticsOn = on;
}

export function haptic(kind: 'tap' | 'heavy' | 'success' | 'warning'): void {
  if (!isNative || !hapticsOn) return;
  if (kind === 'tap') void Haptics.impact({ style: ImpactStyle.Light });
  else if (kind === 'heavy') void Haptics.impact({ style: ImpactStyle.Heavy });
  else void Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning });
}

export interface Reminder {
  id: number;
  at: number; // epoch ms
  title: string;
  body: string;
}

let notifyGranted: boolean | null = null;

/** Replace all pending reminders (called whenever the app goes to the background). */
export async function scheduleReminders(list: Reminder[]): Promise<void> {
  if (!isNative) return;
  try {
    if (notifyGranted === null) {
      const p = await LocalNotifications.checkPermissions();
      notifyGranted = p.display === 'granted' || (await LocalNotifications.requestPermissions()).display === 'granted';
    }
    if (!notifyGranted) return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    const now = Date.now();
    const upcoming = list.filter((r) => r.at > now + 5000).slice(0, 32);
    if (!upcoming.length) return;
    await LocalNotifications.schedule({
      notifications: upcoming.map((r) => ({ id: r.id, title: r.title, body: r.body, schedule: { at: new Date(r.at), allowWhileIdle: true } })),
    });
  } catch {
    /* notifications are best-effort */
  }
}

export async function clearReminders(): Promise<void> {
  if (!isNative) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  } catch {
    /* ignore */
  }
}

export function onAppState(onPause: () => void, onResume: () => void, onBack: () => boolean): void {
  if (isNative) {
    void App.addListener('pause', onPause);
    void App.addListener('resume', onResume);
    void App.addListener('backButton', () => {
      if (!onBack()) void App.minimizeApp();
    });
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? onPause() : onResume()));
}

/** Offline support for the web build (native builds bundle everything already). */
export function registerServiceWorker(): void {
  if (isNative || import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
