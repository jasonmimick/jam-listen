// Browse: every album, A–Z by artist, with a source filter (all / cd / attic) and a letter
// strip. Search finds a thing you already know; this is for looking through everything.
// Filters live in the hash (#/browse?src=cd&l=B) so back/forward and links keep them.
//
// The attic alone is ~700 albums. Rendering all of them at once fires hundreds of cover
// requests (see RESULT_CAP in home.js), so rows go in CHUNK at a time as the bottom
// sentinel scrolls into view. Picking a letter is the fast way to a specific artist.

import { el } from '../dom.js'
import { navigate } from '../router.js'
import { state } from '../state.js'
import { albumRow, albumTag, sortAlbums } from './home.js'

const CHUNK = 60
const SOURCES = [
  { key: 'all', label: 'all' },
  { key: 'cd', label: 'cd' },
  { key: 'attic', label: 'attic' },
]
const LETTERS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function letterOf(al) {
  const name = (al.artist || '').replace(/^the\s+/i, '').trim()
  const c = name.charAt(0).toUpperCase()
  return c >= 'A' && c <= 'Z' ? c : '#'
}

export function renderBrowse(container, params) {
  const src = SOURCES.some((s) => s.key === params.get('src')) ? params.get('src') : 'all'
  const letter = params.get('l') || ''

  const all = sortAlbums((state.libraryAlbums || []).concat(state.atticAlbums || []))
    .filter((a) => src === 'all' || albumTag(a) === src)
  const present = new Set(all.map(letterOf))
  const albums = letter ? all.filter((a) => letterOf(a) === letter) : all

  const wrap = el('div', { class: 'browse' })
  wrap.appendChild(el('div', { class: 'view-rail' }, [
    el('span', { class: 'lbl', text: 'source:' }),
    ...SOURCES.map((s) => el('button', {
      class: 'cat-pill', 'aria-pressed': String(s.key === src),
      onclick: () => setParams({ src: s.key === 'all' ? null : s.key, l: null }),
    }, s.label)),
    el('span', { class: 'count', text: `${all.length} albums` }),
  ]))
  wrap.appendChild(el('div', { class: 'cat-rail letter-rail' }, [
    el('button', {
      class: 'cat-pill', 'aria-pressed': String(!letter),
      onclick: () => setParams({ l: null }),
    }, 'A–Z'),
    ...LETTERS.map((l) => el('button', {
      class: 'cat-pill', 'aria-pressed': String(l === letter), disabled: !present.has(l),
      onclick: () => setParams({ l }),
    }, l)),
  ]))

  const list = el('div', { class: 'thumb-list browse-list' })
  wrap.appendChild(list)
  if (!albums.length) {
    wrap.appendChild(el('div', { class: 'empty', text: 'nothing here' }))
    container.replaceChildren(wrap)
    return
  }

  // Letter headings only when showing everything — with one letter picked they'd repeat it.
  let shown = 0
  let lastLetter = ''
  const sentinel = el('div', { class: 'empty', text: 'loading more…' })
  const appendChunk = () => {
    const next = albums.slice(shown, shown + CHUNK)
    for (const a of next) {
      const l = letterOf(a)
      if (!letter && l !== lastLetter) {
        list.appendChild(el('div', { class: 'section-title browse-letter', text: l }))
        lastLetter = l
      }
      list.appendChild(albumRow(a, src === 'all' ? albumTag(a) : ''))
    }
    shown += next.length
    if (shown >= albums.length) sentinel.remove()
  }
  appendChunk()
  if (shown < albums.length) {
    wrap.appendChild(sentinel)
    const io = new IntersectionObserver((entries) => {
      if (!sentinel.isConnected) { io.disconnect(); return }
      if (!entries.some((e) => e.isIntersecting)) return
      appendChunk()
      // Re-observe so a sentinel that's STILL in view after the append fires again —
      // otherwise a tall screen stops loading after the second chunk.
      io.unobserve(sentinel)
      if (sentinel.isConnected) io.observe(sentinel)
    }, { rootMargin: '600px' })
    io.observe(sentinel)
  }

  container.replaceChildren(wrap)
}

function setParams(patch) {
  const p = new URLSearchParams(location.hash.split('?')[1] || '')
  for (const [key, value] of Object.entries(patch)) {
    if (value) p.set(key, value); else p.delete(key)
  }
  const qs = p.toString()
  navigate(qs ? `#/browse?${qs}` : '#/browse')
}
