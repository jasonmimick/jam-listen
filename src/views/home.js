// Home: one search over everything, and THREE switchable layouts — a live A/B on the
// real site (Jason's call: program guide first, but keep alternatives around to compare).
// The variant is a localStorage choice, not a route: same URL, same search behavior,
// different presentation. Searching always collapses to the same flat merged list.
//
//   guide  — a terminal program guide: every station as a dense row with what's playing
//            right now (live via /api/dial, polled while mounted), mixes below, then a
//            compact recently-added tail.
//   crates — art forward: the dial as a horizontal strip of station tiles, then a
//            cover grid of albums, newest first.
//   list   — the original flat rows (kept as the control).

import { el, initials } from '../dom.js'
import { api } from '../api.js'
import { navigate } from '../router.js'
import { play, playQueue } from '../player.js'
import { state } from '../state.js'

const VIEWS = [
  { key: 'guide', label: 'guide' },
  { key: 'crates', label: 'crates' },
  { key: 'list', label: 'list' },
]

function currentView() {
  const v = localStorage.getItem('homeView')
  return VIEWS.some((x) => x.key === v) ? v : 'guide'
}

// ---------------------------------------------------------------- playback

async function playChannel(ch) {
  // Genre stations (shelf-*/vault-*) are MIX-ONLY on the brain: no icecast mount exists,
  // ever — /stream/<slug> 404s for them by design. They play as on-demand shuffles via
  // /api/mix, same as the station's own UI.
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

// ---------------------------------------------------------------- shared rows

function stationRow(ch) {
  return el('button', { class: 'thumb-row', onclick: () => playChannel(ch) }, [
    ch.art_url
      ? el('img', { class: 'art', src: ch.art_url, alt: '', loading: 'lazy' })
      : el('div', { class: 'art', text: initials(ch.name) }),
    el('div', { class: 'meta' }, [
      el('div', { class: 't', text: ch.name }),
      el('div', { class: 's', text: ch.query && ch.query.genre ? 'mix' : 'live' }),
    ]),
    el('div', { class: 'live', text: 'ON AIR' }),
  ])
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
// once fires hundreds of simultaneous cover-art requests and makes the whole app feel
// stuck. Always cap what actually renders; narrowing the search is how you see more.
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

function isMix(ch) {
  return !!(ch.query && ch.query.genre)
}

function onAir(channels) {
  return channels.filter((c) => c.enabled !== 0 && c.enabled !== false)
}

// ---------------------------------------------------------------- guide (default)

// Now-playing across the dial, refreshed while the guide is on screen. The poller dies
// with its DOM: each tick checks the list is still connected before rescheduling, so
// navigating away (or switching views) ends it without any teardown bookkeeping.
let dial = {}

function pollDial(listEl) {
  api.dial().then((d) => { dial = d; fillGuideNowPlaying(listEl) }).catch(() => {})
  setTimeout(() => { if (listEl.isConnected) pollDial(listEl) }, 30000)
}

function fillGuideNowPlaying(listEl) {
  for (const row of listEl.querySelectorAll('[data-slug]')) {
    const np = dial[row.dataset.slug]
    if (!np) continue
    const line = [np.artist, np.title].filter(Boolean).join(' — ')
    const npEl = row.querySelector('.np')
    if (line && npEl.textContent !== line) {
      npEl.textContent = line
      npEl.classList.remove('dim')
    }
  }
}

function guideRow(ch, sub) {
  return el('button', { class: 'guide-row', 'data-slug': ch.slug, onclick: () => playChannel(ch) }, [
    el('span', { class: 'ch', text: ch.name }),
    el('span', { class: 'np dim', text: sub }),
  ])
}

function renderGuide(wrap, albums) {
  const chans = onAir(state.channels || [])
  const stations = chans.filter((c) => !isMix(c))
  const mixes = chans.filter(isMix)

  wrap.appendChild(el('div', { class: 'section-title', text: 'On air' }))
  const list = el('div', { class: 'guide-list' },
    stations.map((c) => guideRow(c, 'live')))
  wrap.appendChild(list)
  fillGuideNowPlaying(list)
  pollDial(list)

  if (mixes.length) {
    wrap.appendChild(el('div', { class: 'section-title', text: 'Mixes' }))
    wrap.appendChild(el('div', { class: 'guide-list' },
      mixes.map((c) => guideRow(c, `${c.query.genre} · shuffle`))))
  }

  const recent = albums.filter((a) => a.mtime)
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, 8)
  if (recent.length) {
    wrap.appendChild(el('div', { class: 'section-title', text: 'Recently added' }))
    wrap.appendChild(el('div', { class: 'thumb-list' },
      recent.map((a) => albumRow(a, albumTag(a)))))
  }
}

// ---------------------------------------------------------------- crates

function dialTile(ch) {
  return el('button', { class: 'dial-tile', onclick: () => playChannel(ch) }, [
    ch.art_url
      ? el('img', { class: 'cv', src: ch.art_url, alt: '', loading: 'lazy' })
      : el('div', { class: 'cv', text: initials(ch.name) }),
    el('div', { class: 'nm', text: ch.name }),
  ])
}

function coverTile(al) {
  return el('button', {
    class: 'cover-tile',
    onclick: () => navigate(`#/album/${encodeURIComponent(al.dir)}`),
  }, [
    al.cover_url
      ? el('img', { class: 'cv', src: al.cover_url, alt: '', loading: 'lazy' })
      : el('div', { class: 'cv', text: initials(al.album) }),
    el('div', { class: 't', text: al.album }),
    el('div', { class: 's', text: al.artist }),
  ])
}

function renderCrates(wrap, albums) {
  const chans = onAir(state.channels || [])
  wrap.appendChild(el('div', { class: 'section-title', text: 'On air' }))
  wrap.appendChild(el('div', { class: 'dial-strip' }, chans.map(dialTile)))

  // Newest first — the crates are for flipping through what's fresh; search finds the rest.
  const fresh = albums.slice()
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, RESULT_CAP)
  wrap.appendChild(el('div', { class: 'section-title', text: 'The crates' }))
  wrap.appendChild(el('div', { class: 'cover-grid' }, fresh.map(coverTile)))
  if (albums.length > fresh.length) {
    wrap.appendChild(el('div', {
      class: 'empty',
      text: `${albums.length - fresh.length} more in the crates — search to dig`,
    }))
  }
}

