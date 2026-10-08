export type ItemId =
  | 'speed_1m'
  | 'speed_5m'
  | 'speed_15m'
  | 'speed_60m'
  | 'tome_500'
  | 'tome_2000'
  | 'silver_key'
  | 'gold_key'
  | 'food_10k'
  | 'wood_10k'
  | 'stone_5k'
  | 'gold_3k';

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  desc: string;
  kind: 'speedup' | 'tome' | 'key' | 'resource';
  value: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  speed_1m: { id: 'speed_1m', name: '1-Minute Speedup', icon: 'ic_speedup', desc: 'Reduces any timer by 1 minute.', kind: 'speedup', value: 60 },
  speed_5m: { id: 'speed_5m', name: '5-Minute Speedup', icon: 'ic_speedup', desc: 'Reduces any timer by 5 minutes.', kind: 'speedup', value: 300 },
  speed_15m: { id: 'speed_15m', name: '15-Minute Speedup', icon: 'ic_speedup', desc: 'Reduces any timer by 15 minutes.', kind: 'speedup', value: 900 },
  speed_60m: { id: 'speed_60m', name: '60-Minute Speedup', icon: 'ic_speedup', desc: 'Reduces any timer by 60 minutes.', kind: 'speedup', value: 3600 },
  tome_500: { id: 'tome_500', name: 'Tome of Lore', icon: 'ic_tome', desc: 'Grants 500 XP to a commander.', kind: 'tome', value: 500 },
  tome_2000: { id: 'tome_2000', name: 'Grand Tome', icon: 'ic_tome', desc: 'Grants 2,000 XP to a commander.', kind: 'tome', value: 2000 },
  silver_key: { id: 'silver_key', name: 'Bronze Key', icon: 'ic_key_silver', desc: 'Opens a Bronze Coffer in the Tavern.', kind: 'key', value: 1 },
  gold_key: { id: 'gold_key', name: 'Jade Key', icon: 'ic_key_gold', desc: 'Opens a Jade Coffer in the Tavern.', kind: 'key', value: 1 },
  food_10k: { id: 'food_10k', name: '10K Food', icon: 'ic_food', desc: 'Adds 10,000 food.', kind: 'resource', value: 10000 },
  wood_10k: { id: 'wood_10k', name: '10K Wood', icon: 'ic_wood', desc: 'Adds 10,000 wood.', kind: 'resource', value: 10000 },
  stone_5k: { id: 'stone_5k', name: '5K Stone', icon: 'ic_stone', desc: 'Adds 5,000 stone.', kind: 'resource', value: 5000 },
  gold_3k: { id: 'gold_3k', name: '3K Gold', icon: 'ic_gold', desc: 'Adds 3,000 gold.', kind: 'resource', value: 3000 },
};

export const RESOURCE_ITEM_KEY: Partial<Record<ItemId, 'food' | 'wood' | 'stone' | 'gold'>> = {
  food_10k: 'food',
  wood_10k: 'wood',
  stone_5k: 'stone',
  gold_3k: 'gold',
};
