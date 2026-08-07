// Everything lives here now: stations, the shelf, the attic, one category rail, one
// search box that behaves the same no matter what's selected. Used to be split across a
// Home screen and a separate Browse screen with its own toolbar — Jason's call after
// using the real thing: the category pills disappeared the moment you picked CDs/Attic,
// and Browse's two <select> dropdowns weren't the same interaction as Home's search at
// all. One persistent rail + one search box, always in the same place, fixes both.

import { el, initials } from '../dom.js'
import { navigate } from '../router.js'
import { play } from '../player.js'
import { state } from '../state.js'

const CATS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'cds', label: 'CDs' },
  { key: 'attic', label: 'Attic' },
]

function stationRow(ch) {
  return el('button', { class: 'thumb-row', onclick: () => playChannel(ch) }, [
    ch.art_url
      ? el('img', { class: 'art', src: ch.art_url, alt: '', loading: 'lazy' })
      : el('div', { class: 'art', text: initials(ch.name) }),
    el('div', { class: 'meta' }, [
      el('div', { class: 't', text: ch.name }),
      el('div', { class: 's', text: ch.private ? 'private' : 'live' }),
    ]),
    el('div', { class: 'live', text: 'ON AIR' }),
  ])
}

function playChannel(ch) {
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

function capped(list) {
  return { shown: list.slice(0, RESULT_CAP), hiddenCount: Math.max(0, list.length - RESULT_CAP) }
}

function matches(text, q) {
  return (text || '').toLowerCase().includes(q)
}

function sortAlbums(albums) {
  return albums.slice().sort((a, b) =>
    (a.artist || '').localeCompare(b.artist || '') || (a.album || '').localeCompare(b.album || ''))
}

export function renderHome(container, params) {
  const cat = params.get('cat') || 'all'
  const q = (params.get('q') || '').trim().toLowerCase()

  const wrap = el('div')

  wrap.appendChild(el('div', { class: 'cat-rail' }, CATS.map((c) => el('button', {
    class: 'cat-pill', 'aria-pressed': String(c.key === cat),
    onclick: () => setParam('cat', c.key === 'all' ? null : c.key),
  }, c.label))))

  const search = el('input', {
    type: 'search', placeholder: '> search', value: params.get('q') || '',
  })
  search.addEventListener('input', () => setParam('q', search.value || null))
  wrap.appendChild(el('div', { class: 'toolbar' }, [search]))

  const stations = state.channels || []
  const cds = sortAlbums(state.libraryAlbums || [])
  const attic = sortAlbums(state.atticAlbums || [])

  let sections = []
  let hiddenTotal = 0
  const cap = (list, tag) => {
    const { shown, hiddenCount } = capped(list)
    hiddenTotal += hiddenCount
    return shown.map((a) => albumRow(a, tag))
  }

  if (cat === 'live') {
    sections.push(['Stations', stations.filter((c) => matches(c.name, q)).map(stationRow)])
  } else if (cat === 'cds') {
    sections.push(['The Shelf', cap(cds.filter((a) => matches(a.album, q) || matches(a.artist, q)))])
  } else if (cat === 'attic') {
    sections.push(['The Attic', cap(attic.filter((a) => matches(a.album, q) || matches(a.artist, q)))])
  } else if (q) {
    // "All" + a query searches everything at once — that's the whole point of one search.
    sections = [
      ['Stations', stations.filter((c) => matches(c.name, q)).map(stationRow)],
      ['The Shelf', cap(cds.filter((a) => matches(a.album, q) || matches(a.artist, q)), 'cds')],
      ['The Attic', cap(attic.filter((a) => matches(a.album, q) || matches(a.artist, q)), 'attic')],
    ]
  } else {
    // "All", no query: the quick-access default — live stations only, catalogs are too
    // big to dump unfiltered (the attic alone can run well past a thousand albums).
    sections.push(['Stations', stations.map(stationRow)])
  }

  const any = sections.some(([, rows]) => rows.length)
  if (!any) {
    wrap.appendChild(el('div', { class: 'empty', text: 'nothing matches' }))
  } else {
    for (const [title, rows] of sections) {
      if (!rows.length) continue
      wrap.appendChild(el('div', { class: 'section-title', text: title }))
      wrap.appendChild(el('div', { class: 'thumb-list' }, rows))
    }
    if (hiddenTotal) {
      wrap.appendChild(el('div', {
        class: 'empty',
        text: `${hiddenTotal} more — narrow the search to see them`,
      }))
    }
  }

  container.replaceChildren(wrap)
}

function setParam(key, value) {
  const p = new URLSearchParams(location.hash.split('?')[1] || '')
  if (value) p.set(key, value); else p.delete(key)
  const qs = p.toString()
  navigate(qs ? `#/?${qs}` : '#/')
}
