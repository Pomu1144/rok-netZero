#!/usr/bin/env node
/**
 * Adds the player-facing strings that live in game data (names, descriptions,
 * stories, quests, honours) to src/i18n/strings.json, so translations cover text
 * the crawler may not reach.   node tools/i18n-data.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent', appType: 'custom' });
const load = (p) => server.ssrLoadModule(p);
const out = new Set();
const add = (v) => {
  if (typeof v === 'string' && /[A-Za-z]{2}/.test(v)) out.add(v.replace(/\d[\d,.]*[KMB]?/g, '{n}').replace(/\{v\}/g, '{n}').replace(/\s+/g, ' ').trim());
};

const b = await load('/src/data/buildings.ts');
for (const d of Object.values(b.BUILDINGS)) (add(d.name), add(d.desc));
const c = await load('/src/data/commanders.ts');
for (const d of c.COMMANDERS) {
  add(d.title);
  d.specialties.forEach(add);
  for (const sk of d.skills) (add(sk.name), add(sk.desc));
}
const tr = await load('/src/data/troops.ts');
Object.values(tr.TROOP_NAMES).flat().forEach(add);
const it = await load('/src/data/items.ts');
for (const d of Object.values(it.ITEMS)) (add(d.name), add(d.desc));
const rs = await load('/src/data/research.ts');
for (const d of rs.TECHS) (add(d.name), add(d.desc));
const q = await load('/src/game/quests.ts');
for (const d of q.QUESTS) add(d.title);
const dl = await load('/src/game/daily.ts');
for (const d of dl.DAILY_TASKS) add(d.title);
const ac = await load('/src/game/achievements.ts');
for (const d of ac.ACHIEVEMENTS) (add(d.name), add(d.desc('{n}', false)), add(d.desc('{n}', true)));
const cp = await load('/src/data/campaign.ts');
for (const d of cp.CHAPTERS) add(d.title);
for (const d of cp.STAGES) (add(d.title), add(d.story), add(d.enemy.name));
const tl = await load('/src/data/talents.ts');
for (const t of [...tl.treesFor('infantry'), ...tl.treesFor('archer'), ...tl.treesFor('cavalry'), ...tl.treesFor('siege'), ...tl.treesFor(undefined)]) {
  add(t.name);
  t.nodes.forEach((n) => add(n.name));
}
Object.values(tl.BONUS_LABEL).forEach(add);
const hn = await load('/src/game/hunt.ts');
hn.RANK_PRIZES.forEach((p) => add(p.label));
await server.close();

const file = new URL('../src/i18n/strings.json', import.meta.url);
const crawled = JSON.parse(readFileSync(file, 'utf8'));
const merged = [...new Set([...crawled, ...out])].sort();
writeFileSync(file, JSON.stringify(merged, null, 1) + '\n');
console.log(`${crawled.length} crawled + ${out.size} from data -> ${merged.length}`);
