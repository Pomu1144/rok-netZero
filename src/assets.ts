const NAMES = [
  'city_hall', 'barracks', 'archery_range', 'stable', 'siege_workshop', 'farm', 'lumber_mill', 'quarry', 'gold_mine',
  'academy', 'hospital', 'tavern', 'storehouse', 'scout_camp', 'watchtower', 'fountain', 'scaffold',
  'barb_camp', 'barb_fort', 'node_food', 'node_wood', 'node_stone', 'node_gold', 'city_enemy', 'city_player', 'holy_site',
  'mountain', 'forest', 'lake', 'pass', 'march_token',
  'unit_infantry', 'unit_archer', 'unit_cavalry', 'unit_siege', 'unit_barbarian',
  'cmd_caesar', 'cmd_joan', 'cmd_suntzu', 'cmd_boudica', 'cmd_khan', 'cmd_cleopatra',
  'bg_world', 'bg_city', 'parchment',
  'ic_food', 'ic_wood', 'ic_stone', 'ic_gold', 'ic_gems', 'ic_ap', 'ic_speedup', 'ic_power', 'ic_chest', 'ic_tome',
  'ic_key_silver', 'ic_key_gold', 'ic_sculpture', 'ic_build',
  'nav_commanders', 'nav_bag', 'nav_quests', 'nav_mail', 'nav_research', 'nav_map',
] as const;

export type AssetName = (typeof NAMES)[number];

const images = new Map<string, HTMLImageElement>();

export function assetUrl(name: string): string {
  return `${import.meta.env.BASE_URL}assets/${name}.webp`;
}

export function img(name: string): HTMLImageElement | undefined {
  const i = images.get(name);
  return i && i.complete && i.naturalWidth > 0 ? i : undefined;
}

export function loadAssets(onProgress: (p: number) => void): Promise<void> {
  let done = 0;
  return Promise.all(
    NAMES.map(
      (n) =>
        new Promise<void>((resolve) => {
          const i = new Image();
          i.decoding = 'async';
          i.onload = i.onerror = () => {
            done++;
            onProgress(done / NAMES.length);
            resolve();
          };
          i.src = assetUrl(n);
          images.set(n, i);
        }),
    ),
  ).then(() => undefined);
}
