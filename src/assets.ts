const NAMES = [
  // painted world & city sprites
  'city_hall', 'barracks', 'archery_range', 'stable', 'siege_workshop', 'farm', 'lumber_mill', 'quarry', 'gold_mine',
  'academy', 'hospital', 'tavern', 'storehouse', 'scout_camp', 'watchtower', 'fountain', 'scaffold',
  'barb_camp', 'barb_fort', 'node_food', 'node_wood', 'node_stone', 'node_gold', 'city_enemy', 'city_player', 'holy_site',
  'mountain', 'forest', 'lake', 'pass', 'march_token',
  'unit_infantry', 'unit_archer', 'unit_cavalry', 'unit_siege', 'unit_barbarian',
  'cmd_caesar', 'cmd_joan', 'cmd_suntzu', 'cmd_boudica', 'cmd_khan', 'cmd_cleopatra',
  'bg_world', 'tex_cobble', 'tex_dirt',
  'ic_food', 'ic_wood', 'ic_stone', 'ic_gold', 'ic_gems', 'ic_ap', 'ic_speedup', 'ic_power', 'ic_chest', 'ic_tome',
  'ic_key_silver', 'ic_key_gold', 'ic_sculpture',
  // ink kit (sumi-e brushwork)
  'ink/wall_seg', 'ink/ink_mist', 'ink/ink_enso_c', 'ink/ink_enso_gold', 'ink/seal_solid', 'ink/seal_frame',
  'ink/ink_splat_red', 'ink/ink_blot', 'ink/fx_smoke', 'ink/fx_dust', 'ink/fx_leaf', 'ink/birds',
  'ink/i_hammer', 'ink/i_lock', 'ink/i_swords', 'ink/i_spear', 'ink/i_gather', 'ink/kingdom_map',
] as const;

export type AssetName = (typeof NAMES)[number];

/** Upgraded building art for the Lv 10 and Lv 20 tiers. */
const TIERED = ['city_hall', 'watchtower', 'barracks', 'archery_range', 'stable', 'siege_workshop', 'farm', 'lumber_mill', 'quarry', 'gold_mine', 'academy', 'hospital', 'storehouse', 'scout_camp', 'tavern'];
const UNITS = ['infantry', 'archer', 'cavalry', 'siege'].flatMap((t) => [1, 2, 3, 4, 5].map((n) => `unit_${t}_${n}`));
const ALL: string[] = [...NAMES, ...TIERED.flatMap((n) => [`${n}_t2`, `${n}_t3`]), ...UNITS];

const images = new Map<string, HTMLImageElement>();

export function assetUrl(name: string): string {
  return `${import.meta.env.BASE_URL}assets/${name}.webp`;
}

export function img(name: string): HTMLImageElement | undefined {
  const i = images.get(name);
  return i && i.complete && i.naturalWidth > 0 ? i : undefined;
}

function loadOne(n: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = i.onerror = () => resolve();
    i.src = assetUrl(n);
    images.set(n, i);
  });
}

/** Art that only some saves show at once: upgraded building tiers, troop tiers and the kingdom map. */
export function deferrable(name: string): boolean {
  return /_t[23]$/.test(name) || /^unit_[a-z]+_\d$/.test(name) || name === 'ink/kingdom_map';
}

/**
 * Load the art. The returned promise waits only for what the first screen needs
 * (`needed` says which deferrable sprites the current save shows); the rest
 * streams in a few at a time afterwards, and renderers fall back to base art
 * until it lands. Keeps cold start short and decoded texture memory low.
 */
export function loadAssets(onProgress: (p: number) => void, needed: (name: string) => boolean = () => true): Promise<void> {
  const first = ALL.filter((n) => !deferrable(n) || needed(n));
  const later = ALL.filter((n) => !first.includes(n));
  let done = 0;
  return Promise.all(
    first.map((n) =>
      loadOne(n).then(() => {
        done++;
        onProgress(done / first.length);
      }),
    ),
  ).then(() => {
    const next = (): void => {
      const batch = later.splice(0, 4);
      if (batch.length) void Promise.all(batch.map(loadOne)).then(() => setTimeout(next, 30));
    };
    setTimeout(next, 400);
  });
}
