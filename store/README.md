# Shipping Realm of Kings

Everything needed to publish is in this folder, except accounts and signing, which only the owner can provide.

| What | Where |
| --- | --- |
| App icon (1024, no alpha) | `store/art/app_store_icon_1024.png` |
| Play icon and feature graphic | `store/art/play_icon_512.png`, `store/art/play_feature_graphic.png` |
| Screenshots | `store/screenshots/<device>/` (regenerate with `npm run build && npm run screenshots`) |
| Listing copy, keywords, age rating, privacy answers | `store/listing.md` |
| Privacy policy page | `public/privacy.html` (served at `/privacy.html` with the web build) |

Screenshot sizes: iPhone 6.9" 2868×1320, iPhone 6.5" 2688×1242, iPad 13" 2752×2064, Android phone 2400×1080 (all landscape).

## iOS (App Store)

1. Join the Apple Developer Program and create an app record in App Store Connect with bundle id `com.pomu.realmofkings`.
2. `npm ci && npm run ios`. This builds the web bundle, syncs it into `ios/` and opens Xcode.
3. In Xcode select the **App** target › Signing & Capabilities, choose your team. Bump **Version** (1.0.0) and **Build** for each upload.
4. Product › Archive, then Distribute App › App Store Connect.
5. In App Store Connect fill in the listing from `store/listing.md`, upload the screenshots, answer App Privacy with "Data Not Collected", set the age rating, and submit for review.

## Android (Google Play)

1. Create the app in Play Console with package `com.pomu.realmofkings`.
2. Create an upload keystore (`keytool -genkey -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`). Keep it out of git.
3. `npm ci && npm run android`, then in Android Studio: Build › Generate Signed Bundle (AAB) with the keystore.
4. Upload the AAB to an internal testing track first, fill in the store listing and Data safety (no data collected), then promote to production.

## Every release

- `npm test && npm run build` must pass (CI runs this plus an Android APK and an iOS simulator build on every PR).
- Regenerate icons after changing `resources/` with `npm run assets`, and the soundtrack with `npm run audio`.
