import { el } from '../dom.js'
import { navigate } from '../router.js'
import { api } from '../api.js'
import { playQueue } from '../player.js'
import { isFavourite, setState, state } from '../state.js'

let containerRef = null
let dirRef = null
let cached = null   // {album, tracks} for the currently-mounted album — avoids a re-fetch
                     // just to move the "playing" highlight when a queued track advances

async function toggleFavourite(track, album) {
  const fav = { url: track.url, title: track.title, artist: track.artist, album: album.album }
  if (isFavourite(track.url)) {
    await api.favouriteRemove(track.url)
    setState({ favourites: state.favourites.filter((f) => f.url !== track.url) })
  } else {
    await api.favouriteAdd(fav)
    setState({ favourites: state.favourites.concat(fav) })
  }
  paint()
}

function trackRow(track, index, album, tracks) {
  const playing = state.nowPlaying && state.nowPlaying.url === track.url
  return el('button', {
    class: 'row' + (playing ? ' playing' : ''),
    onclick: () => playQueue(tracks, index,
      { album: album.album, artist: album.artist, art: album.artUrl, dir: album.dir }),
  }, [
    el('span', { class: 'num mono', text: String(index + 1).padStart(2, '0') }),
    el('div', { class: 'meta' }, [
      el('div', { class: 't', text: track.title }),
      track.artist && track.artist !== album.artist
        ? el('div', { class: 's', text: track.artist })
        : null,
    ]),
    el('button', {
      class: 'fav-btn', 'aria-pressed': String(isFavourite(track.url)), text: '♥',
      onclick: (e) => { e.stopPropagation(); toggleFavourite(track, album) },
    }),
  ])
}

function paint() {
  if (!containerRef || !cached) return
  const { data, album, tracks } = cached
  const artUrl = album.artUrl

  const wrap = el('div')
  wrap.appendChild(el('button', { class: 'back-link', onclick: () => history.back(), text: '‹ Back' }))
  wrap.appendChild(el('div', { class: 'detail-head' }, [
    artUrl ? el('img', { class: 'art', src: artUrl, alt: '' }) : el('div', { class: 'art' }),
    el('div', { class: 'info' }, [
      el('div', { class: 'al', text: data.album }),
      el('div', {
        class: 'ar', onclick: () => navigate(`#/artist/${encodeURIComponent(data.artist)}`),
        text: data.artist,
      }),
      el('div', {
        class: 'meta mono',
        text: [tracks[0] && tracks[0].year, `${tracks.length} tracks`].filter(Boolean).join(' · '),
      }),
    ]),
  ]))
  wrap.appendChild(el('div', { class: 'row-list' }, tracks.map((t, i) => trackRow(t, i, album, tracks))))

  containerRef.replaceChildren(wrap)
}

export async function renderAlbum(container, dir) {
  containerRef = container
  dirRef = dir
  cached = null
  container.replaceChildren(el('div', { class: 'empty', text: 'Loading…' }))
  let data
  try {
    data = await api.libraryAlbum(dir)
  } catch (e) {
    container.replaceChildren(el('div', { class: 'empty', text: "Couldn't load that album." }))
    return
  }
  const artUrl = (data.images && data.images[0] && data.images[0].url) || ''
  const album = { album: data.album, artist: data.artist, artUrl, dir }
  cached = { data, album, tracks: data.tracks || [] }
  paint()
}

// Called from main.js on every nowPlaying/favourites change while an album is mounted —
// repaints from the already-fetched data, no network round-trip.
export function refreshAlbumIfMounted(container, dir) {
  if (containerRef !== container || dirRef !== dir || !cached) return
  paint()
}
