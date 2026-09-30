// Hash router — no build-time route table, no history API complexity. #/browse was an
// alias of home for a while (home's one search replaced the first Browse screen); since
// 2026-09-29 it's a real A–Z browse again, because search alone left no way to look
// through everything.

const listeners = new Set()

export function currentRoute() {
  const hash = location.hash.slice(1) || '/'
  const [path, query] = hash.split('?')
  const parts = path.split('/').filter(Boolean)
  const params = new URLSearchParams(query || '')
  if (parts[0] === 'album') return { name: 'album', dir: decodeURIComponent(parts[1] || ''), params }
  if (parts[0] === 'artist') return { name: 'artist', artist: decodeURIComponent(parts[1] || ''), params }
  if (parts[0] === 'browse') return { name: 'browse', params }
  if (parts[0] === 'favourites') return { name: 'favourites', params }
  if (parts[0] === 'playing') return { name: 'playing', params }
  return { name: 'home', params }
}

export function navigate(hash) {
  location.hash = hash
}

export function onRouteChange(fn) {
  listeners.add(fn)
  window.addEventListener('hashchange', () => fn(currentRoute()))
  return () => listeners.delete(fn)
}
