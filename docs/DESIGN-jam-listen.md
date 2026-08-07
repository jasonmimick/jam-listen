# DESIGN — jam-listen

**Status: built.** This doc captures the decisions made building it, for the next person
(human or agent) who touches this repo — not a pre-build proposal.

## The problem

jam-station's existing web clients (`index.html`, `mobile.html`) follow house doctrine:
"mobile web is a funnel, not an app — don't grow it." Jason wants something that doctrine
explicitly doesn't cover: a real, minimal, audio-first client, reliable enough to actually
use day to day, that works as a phone app first. Not a redo of `mobile.html` — a new,
separate thing, with its own visual identity and its own deployment.

Stated priority, verbatim: **best audio quality and connection possible, that just always
works.** Everything else — browsing, favourites, EQ — is real but secondary to that.

## Requirements (from Jason directly)

- Sign in via **keyring**, the shared suite identity service.
- New deployment on slab, own URL.
- Open to a build step/framework — not bound to the rest of jam-station's no-build-step
  vanilla convention.
- Totally new visual design — no carryover of the signage-yellow identity.
- Features: all stations; play any track, album, or artist; favourite; EQ; from any
  song, get to its album/artist; top-level categories; sort/filter.
- Thumbnails, not big icon tiles — has to work well as an actual phone screen, thumbed
  through one-handed, not a desktop grid shrunk down.

## Visual direction

**v2 (current), 2026-08-07.** A terminal, not a device panel. v1 (below, for the
record) was a receiver-front-panel look — rounded chassis cards, LED gradients,
padded tiles. Jason used the real, deployed app and rejected it outright: "UX stinks,
I do not like at all... I want minimalist, like terminal — clean design — not round
corners and padding everything." That's not a tweak, it's a different visual world:

- **Zero border-radius, anywhere** (`* { border-radius: 0 !important }`) — no rounded
  cards, buttons, or thumbnails.
- **No panel/card backgrounds or shadows.** Hierarchy comes from 1px hairline borders
  (`--line` / `--line-2`) between rows, not background color blocks.
- **Monospace everywhere**, not just numbers — the whole UI reads like a terminal, not
  just its digit columns. Still no custom webfont (`ui-monospace`/SF Mono/Menlo).
- **Minimal padding** — tight row heights (~7px vertical), no generous card interiors.
- **Terminal-native punctuation as UI chrome**: `[ Home ]` tab brackets, `# Section`
  headers, `~ Artist` prefixes, `cd ..` for back, `> ` before empty-state text and the
  sign-in button. Cheap, on-theme structure instead of icons.
- **Color** (dark, default): background `#0A0A0A`, hairlines `#2A2A2A`/`#1A1A1A`, text
  `#D4D0C8`, dim `#6B6B6B`, accent `#FFB000` — amber, on purpose: an amber-phosphor CRT
  terminal is as "terminal" as green-on-black, and it's a smaller jump from v1's amber
  than a hue change would've been. Light theme: paper `#FAFAF8` background, same accent
  family darkened for contrast.
- **EQ fader**: a flat single-color fill bar (height = gain), not the v1 LED gradient —
  still the one place a value is visualized directly, still opt-in Web Audio only.

v1, for the record (2026-08-06, approved via mockup, shipped, then rejected after real
use): a receiver front panel — LED peak meters, a monospace digital readout, thumbnail
rows already present then too. The mockup-first process caught the wrong thing (thumbnails
vs. tiles) and missed the bigger one (the whole panel/card/rounded-corner language) —
worth remembering next time a mockup gets approved: approval of screens isn't the same
as approval of using it.

**Layout** (unchanged from v1): thumbnail rows, never a tile grid — scans one-handed on
a phone, artist/album text gets the space instead of artwork.

**Live vs. on-demand**: the small blinking dot next to the wordmark is a plain "on air"
indicator, not an audio-reactive meter — a real level meter would need the Web Audio
graph running by default, which breaks the reliability rule below. The reward for
opening the EQ is getting a real one.

## Architecture

