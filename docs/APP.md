# Shipping WhereHePlay as a phone app

Researched 2026-11-11. Fees and store rules change — re-check the linked
official pages before paying for anything. Nothing here is built yet; the
website was built so that this is a packaging job, not a rewrite.

## The short version

| Route                         | Cost       | Effort               | Result                                                         |
| ----------------------------- | ---------- | -------------------- | -------------------------------------------------------------- |
| **Installable web app (PWA)** | $0         | hours                | Home-screen icon, full screen, both phones. Not in the stores. |
| **Android app (Google Play)** | $25 once   | days + a 14-day test | In the Play Store                                              |
| **iPhone app (App Store)**    | $99 / year | days + review        | In the App Store                                               |
| iPhone, own device only       | $0         | hour                 | Sideloaded from Xcode; expires every 7 days                    |

The stores are the only part of this project that cannot be free.

## What is already app-ready

- A static single-page app with no server rendering — exactly what a native
  shell wraps.
- `VITE_BASE=./ npm run build` produces a bundle that loads from local files.
- The API already allows the native shells' origins (`capacitor://localhost`,
  `https://localhost`) and uses bearer tokens in request bodies, not cookies,
  so sign-in works inside a webview.
- Layout is phone-first, respects the notch (safe-area insets), 44 px touch
  targets, 16 px inputs (no iOS zoom-on-focus).
- A web manifest, so "Add to Home Screen" already gives a full-screen app.

## Route 1 — PWA (do this first, it is free)

Already mostly there. To finish: real icons (192/512 px PNG + a maskable
one, and an Apple touch icon) and optionally a service worker for offline
launch (`vite-plugin-pwa`). On iPhone, Home Screen web apps get standalone
display and, since iOS 16.4, web push (only when opened from the icon).
Users install it from the browser's share menu — there is no store listing.

## Route 2 — Native shells with Capacitor

[Capacitor](https://capacitorjs.com/) (v8 is current; needs Node 22+ and
Xcode 26+) wraps the built site in a real iOS and Android project.

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init WhereHePlay com.spicyal.whereheplay --web-dir dist
VITE_BASE=./ VITE_API_ENDPOINT=https://… npm run build
npx cap add ios && npx cap add android
npx cap sync
npx cap open ios        # Xcode → run on a simulator or your phone
npx cap open android    # Android Studio
```

`ios/` and `android/` are already gitignored; decide then whether to commit
them (most projects do).

### iPhone

- **Apple Developer Program: $99/year**, individuals can enrol. Required for
  TestFlight and the App Store.
- **Free alternative for just your own phone:** a free Apple ID can install
  from Xcode onto your own device; the build stops launching after 7 days
  and must be re-installed.
- **Review risk — Guideline 4.2 (minimum functionality):** Apple rejects
  apps that are only a website in a wrapper. Plan on at least one native
  touch: a daily-puzzle local notification, haptics on right/wrong, the
  native share sheet, offline launch.
- Needs a privacy policy URL and the App Privacy questionnaire (the app
  stores a display name and optional username; no tracking).

### Android

- **Google Play: $25 once.**
- **New personal accounts must run a closed test with at least 12 testers
  opted in for 14 continuous days** before they can apply for production.
  Line up 12 friends with Android phones first.
- Alternative shell: a Trusted Web Activity (Bubblewrap / PWABuilder) wraps
  the PWA with no Capacitor code at all. It needs a real domain (for the
  Digital Asset Links file), so buy the domain first.

## Photos — the real blocker

The website hotlinks official league headshots (and, for a few players the
leagues and ESPN lack, portraits on Basketball-Reference and
Pro-Football-Reference), and for players with no free playing photo, game
photos from TheSportsDB, ESPN, NFL.com and NBA.com. That is a tolerable risk for
a free hobby site; it is **not** acceptable for a store submission. Apple's
guideline 5.2 requires that you own or have licensed the content, and
athlete photos carry both the photographer's copyright and the player's
publicity rights. A store build must use one of:

1. **Wikimedia Commons photos only** (freely licensed, attribution shown —
   the game already supports this as the "in uniform" photo and credits each
   one). Coverage: about 1,100 of 2,021 players have one today (photos in college gear, and photos that do not show him playing for a pro team, are screened out); quality
   varies and a few show the college uniform.
2. **No photos** — start at the name, with a three-stage ladder.
3. A licensed image source (not free).

The data model already separates the two photo sources per player, so option
1 is a build flag away, not a redesign. Team and league logos and names are
trademarks; the game uses none and should keep it that way.

## Suggested order

1. Finish the PWA (icons, offline) — $0, benefits everyone.
2. Buy the domain; move the site to it.
3. Photo cleanup pass so a Commons-only build is good.
4. Android first (cheap, one-time), recruiting the 12 testers early.
5. iPhone when the $99/year is worth it; add the native touches for review.
