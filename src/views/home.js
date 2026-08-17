// One search, one list — like a search engine over everything jam-station has: live
// stations, the shelf (CDs), and the attic, merged into a single result list with a
// per-row tag saying which world a result comes from. No category pills, no genre rail,
// no separate browse — Jason's call: narrowing is typing, not navigating.

import { el, initials } from '../dom.js'
import { api } from '../api.js'
import { navigate } from '../router.js'
import { play, playQueue } from '../player.js'
import { state } from '../state.js'

function stationRow(ch) {
  return el('button', { class: 'thumb-row', onclick: () => playChannel(ch) }, [
    ch.art_url
      ? el('img', { class: 'art', src: ch.art_url, alt: '', loading: 'lazy' })
      : el('div', { class: 'art', text: initials(ch.name) }),
    el('div', { class: 'meta' }, [
      el('div', { class: 't', text: ch.name }),
      el('div', { class: 's', text: 'live' }),
    ]),
    el('div', { class: 'live', text: 'ON AIR' }),
  ])
}

async function playChannel(ch) {
  // Genre stations (shelf-*/vault-*) are MIX-ONLY on the brain: no icecast mount exists,
  // ever — /stream/<slug> 404s for them by design. They play as on-demand shuffles via
  // /api/mix, same as the station's own UI. This was why "private channels don't work":
  // jam-listen used to stream everything.
  if (ch.query && ch.query.genre) {
    try {
      const mix = await api.channelMix(ch.slug)
      playQueue(mix.tracks, 0, { channel: ch.name, art: ch.art_url || '' })
    } catch (e) { /* an empty section — nothing to play */ }
    return
  }
  play({
    kind: 'channel', url: `/stream/${ch.slug}`, title: ch.name,
    channel: ch.name, art: ch.art_url || '',
  })
}

function albumRow(al, tag) {
  return el('button', {
    class: 'thumb-row',
    onclick: () => navigate(`#/album/${encodeURIComponent(al.dir)}`),
  }, [
    al.cover_url
      ? el('img', { class: 'art', src: al.cover_url, alt: '', loading: 'lazy' })
      : el('div', { class: 'art', text: initials(al.album) }),
    el('div', { class: 'meta' }, [
      el('div', { class: 't', text: al.album }),
      el('div', { class: 's', text: al.artist + (tag ? ` · ${tag}` : '') }),
    ]),
    el('div', { class: 'chev' }),
  ])
}

// The shelf and (especially) the attic are hundreds of albums — rendering them all at
// once used to fire hundreds of simultaneous cover-art requests and made the whole app
// feel stuck, even a broad search term (a single common letter matches plenty). Always
// cap what actually renders; narrowing the search is how you see more, not scrolling.
const RESULT_CAP = 60

function matches(text, q) {
  return (text || '').toLowerCase().includes(q)
}

function sortAlbums(albums) {
  return albums.slice().sort((a, b) =>
    (a.artist || '').localeCompare(b.artist || '') || (a.album || '').localeCompare(b.album || ''))
}

function albumTag(al) {
  return al.dir.startsWith('attic:') ? 'attic' : 'cd'
}

export function renderHome(container, params) {
  const q = (params.get('q') || '').trim().toLowerCase()

  const wrap = el('div')

  const search = el('input', {
    type: 'search', placeholder: '> search everything', value: params.get('q') || '',
  })
  search.addEventListener('input', () => setParams({ q: search.value || null }))
  wrap.appendChild(el('div', { class: 'toolbar' }, [search]))

  const stations = state.channels || []
  const albums = sortAlbums((state.libraryAlbums || []).concat(state.atticAlbums || []))

  if (q) {
    // One flat list: matching stations first (there are only ever a couple dozen),
    // then every matching album from shelf + attic together, each tagged cd/attic.
    const hitStations = stations.filter((c) => matches(c.name, q)).map(stationRow)
    // Genres count as search text too — the Playing card's genre chips land here as a
    // plain query, and "jazz" should find jazz albums, not just albums named Jazz.
    const hitAlbums = albums.filter((a) => matches(a.album, q) || matches(a.artist, q)
      || (a.genres || []).some((g) => matches(g, q)))
    const shown = hitAlbums.slice(0, RESULT_CAP)
    const hidden = hitAlbums.length - shown.length
    const rows = hitStations.concat(shown.map((a) => albumRow(a, albumTag(a))))

    if (!rows.length) {
      wrap.appendChild(el('div', { class: 'empty', text: 'nothing matches' }))
    } else {
      wrap.appendChild(el('div', { class: 'thumb-list' }, rows))
      if (hidden > 0) {
        wrap.appendChild(el('div', {
          class: 'empty',
          text: `${hidden} more — narrow the search to see them`,
        }))
      }
    }
  } else {
    // No query: recently added + the dial. The natural spot for more "sprinkles" later.
    const recent = albums.filter((a) => a.mtime)
      .sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, 12)
    if (recent.length) {
      wrap.appendChild(el('div', { class: 'section-title', text: 'Recently added' }))
      wrap.appendChild(el('div', { class: 'thumb-list' }, recent.map((a) => albumRow(a, albumTag(a)))))
    }
    wrap.appendChild(el('div', { class: 'section-title', text: 'Stations' }))
    wrap.appendChild(el('div', { class: 'thumb-list' }, stations.map(stationRow)))
  }

  container.replaceChildren(wrap)
}

function setParams(patch) {
  const p = new URLSearchParams(location.hash.split('?')[1] || '')
  for (const [key, value] of Object.entries(patch)) {
    if (value) p.set(key, value); else p.delete(key)
  }
  const qs = p.toString()
  navigate(qs ? `#/?${qs}` : '#/')
}
