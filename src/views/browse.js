import { el, initials } from '../dom.js'
import { navigate } from '../router.js'
import { state } from '../state.js'

function catalog() {
  const lib = (state.libraryAlbums || []).map((a) => ({ ...a, source: 'library' }))
  const attic = (state.atticAlbums || []).map((a) => ({ ...a, source: 'attic' }))
  return lib.concat(attic)
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
      el('div', {
        class: 's',
        text: al.artist + (al.source === 'attic' ? ' · attic' : ''),
      }),
    ]),
    el('div', { class: 'chev', text: '›' }),
  ])
}

export function renderBrowse(container, params) {
  const src = params.get('src') || 'all'
  const q = (params.get('q') || '').toLowerCase()
  const sort = params.get('sort') || 'artist'

  const wrap = el('div')

  const toolbar = el('div', { class: 'toolbar' })
  const search = el('input', {
    type: 'search', placeholder: 'Search albums, artists…', value: params.get('q') || '',
  })
  search.addEventListener('input', () => {
    const p = new URLSearchParams(location.hash.split('?')[1] || '')
    if (search.value) p.set('q', search.value); else p.delete('q')
    navigate(`#/browse?${p.toString()}`)
  })
  const sortSel = el('select', {}, [
    el('option', { value: 'artist', selected: sort === 'artist' || null, text: 'Sort: Artist' }),
    el('option', { value: 'album', selected: sort === 'album' || null, text: 'Sort: Album' }),
    el('option', { value: 'newest', selected: sort === 'newest' || null, text: 'Sort: Newest' }),
  ])
  sortSel.addEventListener('change', () => {
    const p = new URLSearchParams(location.hash.split('?')[1] || '')
    p.set('sort', sortSel.value)
    navigate(`#/browse?${p.toString()}`)
  })
  const srcSel = el('select', {}, [
    el('option', { value: 'all', selected: src === 'all' || null, text: 'All music' }),
    el('option', { value: 'library', selected: src === 'library' || null, text: 'The Shelf' }),
    el('option', { value: 'attic', selected: src === 'attic' || null, text: 'The Attic' }),
  ])
  srcSel.addEventListener('change', () => {
    const p = new URLSearchParams(location.hash.split('?')[1] || '')
    p.set('src', srcSel.value)
    navigate(`#/browse?${p.toString()}`)
  })
  toolbar.append(search, srcSel, sortSel)
  wrap.appendChild(toolbar)

  let albums = catalog()
  if (src !== 'all') albums = albums.filter((a) => a.source === src)
  if (q) albums = albums.filter((a) =>
    (a.album || '').toLowerCase().includes(q) || (a.artist || '').toLowerCase().includes(q))

  if (sort === 'artist') albums.sort((a, b) => (a.artist || '').localeCompare(b.artist || '') || (a.album || '').localeCompare(b.album || ''))
  else if (sort === 'album') albums.sort((a, b) => (a.album || '').localeCompare(b.album || ''))
  else if (sort === 'newest') albums.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))

  wrap.appendChild(
    albums.length
      ? el('div', { class: 'thumb-list' }, albums.map(albumRow))
      : el('div', { class: 'empty', text: 'Nothing matches.' })
  )

  container.replaceChildren(wrap)
}
