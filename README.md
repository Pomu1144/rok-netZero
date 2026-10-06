# Realm of Kings

A browser kingdom-strategy game in the spirit of *Rise of Kingdoms*: build an isometric city, train an army, lead historical commanders and conquer a living world map. All art was generated with **Higgsfield AI** (GPT Image 2.5): 66 painterly sprites, portraits, icons and backgrounds in `public/assets/`.

This is an original game. It borrows the genre's mechanics, not its name, art or assets.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm test         # game-logic unit tests
```

Progress saves to `localStorage`. Offline time (up to 8 h) is applied when you return. In **Settings** (tap your avatar), you can speed the clock up to 60× to see late-game content.

## What's in it

**City**
- Isometric city with walls, a plaza and roads, villagers walking around and drifting clouds.
- 15 building types on 19 plots, from Lv.1 to Lv.25. The City Hall level caps every other building and unlocks new ones.
- Two builder queues.
- Farms, lumber mills, quarries and goldmines fill up over time. Tap the floating bubble to harvest.
- A RoK-style ring menu on each building, with scaffolding and progress timers while it upgrades.

**Military**
- 4 troop types × 5 tiers (I–V). Counter triangle: infantry › cavalry › archers › infantry.
- Training capacity scales with building level, and higher tiers unlock as buildings level up.
- Hospital for severely wounded troops. Casualties beyond hospital capacity die.
- Round-based battle simulation. Commanders build **rage**, and their active skill fires at 1000 rage (damage, heal or rally). Passive skills give bonuses.

**Commanders**
- Six historical figures: Boudica, Sun Tzu, Cleopatra VII, Joan of Arc, Julius Caesar and Batu Khan.
- Each has a level and XP (tomes give XP), a 6-star rating, and four skills upgraded with sculptures.
- Recruit them from Tavern silver and gold chests, or by collecting sculptures.

**World map** (120×120 tiles)
- Barbarians from Lv.1 to Lv.10. You unlock each level by beating the one before it, and attacks cost action points.
- Barbarian forts, resource nodes to gather from, rival AI cities to scout and plunder, and Holy Sites that grant timed kingdom-wide buffs.
- Animated marches you can recall, a march-slot limit, and battle reports with a battle-flow chart.

**Raids**
- From City Hall Lv.4, barbarian warbands attack your city after a 3-minute warning.
- Your walls and garrison defend. The storehouse protects resources from plunder.

**Progression**
- Research: an Economy tree and a Military tree.
- 26 chronicle quests with rewards.
- An items bag (speedups, tomes, keys, resource packs).
- Gem instant-finish, and a free finish for builds under 5 minutes.

## Code layout

| Path | Purpose |
| --- | --- |
| `src/data/` | Balance tables: buildings, troops, commanders, research, items, city layout |
| `src/game/` | Pure game rules (`logic.ts`), battle engine, world generation, quests, save/load |
| `src/render/` | Canvas renderers for the isometric city and the world map, camera, effects |
| `src/ui/` | HUD, modals and panels (DOM) |
| `tests/` | Vitest suite for economy, combat, marches, gathering and progression |

The rules layer has no DOM dependencies and runs on a deterministic, seedable RNG, so the tests can drive it directly.

## Art pipeline

The assets were made with the Higgsfield MCP `generate_image` tool (model `gpt_image_2_5`, high quality, transparent backgrounds for sprites). Every sprite prompt used the same style prefix:

> AAA mobile strategy game building asset, stylized semi-realistic painterly 3D render, isometric 3/4 view from 45 degrees above, single isolated object centered, transparent background, no text …

The raw PNGs were then trimmed and converted to WebP with ImageMagick. The whole asset set is 3.5 MB.
