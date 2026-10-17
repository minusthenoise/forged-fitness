# Forged Fitness: website rough draft

> **Crypto pays you to move.** Fitness-to-earn for `$FIT` (Pump.fun / Solana, contract address `F2voSVvtz2yMEVKFY2EXWuybHt9V8UFPy9RogfBApump`).
> Rough draft: static HTML/CSS/vanilla JS, with **localStorage as a mock backend**. All content, creators, numbers and rewards are **placeholders**. Wallet connect and claims are **simulated**. Not financial advice.

## Run it
```bash
cd "/workspace/projects/Forged Fitness"
python3 -m http.server 8000
# open http://localhost:8000/
```
Use `localhost` (a secure context), not a LAN IP, so SubtleCrypto SHA-256 works. Over a LAN IP the draft falls back to a non-cryptographic hash.

**Demo account:** open `http://localhost:8000/dashboard.html?demo=1` (or click "Try the demo account"). That seeds `demo@forged.fit` / `demo1234` with a bound Fitbit, a 6-day streak, ledger entries and a past payout.
**Reset:** in the browser console run `localStorage.removeItem('forged_fitness_db_v1')`.

No build step and no npm. There are no CDN dependencies: the EXIF parser is vendored in `js/exif.js`.

## Page map
| Page | What it does |
|---|---|
| `index.html` | Landing: looping $FIT ad clip as hero background (`media/forged_fitness_ad_fit.mp4`, still as poster/fallback), the "Crypto pays you to move" pitch, the $FIT contract address with copy button and Pump.fun / DexScreener links, how it works, the live tier, streaks and fixed emission, a community feed, crews, and a CTA |
| `signup.html` | Sign up or log in (`?mode=login`), mocked in localStorage, with a Solana wallet field and a simulated "Connect wallet" |
| `dashboard.html` | Today's and this week's steps, streak plus multiplier, earnings, a daily-cap progress bar, community feed, weekly leaderboard, crews (join/leave), challenges, recent activity, device sync and a manual log |
| `upload.html` | Screenshot upload: real file input, EXIF/PNG metadata read, timestamp vs. activity window, stripped-metadata flag, SHA-256 duplicate check, editor detection, step-rate check, rate limit, a verified/pending/flagged status with reasons, and a mock review queue |
| `devices.html` | Mock connect for Fitbit, Apple Health, Google Fit, Garmin and phone; a device fingerprint ID; one device per account; refusal of devices bound elsewhere; 72 h unbind cooldown; binding history |
| `sessions.html` | Live and upcoming creator sessions (runs and gym), RSVP, join; an in-session view with a mock video, chat, movement stream, random check-ins, quiet-pause and resume, and a bot flag; ends by banking rewards |
| `rewards.html` | Balance, claimable, pending, blocked/capped; wallet; simulated claim; payout tiers; supply controls; emission schedule plus today's remaining pool; full reward ledger with check-in and review actions; payout history |

## Files
```
Forged Fitness/
├── index.html  signup.html  dashboard.html  upload.html  devices.html  sessions.html  rewards.html
├── favicon.svg
├── css/style.css          dark iron + ember-orange theme
├── js/store.js            mock backend + rewards engine (FF_CONFIG holds every placeholder number)
├── js/app.js              nav/footer, auth guard, toasts, live check-in modal
├── js/exif.js             tiny JPEG EXIF / PNG metadata parser (vendored, no deps)
├── js/mock.js             placeholder athletes, feed, crews, challenges, sessions
├── samples/               test images for the upload checks
├── screenshots/           headless render checks
├── VERIFICATION.md        anti-gaming defenses: draft vs. production
├── TOKENOMICS.md          earn pipeline, streaks, emission schedule, daily cap, tiers
└── README.md
```

## Try the defenses
- **Upload** (`samples/`): set the window to **2026-10-17 07:00–08:15** (CT) with 8,412 steps.
  - `good-exif-2026-10-17-0820.jpg` → verified. Upload it again → flagged as a duplicate.
  - `edited-photoshop.jpg` → flagged (editing software).
  - `old-capture-2026-09-01.jpg` → flagged (captured before the activity).
  - `stripped-no-metadata.png` → pending review (no metadata). Use 30,000 steps in 60 min → flagged (impossible rate).
- **Devices**: bind Fitbit, log out, create a second account and try Fitbit → refused. Unbind → 72 h cooldown.
- **Live**: join a live session, then "Simulate going quiet". After 60 s rewards pause; click Resume. "Simulate bot" → flat HR → flagged.
- **Cap**: sync the device repeatedly; past 500 FIT/day entries show `capped`.

## Known gaps (it's a draft)
All verification is client-side and spoofable. There's no real OAuth, wallet adapter, camera liveness, OCR or perceptual hash, and no server. HEIC/WebP metadata isn't parsed. Network activity for the pro-rata pool is simulated. See `VERIFICATION.md` and `TOKENOMICS.md` for what production needs.
