# Realm of Kings: road to the App Store

Everything lands in one pull request ([Pomu1144/rok-netZero#1](https://github.com/Pomu1144/rok-netZero/pull/1)). An hourly routine picks the next unchecked items, builds them, ticks them off here and pushes to the same branch.

Legend: `[x]` done · `[ ]` to do · **(you)** needs the owner (accounts, signing, legal).

## Phase 1: ship foundation

- [x] Native shells with Capacitor (iOS + Android), app id `com.pomu.realmofkings`, bundled offline
- [x] App icon (1024 master + every size) and launch screen, generated with Higgsfield
- [x] Notch and home-indicator safe areas, `viewport-fit=cover`, no rubber-band scroll or double-tap zoom
- [x] Durable saves on device (Capacitor Preferences), with localStorage fallback and save export/import
- [x] Original soundtrack and sound effects: city and world themes, battle, victory and defeat stings, twelve sampled effects; music, sound and vibration toggles (composed in code by `tools/compose.mjs`, because Higgsfield's music and SFX models are limited to its own game pipeline)
- [x] PWA manifest and service worker so the web build installs and plays offline
- [x] CI: typecheck, tests and web build; iOS simulator build on macOS; Android debug APK
- [x] Store kit in `store/`: privacy policy, App Store and Play listing copy, keywords, age rating answers
- [x] Screenshot generator: Playwright captures at 6.9", 6.5" and 13" iPad sizes

## Phase 2: first session and retention

- [x] Guided first-time tutorial: pointing hand and spotlight through the first 10 actions
- [x] Seven-day login reward calendar
- [x] Daily tasks with an activity chest
- [x] Local notifications: build complete, training complete, raid incoming, free chest ready
- [x] Achievements panel
- [x] Offline-earnings summary screen on return

## Phase 3: depth

- [x] Buildings change appearance at level tiers (Lv 1–9, 10–19, 20–25), new Higgsfield art
- [x] Distinct art for every troop tier
- [x] Commander talent trees
- [x] Battle scene: animated clash view with skill cut-ins
- [x] AI alliance: help speedups, gifts, alliance chat flavour
- [x] Barbarian hunt event with leaderboard against AI governors
- [x] Campaign mode: twelve story stages with hand-built enemy armies
- [x] Kingdom map zoom-out view with strategic icons

## Phase 4: polish and compliance

- [x] Haptics on key actions
- [x] Accessibility: text scale, reduced motion, colour-blind safe markers
- [x] Localisation: English, Spanish, Japanese, Simplified Chinese
- [x] Performance budget: 60 fps on iPhone 11, texture memory under 300 MB, cold start under 3 s (measured at iPhone 11 size in headless Chromium with `npm run perf`; art budget enforced by `tests/budget.test.ts`)
- [x] Crash safety: save versioning and migrations, error boundary with recovery
- [ ] Final store screenshots and preview video

## Owner tasks **(you)**

- [ ] Apple Developer Program membership and an App Store Connect app record
- [ ] Google Play Console account
- [ ] Signing certificates and provisioning profiles (or a Fastlane match repo)
- [ ] Final app name check and trademark clearance
- [ ] Host the privacy policy at a public URL (GitHub Pages works)
- [ ] Play a TestFlight build on a real iPhone 11 to confirm the frame rate on the device
