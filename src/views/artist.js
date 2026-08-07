import { el, initials } from '../dom.js'
import { navigate } from '../router.js'
import { api } from '../api.js'
import { playQueue } from '../player.js'
import { state } from '../state.js'

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function albumRow(al) {
  return el('button', {
    class: 'thumb-row',
    onclick: () => navigate(`#/album/${encodeURIComponent(al.dir)}`),
  }, [
    al.cover_url
      ? el('img', { class: 'art', src: al.cover_url, alt: '' })
      : el('div', { class: 'art', text: initials(al.album) }),
    el('div', { class: 'meta' }, [
      el('div', { class: 't', text: al.album }),
      el('div', { class: 's', text: al.source === 'attic' ? 'attic' : 'the shelf' }),
    ]),
    el('div', { class: 'chev', text: '›' }),
  ])
}

export async function renderArtist(container, name) {
  container.replaceChildren(el('div', { class: 'empty', text: 'Loading…' }))

  const lib = (state.libraryAlbums || []).filter((a) => a.artist === name).map((a) => ({ ...a, source: 'library' }))
  const attic = (state.atticAlbums || []).filter((a) => a.artist === name).map((a) => ({ ...a, source: 'attic' }))
  const albums = lib.concat(attic)

  const wrap = el('div')
  wrap.appendChild(el('button', { class: 'back-link', onclick: () => history.back(), text: '‹ Back' }))
  wrap.appendChild(el('div', { class: 'detail-head' }, [
    el('div', { class: 'art', text: initials(name) }),
    el('div', { class: 'info' }, [
      el('div', { class: 'al', text: name }),
      el('div', { class: 'meta mono', text: `${albums.length} album${albums.length === 1 ? '' : 's'}` }),
    ]),
    el('button', { class: 'fav-btn', style: 'font-size:20px', text: '▶', onclick: () => playArtist(name, lib) }),
  ]))
  wrap.appendChild(el('div', { class: 'thumb-list' }, albums.map(albumRow)))

  container.replaceChildren(wrap)
}

async function playArtist(name, libAlbums) {
  let tracks = []
  try {
    const details = await Promise.all(libAlbums.map((a) => api.libraryAlbum(a.dir)))
    tracks = details.flatMap((d) => d.tracks)
  } catch (e) { /* the shelf may be empty for this artist — fine, attic can still carry it */ }
  try {
    const mix = await api.atticArtistMix(name)
    tracks = tracks.concat(mix.tracks)
  } catch (e) { /* nothing in the attic by them — fine if the shelf had tracks */ }
  if (!tracks.length) return
  shuffle(tracks)
  playQueue(tracks, 0, { artist: name })
}
