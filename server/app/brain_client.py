"""Talks to jam-station's brain as ONE fixed member (config.SERVICE_EMAIL).

jam-listen has no sign-in of its own — every visitor shares this single brain session.
Two kinds of calls:
- internal (`/api/internal/mint-session`) — host-gated (`_is_internal` in
  brain/app/main.py checks Host == jam-brain.localhost), used to mint the session. We
  connect to BRAIN_URL (the docker-network service name) but set the Host header
  explicitly to satisfy that gate.
- member calls (everything else) — carry the minted session cookie like any other
  jam-station client.

The session is cached in memory; `auth.whoami`'s sliding window keeps it alive as long
as anyone's listening. Single-process only (fine at this scale).
"""
import httpx

from . import config

_token: str | None = None


async def _mint() -> str | None:
    global _token
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.post(
            f"{config.BRAIN_URL}/api/internal/mint-session",
            json={"email": config.SERVICE_EMAIL},
            headers={"Host": config.BRAIN_INTERNAL_HOST},
        )
    if r.status_code != 200:
        return None
    _token = r.json()["cookie_value"]
    return _token


async def cookie() -> str | None:
    """The shared brain session cookie value, minting one if we don't have it yet.
    None means the service email isn't an approved jam-station member — a deploy-time
    misconfiguration, not a visitor-level state."""
    return _token or await _mint()


async def call(method: str, path: str, **kwargs) -> httpx.Response:
    """Proxy one call to the brain. Retries once with a freshly minted session if the
    cached one turns out to be stale (expired, or the brain restarted and lost its
    session table)."""
    global _token
    token = await cookie()
    if token is None:
        raise LookupError(f"{config.SERVICE_EMAIL} is not an approved jam-station member")

    async def _do(tok: str) -> httpx.Response:
        async with httpx.AsyncClient(timeout=15) as client:
            return await client.request(
                method, f"{config.BRAIN_URL}{path}",
                cookies={config.BRAIN_SESSION_COOKIE: tok}, **kwargs,
            )

    r = await _do(token)
    if r.status_code in (401, 403):
        _token = None
        fresh = await _mint()
        if fresh:
            r = await _do(fresh)
    return r
