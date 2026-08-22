import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import brain_client, config

app = FastAPI()


def _misconfigured() -> HTTPException:
    return HTTPException(502, "jam-listen's service account isn't a jam-station member")


@app.get("/stations/{path:path}")
async def proxy_station_art(path: str):
    """Channel art (index.html calls this /stations/<slug>.jpg). Public on the brain —
    no session needed, same here."""
    import httpx
    client = httpx.AsyncClient(timeout=10)
    req = client.build_request("GET", f"{config.BRAIN_URL}/stations/{path}")
    upstream = await client.send(req, stream=True)
    return _stream_response(upstream, client)


# ---------------------------------------------------------------- proxied brain reads

_PROXY_GET = [
    "/api/channels",
    "/api/library/albums",
    "/api/library/genres",
    "/api/library/album",
    "/api/attic/albums",
    "/api/attic/stats",
    "/api/attic/artist",
    "/api/mix",
    "/api/dial",
    "/api/favourites",
]


def _register_proxy_get(path: str):
    @app.get(path, name=f"proxy_get_{path}")
    async def _proxied(request: Request):
        try:
            r = await brain_client.call("GET", path, params=dict(request.query_params))
        except LookupError:
            raise _misconfigured()
        return JSONResponse(r.json(), status_code=r.status_code)


for _p in _PROXY_GET:
    _register_proxy_get(_p)


# ---------------------------------------------------------------- favourites (writes)
# One shared household list now — favourites belong to the service account.

def _register_proxy_post(path: str):
    @app.post(path, name=f"proxy_post_{path}")
    async def _proxied(request: Request):
        body = await request.json()
        try:
            r = await brain_client.call("POST", path, json=body)
        except LookupError:
            raise _misconfigured()
        return JSONResponse(r.json(), status_code=r.status_code)


for _p in ["/api/favourites/add", "/api/favourites/remove"]:
    _register_proxy_post(_p)


# ---------------------------------------------------------------- audio + art passthrough

@app.get("/api/attic/cover")
async def proxy_attic_cover(artist: str, album: str):
    """Attic album art. Unlike library covers (plain files under /music, proxied below),
    the brain resolves these lazily per-request and needs the query params forwarded,
    not just a path — so it gets its own route rather than falling under /music."""
    token = await brain_client.cookie()
    if not token:
        raise _misconfigured()
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
    token = await brain_client.cookie()
    if not token:
        raise _misconfigured()
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
    one hop further, to attic-server.py on the host)."""
    return await _proxy_brain_track("/attic", path, request)


@app.get("/stream/{slug}")
async def proxy_stream(slug: str):
    """Live icecast relay. Private channels need the brain's cookie (it 403s without
    one); public ones don't, but routing everything through here keeps the brain's URL
    out of the browser either way."""
    token = await brain_client.cookie()
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
    # index.html must ALWAYS revalidate. Without Cache-Control, Safari's heuristic
    # caching held onto stale copies for days — old bundles kept showing dead channels
    # as ON AIR ("live stations not playing", twice). The JS/CSS under /assets/ is
    # content-hashed, so a fresh index.html is all it takes to pull the current app.
    @app.get("/")
    @app.get("/index.html")
    async def index():
        return FileResponse(os.path.join(_DIST, "index.html"),
                            headers={"Cache-Control": "no-cache"})

    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
