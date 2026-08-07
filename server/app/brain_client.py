"""Talks to jam-station's brain on behalf of a keyring-verified visitor.

Two kinds of calls:
- internal (`/api/internal/*`) — host-gated (`_is_internal` in brain/app/main.py checks
  Host == jam-brain.localhost), used ONCE per member to mint a real jam-station session
  from a verified email. We connect to BRAIN_URL (the docker-network service name) but
  set the Host header explicitly to satisfy that gate — same shape jam-radio's BRAIN_URL
  wire uses to reach the container, just with the internal-only header added on top.
- member calls (`/api/channels`, `/api/library/*`, `/api/favourites*`, ...) — gated by
  jam-station's own session cookie, forwarded like any other jam-station client.

The minted session is cached in memory per email so we don't create a fresh DB session
row on every request — `auth.whoami`'s sliding window keeps one alive indefinitely as
long as someone's actually using it. Single-process only (fine at household scale); a
multi-worker deploy would need this cache moved to something shared.
"""
import httpx

from . import config

_session_cache: dict[str, str] = {}   # email -> brain session cookie value


async def _mint_session(email: str) -> str | None:
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.post(
            f"{config.BRAIN_URL}/api/internal/mint-session",
            json={"email": email},
            headers={"Host": config.BRAIN_INTERNAL_HOST},
        )
    if r.status_code != 200:
        return None
    token = r.json()["cookie_value"]
    _session_cache[email] = token
    return token


async def brain_cookie_for(email: str) -> str | None:
    """A usable jam-station session cookie value for this member, minting one if we
    don't already have it cached. Returns None if they're not an approved jam-station
    member — keyring proved the email, jam-station still decides who's actually in."""
    return _session_cache.get(email) or await _mint_session(email)


async def call(method: str, path: str, email: str, **kwargs) -> httpx.Response:
    """Proxy one call to the brain as this member. Retries once with a freshly minted
    session if the cached one turns out to be stale (revoked membership, expired, or
    the brain restarted and lost its session table — the mint call is idempotent-ish,
    it just creates a new row)."""
    token = await brain_cookie_for(email)
    if token is None:
        raise LookupError(f"{email} is not an approved jam-station member")

    async def _do(tok: str) -> httpx.Response:
        async with httpx.AsyncClient(timeout=15) as client:
            return await client.request(
                method, f"{config.BRAIN_URL}{path}",
                cookies={config.BRAIN_SESSION_COOKIE: tok}, **kwargs,
            )

    r = await _do(token)
    if r.status_code in (401, 403):
        _session_cache.pop(email, None)
        fresh = await _mint_session(email)
        if fresh:
            r = await _do(fresh)
    return r
