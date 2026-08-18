// Thin fetch wrapper for jam-listen's own backend (server/app/main.py), which proxies to
// jam-station's brain. The browser never talks to the brain directly. No auth — the app
// is open; the server carries its own brain session.

async function req(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}`)
  return r.status === 204 ? null : r.json()
}

export const api = {
  channels: () => req('GET', '/api/channels'),
  libraryAlbums: () => req('GET', '/api/library/albums'),
  libraryAlbum: (dir) => req('GET', `/api/library/album?dir=${encodeURIComponent(dir)}`),
  atticAlbums: () => req('GET', '/api/attic/albums'),
  atticArtistMix: (name) => req('GET', `/api/attic/artist?name=${encodeURIComponent(name)}`),
  channelMix: (slug) => req('GET', `/api/mix?slug=${encodeURIComponent(slug)}&count=40`),
  dial: () => req('GET', '/api/dial'),
  favourites: () => req('GET', '/api/favourites'),
  favouriteAdd: (fav) => req('POST', '/api/favourites/add', fav),
  favouriteRemove: (url) => req('POST', '/api/favourites/remove', { url }),
}
