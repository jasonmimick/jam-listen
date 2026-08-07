"""Keyring identity-only integration — Mode 1 from keyring/docs/AGENT-INTEGRATION-GUIDE.md.
`attic` is the reference: no RBAC registration, just "is this a valid signed-in suite
member." jam-station's own member table decides who's actually allowed in.
"""
from urllib.parse import quote

import httpx

from . import config


async def whoami(cookie: str | None) -> dict | None:
    """Resolve a keyring session cookie to {email, name, ...}. None means signed out —
    that's a normal state, not an error."""
    if not cookie:
        return None
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(f"{config.KEYRING_URL}/api/verify",
                              cookies={config.KEYRING_COOKIE: cookie})
    return r.json() if r.status_code == 200 else None


def signin_url() -> str:
    return (f"{config.KEYRING_URL}/?return={quote(config.PUBLIC_URL)}"
            f"&app={quote(config.APP_SLUG)}")
