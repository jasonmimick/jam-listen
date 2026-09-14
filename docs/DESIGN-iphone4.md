# DESIGN — iphone4 (the slim player)

**Status: building (2026-09-14).**

## The problem

Jason has an old **iPhone 4 on iOS 7.1.2** he wants to use as a small dedicated music
device. It reaches jam-station fine over Wi-Fi, but every existing web client is written
for modern browsers: jam-station's `index.html`/`mobile.html` and jam-listen's Vite bundle
all use ES2015+ JS and modern CSS, so on iOS 7 they render blank or broken. Typing long
URLs on the phone is painful. He wants the whole catalog — live stations, the CDs, the
attic — on it.

## What iOS 7 Safari can and can't do (checked, not guessed)

- **TLS is fine.** `jam-station.runslab.run` and `jam-listen.runslab.run` both negotiate
  `ECDHE-ECDSA-AES128-SHA` on TLS 1.2 (an iOS 7 cipher); the cert chain ends at
  GlobalSign Root CA, which iOS 7 trusts.
- **JS is ES5 only.** No `let`/`const`, arrows, template literals, `fetch`, `Promise`.
  `XMLHttpRequest`, `JSON`, `Array.prototype.forEach/filter`, `localStorage` all work.
- **CSS:** no custom properties, flexbox only with `-webkit-` prefixes, no `dvh`. Use
  `display: table` / floats and hard-coded colors.
- **Audio:** `<audio>.play()` must be called inside a tap handler the first time; after
  that the same element can be driven programmatically (auto-advance on `ended`). Mix
  channels therefore fetch their tracklist with a **synchronous** XHR inside the tap.
- **Formats:** mp3, m4a/aac, and the attic's `.wma` (transcoded to mp3 by
  `attic-server.py`) play. flac/ogg/opus won't — the player skips a track on `error`
  (sampled 25 attic albums: 216 wma, 48 m4a, no flac).
- Screen is 320×480.

## Options

1. **A page in jam-station's brain.** Needs its own sign-in UI (the CDs/attic are
   members-only), and grows the mobile web, which jam-station's doctrine says is a
   funnel to not grow.
2. **A page in jam-listen.** jam-listen is already open (no sign-in) and already proxies
   the whole catalog through its service session — `/api/channels`, `/api/dial`,
   `/api/mix`, `/api/library/album(s)`, `/api/attic/albums`, `/music`, `/attic`, `/stream`.
   The page just calls the same routes the Vite app does.

**Recommendation: 2.** Tradeoff: it inherits jam-listen's "fully open" model — no
per-person anything — which is already Jason's call for jam-listen.

## Design

- **One static file**, `server/app/static/iphone4.html`, no build step (the Dockerfile
  already copies `server/app`). Served at **`/iphone4`**, and at **`/`** to any iOS ≤ 9
  user agent.
- **jam-station's `/` redirects iOS ≤ 9 to `https://jam-listen.runslab.run/iphone4`**
  (`SLIM_URL`, env-overridable), so the phone reaches it from the address it already
  knows. `?desktop=1` / `?m=1` still override.
- **Three tabs: LIVE · CDS · ATTIC.**
  - LIVE: on-air stations with now-playing from `/api/dial` (polled every 30 s), then the
    genre shuffles (`query.genre` channels → `/api/mix`).
  - CDS / ATTIC: albums sorted by artist, a search box filtering artist + album, 200 rows
    max rendered (no cover images in lists — memory). Tap → album: cover, play all,
    shuffle, tracks.
- **Pinned transport bar**: title, artist/position, ASCII buttons `|<  >  >|` (Unicode
  ▶ renders as emoji on iOS). Live streams reconnect up to 5 times on error; resuming a
  paused live stream reloads it so it's live, not stale.
- `document.title` = current track, so the lock screen shows it.
- **Look:** jam-listen's terminal palette (`#0a0a0a` / `#d4d0c8` / `#ffb000`),
  monospace, hairline rows — hard-coded since there are no CSS variables.

## Non-goals (v1)

- Favourites, EQ, artist pages, cross-tab search.
- Background auto-advance with the screen locked isn't guaranteed in iOS 7 Safari — a
  native Theos app is the fix if it matters.

## Checklist

- [x] Design doc
- [x] `iphone4.html` (ES5, parses as ecmaVersion 5)
- [x] jam-listen: `/iphone4` route + `/` UA sniff (checked locally with iOS 7 / 17 UAs)
- [x] jam-station: `/` redirect for iOS ≤ 9 + test (103 passed)
- [ ] Deploy both; verify on the phone
