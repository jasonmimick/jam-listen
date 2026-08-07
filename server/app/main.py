import os

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import brain_client, config, keyring_client

app = FastAPI()


async def _email(request: Request) -> str | None:
    who = await keyring_client.whoami(request.cookies.get(config.KEYRING_COOKIE))
    return who["email"] if who else None


@app.get("/auth/signin")
async def auth_signin():
    return RedirectResponse(keyring_client.signin_url())


@app.get("/stations/{path:path}")
async def proxy_station_art(path: str):
    """Channel art (index.html calls this /stations/<slug>.jpg). Public on the brain —
    no session needed, same here."""
    import httpx
    client = httpx.AsyncClient(timeout=10)
    req = client.build_request("GET", f"{config.BRAIN_URL}/stations/{path}")
    upstream = await client.send(req, stream=True)
    return _stream_response(upstream, client)


@app.get("/api/me")
async def api_me(request: Request):
    """Anonymous is a normal answer, not an error — mirrors the brain's own /api/me. A
    keyring-verified visitor who isn't an approved jam-station member is ALSO not an
    error (same spirit) — just a different reason, so the gate can say why instead of
    looking like sign-in silently failed."""
    email = await _email(request)
    if not email:
        return {"user": None}
    try:
        r = await brain_client.call("GET", "/api/me", email)
    except LookupError:
        return {"user": None, "reason": "not_a_member", "email": email}
    return r.json() if r.status_code == 200 else {"user": None}


def _require_email(request: Request):
    async def dep():
        email = await _email(request)
        if not email:
            raise HTTPException(401, "sign in required")
        return email
    return dep


# ---------------------------------------------------------------- proxied brain reads

_PROXY_GET = [
    "/api/channels",
    "/api/library/albums",
    "/api/library/genres",
    "/api/attic/albums",
    "/api/attic/stats",
    "/api/favourites",
]


def _register_proxy_get(path: str):
    @app.get(path, name=f"proxy_get_{path}")
    async def _proxied(request: Request):
        email = await _email(request)
        if not email:
            raise HTTPException(401, "sign in required")
        try:
            r = await brain_client.call("GET", path, email, params=dict(request.query_params))
        except LookupError:
            raise HTTPException(403, "not an approved jam-station member")
        return JSONResponse(r.json(), status_code=r.status_code)


for _p in _PROXY_GET:
    _register_proxy_get(_p)


@app.get("/api/library/album")
async def api_library_album(dir: str, request: Request):
    email = await _email(request)
    if not email:
        raise HTTPException(401, "sign in required")
    try:
        r = await brain_client.call("GET", "/api/library/album", email, params={"dir": dir})
    except LookupError:
        raise HTTPException(403, "not an approved jam-station member")
    return JSONResponse(r.json(), status_code=r.status_code)


@app.get("/api/attic/artist")
async def api_attic_artist(request: Request, name: str = "", artist: str = ""):
    email = await _email(request)
    if not email:
        raise HTTPException(401, "sign in required")
    try:
        r = await brain_client.call("GET", "/api/attic/artist", email,
                                     params=dict(request.query_params))
    except LookupError:
        raise HTTPException(403, "not an approved jam-station member")
    return JSONResponse(r.json(), status_code=r.status_code)


# ---------------------------------------------------------------- favourites (writes)

@app.post("/api/favourites/add")
async def api_fav_add(request: Request):
    email = await _email(request)
    if not email:
        raise HTTPException(401, "sign in required")
    body = await request.json()
    try:
        r = await brain_client.call("POST", "/api/favourites/add", email, json=body)
    except LookupError:
        raise HTTPException(403, "not an approved jam-station member")
    return JSONResponse(r.json(), status_code=r.status_code)


@app.post("/api/favourites/remove")
async def api_fav_remove(request: Request):
    email = await _email(request)
    if not email:
        raise HTTPException(401, "sign in required")
    body = await request.json()
    try:
        r = await brain_client.call("POST", "/api/favourites/remove", email, json=body)
    except LookupError:
        raise HTTPException(403, "not an approved jam-station member")
    return JSONResponse(r.json(), status_code=r.status_code)


