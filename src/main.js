import './style.css'
import { el, initials } from './dom.js'
import { api } from './api.js'
import { currentRoute, navigate, onRouteChange } from './router.js'
import { isPlaying, openEq, setEqBand, toggle as togglePlayback } from './player.js'
import { setState, state, subscribe } from './state.js'
import { isMix, mixSource, onAir, playChannel, renderHome } from './views/home.js'
import { refreshAlbumIfMounted, renderAlbum } from './views/album.js'
import { renderArtist } from './views/artist.js'
import { renderBrowse } from './views/browse.js'
import { renderFavourites } from './views/favourites.js'
import { renderPlaying } from './views/playing.js'

// Applied before first paint, not after boot() resolves — otherwise slow catalog fetches
// show a flash of whatever the OS's light/dark preference happened to pick.
document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'dark')

const app = document.getElementById('app')

async function boot() {
  // No sign-in, no gate — the app is open. Straight to the catalog.
  const [channels, libraryAlbums, atticAlbums, favouritesRes] = await Promise.all([
    api.channels().catch(() => []),
    api.libraryAlbums().catch(() => []),
    api.atticAlbums().catch(() => []),
    api.favourites().catch(() => ({ favourites: [] })),
  ])
  setState({
    channels, libraryAlbums, atticAlbums,
    favourites: favouritesRes.favourites || [],
  })
  renderApp()
}

const TABS = [
  { label: 'Home', hash: '#/' },
  { label: 'Browse', hash: '#/browse' },
  { label: 'Favourites', hash: '#/favourites' },
]

function themeToggle() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark'
  const btn = el('button', {
    class: 'theme-toggle', text: current === 'dark' ? 'o' : '•',
    onclick: () => {
      const next = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('theme', next)
      btn.textContent = next === 'dark' ? 'o' : '•'
    },
  })
  return btn
}

function renderApp() {
  const main = el('main')
  const strip = el('div', { class: 'chassis-strip' }, [
    el('button', { class: 'wordmark', onclick: () => navigate('#/') }, [
      el('span', { class: 'dot live' }),
    ]),
    el('div', { class: 'strip-right' }, [
      el('div', { class: 'strip-tabs' }, TABS.map((t) => el('button', {
        'aria-current': currentTabMatches(t.hash) ? 'page' : null,
        onclick: () => navigate(t.hash),
        text: t.label,
      }))),
      themeToggle(),
    ]),
  ])

  let deck = renderDeck()
  const eqPanel = el('div', { id: 'eq-slot' })

  let sidebar = renderSidebar()

  app.replaceChildren(strip, sidebar, main, eqPanel, deck)
  renderRoute(main)

  const repaintSidebar = () => {
    const next = renderSidebar()
    next.scrollTop = sidebar.scrollTop
    sidebar.replaceWith(next)
    sidebar = next
  }

  onRouteChange(() => {
    renderRoute(main)
    repaintSidebar()
    if (focusSearchAfterRoute) { focusSearchAfterRoute = false; focusSearch() }
    const tabs = strip.querySelector('.strip-tabs')
    tabs.querySelectorAll('button').forEach((btn, i) => {
      if (currentTabMatches(TABS[i].hash)) btn.setAttribute('aria-current', 'page')
      else btn.removeAttribute('aria-current')
    })
  })
  subscribe(() => {
    renderRoute(main, true)
    const newDeck = renderDeck()
    deck.replaceWith(newDeck)
    deck = newDeck
    repaintSidebar()
  })
}

// ---------------------------------------------------------------- desktop

// The sidebar is always rendered and only shown by the desktop media query (style.css) —
// on a phone it's display:none, so the mobile layout is untouched. It puts every station
// and mix one click away from any screen, which the phone gets from Home instead.
function renderSidebar() {
  const chans = onAir(state.channels || [])
  const np = state.nowPlaying
  const r = currentRoute()
  const nav = (label, hash, name) => el('button', {
    class: 'side-item', 'aria-current': r.name === name ? 'page' : null,
    onclick: () => navigate(hash), text: label,
  })
  const station = (ch, label) => el('button', {
    class: 'side-item' + (np && np.channel === ch.name ? ' on' : ''),
    onclick: () => playChannel(ch), text: label,
  })
  const stations = chans.filter((c) => !isMix(c))
  const mixes = chans.filter(isMix)
  return el('aside', { class: 'sidebar' }, [
    nav('Home', '#/', 'home'),
    nav('Browse', '#/browse', 'browse'),
    nav('Favourites', '#/favourites', 'favourites'),
    np ? nav('Now playing', '#/playing', 'playing') : null,
    el('div', { class: 'section-title', text: 'On air' }),
    ...stations.map((c) => station(c, c.name)),
    mixes.length ? el('div', { class: 'section-title', text: 'Mixes' }) : null,
    ...mixes.map((c) => station(c, `${mixSource(c)} · ${c.query.genre}`)),
    el('div', { class: 'side-keys', text: 'space play/pause · / search · j k move · enter play' }),
  ])
}

// Keyboard shortcuts. Harmless on a phone (no keyboard), useful anywhere there is one.
const NAV_ITEMS = 'main .guide-row, main .thumb-row, main .row, main .cover-tile, main .dial-tile'
let focusSearchAfterRoute = false

