# DESIGN — profiles (remember visitors, optional "Save me")

**Status: proposed, 2026-09-29.** Not built yet.

## The problem

jam-listen is fully open (see `AGENTS.md`, "How 'free' works"). Every visitor shares one
jam-station member session, so there is no notion of a person: favourites are one shared
household list, and there's no play history, so the app can't show "what you listened to
last". There are also no visitor counts.

Jason wants:

- The app **remembers each visitor automatically** — favourites and recently played —
  with no sign-in required.
- An **optional "Save me"** that keeps a visitor's profile across devices, using
  **keyring** as the sign-in.
- Anyone can use it. No approval step.

## Recommendation

Two stages. Stage 1 is useful on its own and doesn't depend on keyring.

### Stage 1 — anonymous profiles (jam-listen only)

- On the first request without one, the server sets a long-lived, random, httpOnly
  cookie (`jl_profile`, ~1 year, `SameSite=Lax`, `Secure`). The value is an opaque ID;
  it's the whole identity for an anonymous visitor.
- jam-listen gets its own SQLite file (on a slab volume so it survives redeploys):

  ```sql
  profiles(id TEXT PRIMARY KEY, email TEXT UNIQUE, created_at, last_seen_at)
  favourites(profile_id, kind, ref, title, artist, art, added_at,
             PRIMARY KEY (profile_id, kind, ref))
  plays(profile_id, kind, ref, title, artist, art, played_at)
  ```

  `kind` is `channel | album | track | artist`; `ref` is whatever the frontend already
  uses to replay that thing (channel slug, album dir, track URL, artist name).
- **Favourites move off the brain.** `/api/favourites*` stop proxying to the service
  account and read/write jam-listen's own table, scoped to the visitor's profile. The
  existing shared household list is imported once into Jason's profile (stage 2 gives
  that profile his email) — or dropped; see open questions.
- **Recently played**: the frontend `POST /api/plays` when playback actually starts
  (the `playing` event, not on tap — a failed stream shouldn't count). The server keeps
  the last ~200 per profile and dedupes consecutive repeats. Home gets a "Recently
  played" section, above "Recently added".
- **Visitor counts come for free**: profiles created per day, and daily active profiles
  from `last_seen_at`. A `/stats` page shows them; it's behind a secret query key
  (`STATS_KEY` slab secret) since the app itself is open.
- The brain is unchanged. jam-listen still talks to it as the one service member for
  catalog and streams; only the per-person data lives in jam-listen.

### Stage 2 — "Save me" via keyring

- A small "Save me" link (settings / footer, never a gate) redirects to keyring's sign-in
  page with `return=https://jam-listen.runslab.run/auth/return`. This is the same
  identity-only redirect shape jam-listen used before (git history:
  `server/app/keyring_client.py`, removed in `03abec3`; `attic` is keyring's reference).
- On return, the server resolves the `keyring_session` cookie via keyring's
  `GET /api/verify` to an email, then:
  - if no profile has that email → stamp the email onto the current anonymous profile;
  - if another profile already has it (signed in on another device before) → merge the
    current anonymous profile's favourites and plays into that one, delete the
    anonymous one, and point this browser's `jl_profile` cookie at the saved profile.
- Signed-in or not, the `jl_profile` cookie stays the thing requests are keyed on;
  keyring is only consulted at "Save me" time. So keyring being down never breaks
  playback.
- **"Sign out"** clears `jl_profile` on this device (a fresh anonymous profile starts).

**Keyring change required.** Keyring today only signs in approved members; there is no
public signup, on purpose (`keyring/service/app/auth.py`, `/api/login` —
"approved members only"). Stage 2 needs a **per-app open-signup setting**: when the
sign-in starts from an app that has it on (jam-listen only), keyring creates the member
on first successful email verification instead of refusing. Every other suite app
(shoebox, attic, …) keeps approved-members-only. This is a keyring change, made and
documented in the keyring repo.

**The tradeoff.** Anonymous-first means a visitor who never taps "Save me" loses their
profile if they clear cookies or switch devices. In exchange, nobody has to sign in to
get the benefit, which matches "completely open". The alternative — requiring sign-in
to remember anything — would put a gate back in front of an app that was deliberately
made gate-free.

## Options considered

- **Per-device cookie only, no sign-in ever.** Simplest, but no way to carry a profile
  to a second device. Stage 1 alone is this.
- **jam-listen's own name + PIN.** No email or keyring change needed, but no recovery
  for a forgotten PIN and a second identity system in the suite. Rejected in favour of
  keyring.
- **Keyring sign-in required up front.** Rejected: brings back the gate.
- **Per-visitor brain sessions** (mint a jam-station member per visitor, keep favourites
  on the brain). Rejected: it would fill jam-station's member table with strangers and
  change jam-station's access model for a jam-listen feature.

## Open questions

1. **Keyring mail.** Does keyring on the mini actually send email (`MAIL_BACKEND=smtp`
   with SMTP secrets set), or is it still on `console`? Stage 2 is unusable until it
   sends real mail.
2. **Keyring abuse limits.** Open signup lets anyone make keyring send an email to any
   address. Keyring needs per-email and per-IP rate limits on sign-in requests from
   open-signup apps before stage 2 goes live.
3. **The existing shared favourites list.** Import it into Jason's profile, or start
   everyone fresh?
4. **Stats access.** Secret query key is the simplest. Alternative: Jason's keyring
   email as the only allowed `/stats` viewer, once stage 2 exists.
5. **Retention.** Delete anonymous profiles not seen in, say, 6 months?
