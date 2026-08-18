# AGENTS.md — jam-listen

The minimal, audio-first web client for jam-station. Full rationale, visual direction,
and architecture: [`docs/DESIGN-jam-listen.md`](docs/DESIGN-jam-listen.md) — read that
first for the why; this file is the how.

## What this is

A brand-new, separate client — not a redo of jam-station's `mobile.html` funnel, not
the native Session app. **Completely open — no sign-in, no auth of any kind** (Jason's
call, 2026-08-17: it's public at jam-listen.runslab.run and free for anyone). The UI is
one search box over everything — live stations, the shelf (CDs), the attic — merged
into a single result list; no category pills, no separate browse or artists index.
The server talks to jam-station's brain as ONE fixed member (see below).

Home has THREE switchable layouts (a live A/B, `view:` rail, localStorage): **guide**
(default — program-guide table with per-station now-playing via `/api/dial`, polled
every 30s while mounted), **crates** (station art strip + album cover grid), **list**
(the original flat rows, kept as the control). Search behaves identically in all
three. Once a winner is clear, delete the losers — don't let three layouts calcify.

## Layout

```
src/                  frontend — Vite + vanilla JS, no framework
  main.js             app shell: chassis strip, router wiring, deck, EQ panel
  router.js           hash router — home / album / artist / favourites / playing
  player.js           the audio engine (see design doc — lazy EQ, stall recovery, queue)
  api.js               fetch wrapper for THIS app's own /api/* (never calls the brain directly)
  state.js             tiny global store — plain object + subscribers, no framework
  dom.js               el()/mount() helper — no vdom; views re-render their container wholesale
  views/                home (the one search), album, artist, favourites, playing
  style.css             the receiver-panel design system (tokens at the top)
server/                backend-for-frontend — FastAPI
  app/config.py         BRAIN_URL, SERVICE_EMAIL, cookie name — all env-overridable
  app/brain_client.py   one shared brain session for SERVICE_EMAIL; all visitors ride it
  app/main.py            routes: proxied brain reads/writes, /music /attic /stream relays
docs/DESIGN-jam-listen.md   the design doc — visual system, architecture, non-goals
Dockerfile              multi-stage: build the Vite frontend, then run the FastAPI server
```

## How "free" works

The brain still gates private content (the shelf, the attic, private streams) behind a
member session — jam-station itself is untouched. So this server mints ONE session via
`POST /api/internal/mint-session` for `SERVICE_EMAIL` (default jmimick@gmail.com — must
be an approved jam-station member), caches it in memory, and uses it for every request
from every visitor. Favourites are therefore one shared household list, not per-person.
There used to be per-visitor keyring auth; it was deleted, not disabled — git history
has it if it's ever wanted back.

## Commands

```bash
npm install && npm run dev              # frontend, :5173, proxies /api /music /attic /stream to :8000
cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd server && .venv/bin/uvicorn app.main:app --reload --port 8000

npm run build                           # -> dist/, what the Dockerfile ships
```

No test suite yet — the app is thin enough (a proxy + a UI over jam-station's already-
tested brain API) that this hasn't been worth building. Add one if real bugs show up
here rather than in the brain.

## The one gotcha that bites every time

**`/api/internal/*` calls to the brain need `Host: jam-brain.localhost`, not whatever
address you actually connect to.** The brain's `_is_internal` gate
(`jam-station/brain/app/main.py`) checks the Host header literally, not the source
network — `brain_client.py` connects to `BRAIN_URL` (the docker service name,
`http://jam-brain:8080`, via the system.toml wire) but sets that header explicitly on
internal calls regardless. Forget the header and mint-session 404s with no other clue.

## Deploying

jam-listen is a **member of jam-station's own `system.toml`**, not a standalone slab
app — see the comment there. That's the only way it lands on jam-brain's docker network
and can resolve it by service name (cross-system slab apps can't resolve each other by
name). Checked out as a sibling of jam-station on the deploy host (`~/business/jam-listen`
next to `~/business/jam-station` on the mini). Push here, pull BOTH checkouts on the
mini, then `slab -N jasons-mac-mini deploy jam-listen`. Public URL:
https://jam-listen.runslab.run/