function focusSearch() {
  const input = document.querySelector('main input[type="search"]')
  if (input) { input.focus(); input.select(); return }
  focusSearchAfterRoute = true
  navigate('#/')
}

function moveFocus(step) {
  const items = [...document.querySelectorAll(NAV_ITEMS)]
  if (!items.length) return
  const i = items.indexOf(document.activeElement)
  const next = items[i < 0 ? 0 : Math.max(0, Math.min(items.length - 1, i + step))]
  next.focus()
  next.scrollIntoView({ block: 'nearest' })
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.target.matches('input, textarea, select')) {
    if (e.key === 'Escape') e.target.blur()
    return
  }
  if (e.key === ' ') {
    if (!state.nowPlaying) return
    e.preventDefault()
    togglePlayback()
  } else if (e.key === '/') {
    e.preventDefault()
    focusSearch()
  } else if (e.key === 'j' || e.key === 'k') {
    e.preventDefault()
    moveFocus(e.key === 'j' ? 1 : -1)
  }
})

function currentTabMatches(hash) {
  const r = currentRoute()
  if (hash === '#/') return r.name === 'home'
  if (hash === '#/browse') return r.name === 'browse'
  if (hash === '#/favourites') return r.name === 'favourites'
  return false
}

let lastRouteKey = ''

function renderRoute(main, isStateUpdate = false) {
  const r = currentRoute()
  const key = r.name + (r.dir || r.artist || '')
  // A pure state update (now-playing/favourites changed) shouldn't re-fetch a route that
  // hasn't actually changed — but the album view still needs its "playing" row and heart
  // icons to move, which it can do from its own cache with no network call.
  if (isStateUpdate && key === lastRouteKey) {
    if (r.name === 'album') refreshAlbumIfMounted(main, r.dir)
    // the Playing card has no fetch to avoid — nowPlaying itself IS its data, so a plain
    // state update (track advanced, paused) just repaints it, same cost as leaving it stale.
    if (r.name === 'playing') renderPlaying(main)
    return
  }
  lastRouteKey = key
  if (r.name === 'home') renderHome(main, r.params)
  else if (r.name === 'album') renderAlbum(main, r.dir)
  else if (r.name === 'artist') renderArtist(main, r.artist)
  else if (r.name === 'browse') renderBrowse(main, r.params)
  else if (r.name === 'favourites') renderFavourites(main)
  else if (r.name === 'playing') renderPlaying(main)
}

function renderDeck() {
  const np = state.nowPlaying
  if (!np) return el('div')

  const openCard = () => navigate('#/playing')
  return el('div', { class: 'deck' }, [
    np.art
      ? el('img', { class: 'art', src: np.art, alt: '', onclick: openCard })
      : el('div', { class: 'art', text: initials(np.album || np.channel || np.title), onclick: openCard }),
    el('div', { class: 'meta', onclick: openCard }, [
      el('div', { class: 't', text: np.title || np.channel || 'jam-listen' }),
      el('div', {
        class: 's',
        text: state.loading
          ? 'loading…'
          : [np.artist, np.album].filter(Boolean).join(' — ') || np.channel || '',
      }),
    ]),
    el('div', { class: 'ctrl' }, [
      el('button', {
        class: 'icon eq-toggle', 'aria-pressed': String(!!document.getElementById('eq-open')),
        onclick: toggleEqPanel, text: 'EQ',
      }),
      state.loading
        ? el('div', { class: 'play loading', text: '⋯' })
        : el('button', { class: 'play', onclick: togglePlayback, text: isPlaying() ? '❚❚' : '▶' }),
    ]),
  ])
}

function toggleEqPanel() {
  const slot = document.getElementById('eq-slot')
  if (slot.firstChild) { slot.replaceChildren(); return }
  const eq = openEq()
  slot.replaceChildren(el('div', { id: 'eq-open', class: 'eq-panel' }, [
    el('div', { class: 'eq-head' }, [
      el('span', { class: 'eyebrow', text: 'Graphic EQ' }),
      el('button', {
        class: 'icon', text: 'Reset',
        onclick: () => {
          eq.filters.forEach((f) => { f.gain.value = 0 })
          slot.replaceChildren()
          toggleEqPanel()
        },
      }),
    ]),
    el('div', { class: 'eq-bands' }, eq.bands.map((freq, i) => eqBand(freq, i))),
  ]))
}

function eqBand(freq, index) {
  const label = freq >= 1000 ? `${freq / 1000}K` : String(freq)
  const dbLabel = el('span', { class: 'db mono', text: '0dB' })
  const fill = el('div', { class: 'fill', style: 'height:50%' })
  const input = el('input', {
    type: 'range', min: '-12', max: '12', step: '1', value: '0',
    oninput: (e) => {
      const v = Number(e.target.value)
      setEqBand(index, v)
      dbLabel.textContent = (v > 0 ? '+' : '') + v + 'dB'
      fill.style.height = `${((v + 12) / 24) * 100}%`
    },
  })
  return el('div', { class: 'eq-band' }, [
    el('div', { class: 'eq-fader-wrap' }, [fill, input]),
    dbLabel,
    el('label', { 'data-hz': label }),
  ])
}

boot()
