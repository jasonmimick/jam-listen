// A deliberately tiny store — no framework, just an object and subscribers. The whole
// app's state fits in one screenful; this is all the "state management" it needs.

const listeners = new Set()

export const state = {
  user: undefined,        // undefined = not checked yet, null = signed out, {email,...} = in
  favourites: [],
  nowPlaying: null,       // {kind: 'channel'|'track', url, title, artist, album, art, channel}
}

export function setState(patch) {
  Object.assign(state, patch)
  for (const fn of listeners) fn(state)
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function isFavourite(url) {
  return state.favourites.some((f) => f.url === url)
}
