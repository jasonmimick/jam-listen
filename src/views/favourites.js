import { el, initials } from '../dom.js'
import { api } from '../api.js'
import { play } from '../player.js'
import { setState, state } from '../state.js'

let containerRef = null

function favRow(f) {
  return el('button', {
    class: 'thumb-row',
    onclick: () => play({ kind: 'track', url: f.url, title: f.title, artist: f.artist, album: f.album }),
  }, [
    el('div', { class: 'art', text: initials(f.album || f.title) }),
    el('div', { class: 'meta' }, [
      el('div', { class: 't', text: f.title }),
      el('div', { class: 's', text: [f.artist, f.album].filter(Boolean).join(' — ') }),
    ]),
    el('button', {
      class: 'fav-btn', 'aria-pressed': 'true', text: '♥',
      onclick: async (e) => {
        e.stopPropagation()
        await api.favouriteRemove(f.url)
        setState({ favourites: state.favourites.filter((x) => x.url !== f.url) })
        // the global route-level rerender skips no-op state updates on an unchanged route
        // (see main.js's renderRoute dedup) — this view owns its own refresh, same as album.js.
        if (containerRef) renderFavourites(containerRef)
      },
    }),
  ])
}

export function renderFavourites(container) {
  containerRef = container
  const favs = state.favourites || []
  container.replaceChildren(
    favs.length
      ? el('div', { class: 'thumb-list' }, favs.map(favRow))
      : el('div', { class: 'empty', text: 'Nothing favourited yet — tap the heart on any track.' })
  )
}