# ---------------------------------------------------------------- audio + art passthrough

@app.get("/api/attic/cover")
async def proxy_attic_cover(request: Request, artist: str, album: str):
    """Attic album art. Unlike library covers (plain files under /music, proxied below),
    the brain resolves these lazily per-request and needs the query params forwarded,
    not just a path — so it gets its own route rather than falling under /music."""
    email = await _email(request)
    if not email:
        raise HTTPException(401, "sign in required")
    token = await brain_client.brain_cookie_for(email)
    if not token:
        raise HTTPException(403, "not an approved jam-station member")
    import httpx
    client = httpx.AsyncClient(timeout=15)
    req = client.build_request("GET", f"{config.BRAIN_URL}/api/attic/cover",
                                params={"artist": artist, "album": album},
                                cookies={config.BRAIN_SESSION_COOKIE: token})
    upstream = await client.send(req, stream=True)
    return _stream_response(upstream, client)


async def _proxy_brain_track(base: str, path: str, request: Request):
    """Stream a track (library /music or vault /attic) through us so the browser only
    ever talks to jam-listen. Forwards Range so scrubbing/seeking actually seeks instead
    of re-downloading the whole file — the brain's own routes honour it (FileResponse for
    /music, an explicit passthrough for /attic)."""
    email = await _email(request)
    if not email:
        raise HTTPException(401, "sign in required")
    token = await brain_client.brain_cookie_for(email)
    if not token:
        raise HTTPException(403, "not an approved jam-station member")
    import httpx
    client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=None))
    headers = {}
    if request.headers.get("range"):
        headers["range"] = request.headers["range"]
    req = client.build_request("GET", f"{config.BRAIN_URL}{base}/{path}",
                                cookies={config.BRAIN_SESSION_COOKIE: token}, headers=headers)
    upstream = await client.send(req, stream=True)
    return _stream_response(upstream, client)


@app.get("/music/{path:path}")
async def proxy_music(path: str, request: Request):
    return await _proxy_brain_track("/music", path, request)


@app.get("/attic/{path:path}")
async def proxy_attic_file(path: str, request: Request):
    """The vault's audio — a different route than /music entirely (the brain proxies it
    one hop further, to attic-server.py on the host). Attic tracks were 404ing through
    jam-listen because only /music was ever proxied — this was the 'next song won't
    play' bug."""
    return await _proxy_brain_track("/attic", path, request)


@app.get("/stream/{slug}")
async def proxy_stream(slug: str, request: Request):
    """Live icecast relay. Private channels need the brain's cookie (it 403s without one);
    public channels don't, but routing everything through here keeps the brain's URL out of
    the browser either way — one less thing pointing at internal infrastructure."""
    email = await _email(request)
    token = await brain_client.brain_cookie_for(email) if email else None
    import httpx
    client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=None))
    cookies = {config.BRAIN_SESSION_COOKIE: token} if token else {}
    req = client.build_request("GET", f"{config.BRAIN_URL}/stream/{slug}", cookies=cookies)
    upstream = await client.send(req, stream=True)
    return _stream_response(upstream, client)


def _stream_response(upstream, client):
    from starlette.background import BackgroundTask
    from starlette.responses import StreamingResponse

    async def body():
        async for chunk in upstream.aiter_bytes():
            yield chunk

    async def cleanup():
        await upstream.aclose()
        await client.aclose()

    # cache-control/etag/last-modified matter a lot here: cover art is served with
    # Cache-Control: public, max-age=86400 by the brain (brain/app/main.py's cover
    # routes) — dropping those headers meant the browser re-fetched every image on every
    # view instead of caching, which is most of why a catalog with hundreds of covers felt
    # slow.
    headers = {k: v for k, v in upstream.headers.items()
               if k.lower() in ("content-type", "content-length", "accept-ranges",
                                 "content-range", "cache-control", "etag", "last-modified",
                                 "expires")}
    return StreamingResponse(body(), status_code=upstream.status_code, headers=headers,
                              background=BackgroundTask(cleanup))


# ---------------------------------------------------------------- static frontend

_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "dist")
if os.path.isdir(_DIST):
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
