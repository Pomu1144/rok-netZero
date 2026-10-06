# Realm of Kings

A browser kingdom-strategy game in the spirit of *Rise of Kingdoms*: build an isometric city, train an army, lead historical commanders and conquer a living world map. All art was generated with **Higgsfield AI**: painterly sprites, portraits and terrain (GPT Image 2.5), a hand-painted sumi-e UI kit, and an animated title loop (Kling 3.0).

The interface uses the **Ink** style from NXBNVNB: charcoal glass panels, hairline gold frames, Cinzel and Kaisei Tokumin type, cream paper-slip buttons, vermilion seals and dry-brush strokes. Every icon is a painted raster brush mark; the UI contains no emoji and no SVG.

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

## Interface and motion

- **Title:** a looping living painting (the king's cape moving over an ink-wash landscape) with drifting gold leaf, ink mist, a brush-drawn title and a stamped seal.
- **City ⇄ world:** an ink blot blooms across the screen and dissolves over the other view.
- **Panels:** sweep open with a brush wipe; the header seal is stamped in; each panel has its own kanji seal (城 city, 将 generals, 学 academy, 戦 march, 書 reports, …).
- **City:** painted roads and cobbles projected onto the isometric ground, tiled stone wall sprites, chimney smoke, builders' dust, a striking hammer over construction, soldiers walking the roads, swallows and drifting mist.
- **Feedback:**
  - Harvested resources fly into the currency strip.
  - A finished upgrade makes the building bounce, sends out a gold ensō shockwave and stamps 昇.
  - Battles on the map flash crossed swords, flick vermilion ink and stamp 勝 or 敗.
  - Toasts arrive as brush bands.

Fonts (Cinzel and Kaisei Tokumin, SIL OFL) are self-hosted and subset in `public/fonts/`.

## Mobile apps

The same bundle ships as native iOS and Android apps through Capacitor (`ios/`, `android/`, app id `com.pomu.realmofkings`). It also installs as an offline web app (`public/manifest.webmanifest`, `public/sw.js`).

- Saves are mirrored into native Preferences, so iOS storage eviction cannot wipe a kingdom. You can also copy a save code from Settings and restore it on another device.
- When the app goes to the background it schedules local reminders (builds, training, research, raids, free chests). On return it applies the time you were away.
- Haptics fire on taps, level-ups, battles and raid warnings, and the layout respects notches and home indicators.
- `npm run ios` / `npm run android` build, sync and open the native IDE.
- `store/README.md` is the step-by-step guide to App Store and Play submission. Listing copy, age rating and privacy answers are in `store/listing.md`, and screenshots are in `store/screenshots/`.
- CI (`.github/workflows/ci.yml`) runs tests and the web build, assembles an Android debug APK, and builds the iOS app for the simulator on every PR.

## Sound

`tools/compose.mjs` writes an original soundtrack and sampled effects to `public/audio/`. It synthesises them from scratch (Karplus-Strong koto, bamboo flute, string pad, taiko, gong, horn, Freeverb reverb) and folds each loop's reverb tail back so the loops are seamless. Run `npm run audio` to re-render.

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

The ink kit followed the style block from NXBNVNB's `tools/ui/INK_ASSET_PROMPTS.md` (black sumi-e brushwork on transparency, vermilion `#b8322a` accents). Icons were then recoloured to warm cream for dark panels. The title loop is a Kling 3.0 image-to-video clip whose first and last frames are the same key art, so it loops seamlessly. It ships as WebM (VP9) with an MP4 fallback.

The raw PNGs were trimmed and converted to WebP with ImageMagick. Art, video and fonts total about 6 MB.