**Frontend**: Vite + vanilla JS, no component framework. The app's whole surface is
small (station list, on-demand catalog, a player) and the stated priority is
reliability/perf over feature velocity — least JS shipped, fastest to "audio is
playing."

**Audio engine** (`src/player.js`): a plain `<audio>` element plays by default. The Web
Audio graph (`createMediaElementSource` + `BiquadFilter` bands) is built **lazily**,
only when the EQ panel opens — lifted directly from the proven pattern in jam-station's
own `static/index.html` (~1170, 1338-1420): iOS suspends Web-Audio-routed playback on
lock, so staying off that graph by default is what makes lock-screen/AirPods playback
reliable. Stall/drop recovery watches `waiting`/`stalled`/`error` and reloads the
stream with backoff. `MediaSession` wires lock-screen transport regardless of EQ state.
Track/artist/album playback shares the same engine via a queue (`playQueue`) — tapping
any track in an album plays it and auto-advances; "play this artist" shuffles their
library + attic tracks into the same queue.

**Auth — keyring, identity-only (Mode 1)**: `attic` is the reference implementation
(`keyring/docs/AGENT-INTEGRATION-GUIDE.md`). jam-station already has its own
member/approval model (`brain/app/auth.py`); keyring's only job is proving the email is
real. No RBAC registration in keyring — that would just duplicate `auth.py`.

**Bridging keyring → jam-station's existing member-scoped API**: `server/app/main.py`
is a thin backend-for-frontend. It never exposes the brain's URL or cookie to the
browser:
1. Visitor hits jam-listen with no keyring session → redirect to keyring
   (`keyring_client.signin_url()`).
2. Keyring sets its cookie (domain `.runslab.run`) and redirects back.
3. On each request, `server/app/main.py` resolves that cookie via keyring's
   `GET /api/verify` (`keyring_client.whoami`).
4. `server/app/brain_client.py` exchanges the verified email for a real jam-station
   session by calling the brain's `POST /api/internal/mint-session` — a small,
   additive endpoint on the brain (`brain/app/main.py`), gated the same way as the
   pre-existing `/api/internal/member-by-email` (host-only: `Host: jam-brain.localhost`).
   The minted session is cached in memory per email (single-process; a multi-worker
   deploy would need this moved to something shared) so we're not creating a fresh DB
   session row on every request.
5. Every proxied call (`/api/channels`, `/api/library/*`, `/api/attic/*`,
   `/api/favourites*`, `/music/*`, `/stream/*`) forwards that session cookie to the
   brain server-side and relays the JSON/stream back.

**Data**: no new catalog backend. `/api/channels`, `/api/library/albums` +
`/api/library/album`, `/api/attic/albums` + `/api/attic/artist`, `/api/favourites*`
already cover everything requested. The frontend fetches channels + both album lists
once at boot and does search/sort/filter/artist-grouping client-side over that cache —
catalogs are small enough (a personal/family record collection) that this is simpler
and faster than round-tripping a bespoke query API.

## Non-goals

- No genre/section browsing in v1 (the brain has `/api/library/genres`, unused here) —
  the "top-level categories" requirement is met by Home's All/Live/CDs/Attic rail, not
  a full genre taxonomy. Add if it turns out to be missed.
- No offline/service-worker caching — reliability here means the *stream* recovers, not
  that the app works with no network at all.
- No duration column on track rows — the brain's track metadata doesn't include
  duration (`adapters/library.py`'s `_meta()` never computes it), so showing one would
  mean fabricating data. Add if duration ever gets computed server-side.

## Open / deferred

- **Deployment topology**: `system.toml` wires jam-listen into jam-station's own system
  (see the comment there) so it shares jam-brain's docker network — cross-system slab
  apps can't resolve each other by name. This assumes jam-listen is checked out as a
  sibling directory on the deploy host; verify/adjust on first real deploy.
- **Keyring registration**: identity-only mode doesn't require it, but branding
  (name/logo on keyring's sign-in page) does — a suite-admin action Jason needs to take
  once keyring is reachable with his session.
