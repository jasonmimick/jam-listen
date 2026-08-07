// Thin fetch wrapper for jam-listen's own backend (server/app/main.py), which proxies to
// jam-station's brain. The browser never talks to the brain or to keyring directly.

async function req(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  if (r.status === 401) {
    const err = new Error('signed out')
    err.signedOut = true
    throw err
  }
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}`)
  return r.status === 204 ? null : r.json()
}

export const api = {
  me: () => req('GET', '/api/me'),
  channels: () => req('GET', '/api/channels'),
  libraryAlbums: () => req('GET', '/api/library/albums'),
  libraryAlbum: (dir) => req('GET', `/api/library/album?dir=${encodeURIComponent(dir)}`),
  atticAlbums: () => req('GET', '/api/attic/albums'),
  atticArtistMix: (name) => req('GET', `/api/attic/artist?name=${encodeURIComponent(name)}`),
  favourites: () => req('GET', '/api/favourites'),
  favouriteAdd: (fav) => req('POST', '/api/favourites/add', fav),
  favouriteRemove: (url) => req('POST', '/api/favourites/remove', { url }),
}
