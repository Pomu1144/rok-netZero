/**
 * Localisation. Panels are written in English; a translation layer watches the
 * DOM and swaps every text node and labelling attribute for its translation as it
 * appears. Numbers are lifted out first ("Lv.12" matches "Lv.{n}") and put back,
 * so dynamic text translates too. Anything without a translation stays English.
 * Canvas labels call t() directly.
 */

export type Lang = 'en' | 'es' | 'ja' | 'zh';

export const LANGS: { id: Lang; name: string; html: string }[] = [
  { id: 'en', name: 'English', html: 'en' },
  { id: 'es', name: 'Español', html: 'es' },
  { id: 'ja', name: '日本語', html: 'ja' },
  { id: 'zh', name: '简体中文', html: 'zh-Hans' },
];

const loaders: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Record<string, string> }>> = {
  es: () => import('./es.json'),
  ja: () => import('./ja.json'),
  zh: () => import('./zh.json'),
};

const NUM = /\d[\d,.]*[KMB]?/g;
let dict: Record<string, string> | null = null;
let current: Lang = 'en';

/** For tests: use a dictionary directly. */
export function setDictionary(d: Record<string, string> | null): void {
  dict = d;
}

export function lang(): Lang {
  return current;
}

/** The device language if we support it, else English. */
export function deviceLang(): Lang {
  const l = (navigator.language || 'en').toLowerCase();
  if (l.startsWith('es')) return 'es';
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('zh')) return 'zh';
  return 'en';
}

/** Translate one piece of text, keeping its numbers and surrounding whitespace. */
export function t(text: string): string {
  if (!dict || !/[A-Za-z]{2}/.test(text)) return text;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  const core = m[2].replace(/\s+/g, ' ');
  const exact = dict[core];
  if (exact !== undefined) return m[1] + exact + m[3];
  const nums = core.match(NUM);
  if (!nums) return text;
  const tr = dict[core.replace(NUM, '{n}')];
  if (tr === undefined) return text;
  let i = 0;
  return m[1] + tr.replace(/\{n\}/g, () => nums[i++] ?? '') + m[3];
}

const ATTRS = ['aria-label', 'placeholder', 'title'];

function translateNode(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    if (root.parentElement?.closest('[translate=no],input,textarea')) return;
    const v = root.nodeValue ?? '';
    const tr = t(v);
    if (tr !== v) root.nodeValue = tr;
    return;
  }
  if (!(root instanceof Element) || root.closest('script,style,pre,.crash-log,[translate=no]')) return;
  for (const a of ATTRS) {
    const v = root.getAttribute(a);
    if (v) {
      const tr = t(v);
      if (tr !== v) root.setAttribute(a, tr);
    }
  }
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (n.parentElement?.closest('[translate=no]')) continue;
      const v = n.nodeValue ?? '';
      const tr = t(v);
      if (tr !== v) n.nodeValue = tr;
    } else {
      const el = n as Element;
      if (el.matches('script,style,pre,input,textarea') || el.closest('[translate=no]')) continue;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v) {
          const tr = t(v);
          if (tr !== v) el.setAttribute(a, tr);
        }
      }
    }
  }
}

/** Load a language and start translating the page as it renders. */
export async function initI18n(l: Lang): Promise<void> {
  const meta = LANGS.find((x) => x.id === l) ?? LANGS[0];
  current = meta.id;
  document.documentElement.lang = meta.html;
  if (meta.id === 'en') return;
  try {
    dict = (await loaders[meta.id]()).default;
  } catch {
    dict = null;
    return;
  }
  translateNode(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') translateNode(r.target);
      else if (r.type === 'attributes') translateNode(r.target);
      else r.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