// ---------------------------------------------------------------- list (the control)

function renderList(wrap, albums) {
  const recent = albums.filter((a) => a.mtime)
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, 12)
  if (recent.length) {
    wrap.appendChild(el('div', { class: 'section-title', text: 'Recently added' }))
    wrap.appendChild(el('div', { class: 'thumb-list' }, recent.map((a) => albumRow(a, albumTag(a)))))
  }
  wrap.appendChild(el('div', { class: 'section-title', text: 'Stations' }))
  wrap.appendChild(el('div', { class: 'thumb-list' }, onAir(state.channels || []).map(stationRow)))
}

// ---------------------------------------------------------------- the view itself

export function renderHome(container, params) {
  const q = (params.get('q') || '').trim().toLowerCase()

  const wrap = el('div')

  const search = el('input', {
    type: 'search', placeholder: '> search everything', value: params.get('q') || '',
  })
  search.addEventListener('input', () => setParams({ q: search.value || null }))
  wrap.appendChild(el('div', { class: 'toolbar' }, [search]))

  const albums = sortAlbums((state.libraryAlbums || []).concat(state.atticAlbums || []))

  if (q) {
    // One flat list, identical in every view: matching stations first (there are only
    // ever a couple dozen), then every matching album, tagged cd/attic. Genres count as
    // search text too — the Playing card's genre chips land here as a plain query.
    const hitStations = onAir(state.channels || [])
      .filter((c) => matches(c.name, q)).map(stationRow)
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
    const view = currentView()
    wrap.appendChild(el('div', { class: 'view-rail' }, [
      el('span', { class: 'lbl', text: 'view:' }),
      ...VIEWS.map((v) => el('button', {
        class: 'cat-pill', 'aria-pressed': String(v.key === view),
        onclick: () => { localStorage.setItem('homeView', v.key); renderHome(container, params) },
      }, v.label)),
    ]))
    if (view === 'guide') renderGuide(wrap, albums)
    else if (view === 'crates') renderCrates(wrap, albums)
    else renderList(wrap, albums)
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
