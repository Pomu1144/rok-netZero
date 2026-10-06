import { assetUrl } from '../assets';
import type { BuildingType } from '../data/buildings';
import type { SkillDef } from '../data/commanders';

/** Hand-painted sumi-e icons (public/assets/ink/i_*, t_*), cream ink on transparent. */
export type InkIcon =
  | 'i_bag' | 'i_banner' | 'i_bow' | 'i_castle' | 'i_chest' | 'i_crown' | 'i_eye' | 'i_flame' | 'i_gather' | 'i_gear'
  | 'i_hammer' | 'i_heal' | 'i_helmet' | 'i_horse' | 'i_hourglass' | 'i_info' | 'i_lock' | 'i_mail' | 'i_map'
  | 'i_recall' | 'i_research' | 'i_scroll' | 'i_shield' | 'i_spear' | 'i_star' | 'i_swords'
  | 't_anvil' | 't_armor' | 't_cart' | 't_catapult' | 't_coins' | 't_compass' | 't_handsaw' | 't_horn' | 't_irrigation'
  | 't_knight' | 't_masonry' | 't_math' | 't_quarry' | 't_wall' | 't_wheel' | 't_writing';

/** `<img>` for an ink icon. tone: cream (default, for dark panels), dark (on paper), gold, red. */
export function ink(name: InkIcon, size = 18, tone: 'cream' | 'dark' | 'gold' | 'red' = 'cream'): string {
  const cls = tone === 'cream' ? 'ic' : `ic ic-${tone}`;
  return `<img class="${cls}" src="${assetUrl(`ink/${name}`)}" width="${size}" height="${size}" alt="">`;
}

/** A kanji pressed into a vermilion seal; used as a decorative label on panels. */
export const BUILDING_KANJI: Record<BuildingType, string> = {
  city_hall: '城', wall: '壁', barracks: '兵', archery_range: '弓', stable: '馬', siege_workshop: '砦',
  farm: '糧', lumber_mill: '木', quarry: '石', gold_mine: '金', academy: '学', hospital: '医',
  storehouse: '宝', scout_camp: '偵', tavern: '酒',
};

export const BUILDING_ICON: Record<BuildingType, InkIcon> = {
  city_hall: 'i_castle', wall: 't_wall', barracks: 'i_spear', archery_range: 'i_bow', stable: 'i_horse',
  siege_workshop: 't_catapult', farm: 't_irrigation', lumber_mill: 't_handsaw', quarry: 't_quarry',
  gold_mine: 't_coins', academy: 'i_research', hospital: 'i_heal', storehouse: 'i_chest', scout_camp: 'i_eye',
  tavern: 'i_chest',
};

export function skillIcon(skill: SkillDef): InkIcon {
  if (skill.kind === 'active') return skill.effect === 'heal' ? 'i_heal' : skill.effect === 'rally' ? 'i_banner' : 'i_swords';
  switch (skill.bonus) {
    case 'barbDamage': return 'i_flame';
    case 'allHp':
    case 'cavalryHp': return 't_armor';
    case 'marchSpeed':
    case 'cavalryAtk': return 'i_horse';
    case 'infantryDef':
    case 'allDef': return 'i_shield';
    case 'skillDamage': return 'i_star';
    case 'researchSpeed': return 'i_research';
    case 'gatherSpeed': return 'i_gather';
    case 'load': return 't_cart';
    case 'goldProd': return 't_coins';
    case 'allAtk': return 'i_flame';
    case 'healSpeed': return 'i_heal';
    case 'infantryAtk': return 'i_spear';
    case 'troopCapacity': return 'i_banner';
    default: return 'i_star';
  }
}

export function stars(n: number, max = 6): string {
  let s = '';
  for (let i = 0; i < max; i++) s += `<img class="ic ic-gold ${i < n ? '' : 'off'}" src="${assetUrl('ink/i_star')}" alt="">`;
  return `<span class="stars">${s}</span>`;
}

export function pips(n: number, max: number): string {
  let s = '';
  for (let i = 0; i < max; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`;
  return `<span class="pips">${s}</span>`;
}

export function req(ok: boolean, text: string): string {
  return `<div class="req ${ok ? 'ok' : ''}"><img src="${assetUrl(ok ? 'ink/ink_tick' : 'ink/ink_x_c')}" alt="">${text}</div>`;
}
