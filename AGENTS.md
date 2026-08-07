# AGENTS.md — jam-listen

The minimal, audio-first web client for jam-station. Full rationale, visual direction,
and architecture: [`docs/DESIGN-jam-listen.md`](docs/DESIGN-jam-listen.md) — read that
first for the why; this file is the how.

## What this is

A brand-new, separate client — not a redo of jam-station's `mobile.html` funnel, not
the native Session app. Signs in via **keyring** (identity-only), talks to
jam-station's existing brain API through a thin backend-for-frontend, and never grows
past what the design doc scopes: play stations, browse/play the on-demand catalog
(library + attic), favourite, EQ, get from a song to its album/artist.

## Layout

```
src/                  frontend — Vite + vanilla JS, no framework
  main.js             app shell: sign-in gate, chassis strip, router wiring, deck, EQ panel
  router.js           hash router — home / browse / album / artist / favourites
  player.js           the audio engine (see design doc — lazy EQ, stall recovery, queue)
  api.js               fetch wrapper for THIS app's own /api/* (never calls the brain directly)
  state.js             tiny global store — plain object + subscribers, no framework
  dom.js               el()/mount() helper — no vdom; views re-render their container wholesale
  views/                home, browse, album, artist, favourites
  style.css             the receiver-panel design system (tokens at the top)
server/                backend-for-frontend — FastAPI
  app/config.py         KEYRING_URL, BRAIN_URL, cookie names — all env-overridable
  app/keyring_client.py identity-only keyring integration (Mode 1 — see keyring's AGENT-INTEGRATION-GUIDE.md)
  app/brain_client.py   mints + caches a real jam-station session per member, proxies calls
  app/main.py            routes: /auth/signin, /api/me, proxied brain reads/writes, /music + /stream relays
docs/DESIGN-jam-listen.md   the design doc — visual system, architecture, non-goals
Dockerfile              multi-stage: build the Vite frontend, then run the FastAPI server
```

## Commands

```bash
npm install && npm run dev              # frontend, :5173, proxies /api /auth /music /stream to :8000
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
name). Assumes this repo is checked out as a sibling of jam-station on the deploy host.
Deploy jam-station's system as usual (`slab -N <node> up path/to/jam-station`); redeploy
just this app with `slab -N <node> deploy jam-listen`.

Keyring registration for login-screen branding (name/logo) is a manual, one-time
suite-admin action — not automated here. See keyring's `docs/AGENT-INTEGRATION-GUIDE.md`
"Getting your first API key" if branding via the app-owned API ever gets wired up.
