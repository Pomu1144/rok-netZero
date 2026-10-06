import { describe, expect, it } from 'vitest';
import strings from '../src/i18n/strings.json';
import es from '../src/i18n/es.json';
import ja from '../src/i18n/ja.json';
import zh from '../src/i18n/zh.json';
import { setDictionary, t } from '../src/i18n';

const count = (s: string) => (s.match(/\{n\}/g) ?? []).length;

describe('translation layer', () => {
  it('translates exact text and text with numbers, keeping whitespace', () => {
    setDictionary({ Claim: 'Reclamar', 'Upgrade City Hall to Lv.{n}': 'Mejora el Ayuntamiento a Nv.{n}', '{n} / {n} helps': '{n} / {n} ayudas' });
    expect(t('Claim')).toBe('Reclamar');
    expect(t('  Claim ')).toBe('  Reclamar ');
    expect(t('Upgrade City Hall to Lv.12')).toBe('Mejora el Ayuntamiento a Nv.12');
    expect(t('3 / 10 helps')).toBe('3 / 10 ayudas');
    expect(t('Something new')).toBe('Something new');
    expect(t('05:12')).toBe('05:12');
    setDictionary(null);
    expect(t('Claim')).toBe('Claim');
  });
});

describe.each([
  ['es', es],
  ['ja', ja],
  ['zh', zh],
] as const)('%s dictionary', (_l, dict: Record<string, string>) => {
  it('covers every string with matching placeholders', () => {
    const missing = (strings as string[]).filter((k) => typeof dict[k] !== 'string' || !dict[k].trim());
    expect(missing).toEqual([]);
    const bad = (strings as string[]).filter((k) => count(k) !== count(dict[k]));
    expect(bad).toEqual([]);
  });
});
