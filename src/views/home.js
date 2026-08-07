import { el, initials } from '../dom.js'
import { navigate } from '../router.js'
import { play } from '../player.js'
import { state } from '../state.js'

const CATEGORIES = ['All', 'Live', 'CDs', 'Attic']

let activeCat = 'All'

function stationRow(ch) {
  return el('button', { class: 'thumb-row', onclick: () => playChannel(ch) }, [
    ch.art_url
      ? el('img', { class: 'art', src: ch.art_url, alt: '' })
      : el('div', { class: 'art', text: initials(ch.name) }),
    el('div', { class: 'meta' }, [
      el('div', { class: 't', text: ch.name }),
      el('div', { class: 's', text: ch.private ? 'private' : 'live' }),
    ]),
    el('div', { class: 'live' }, [el('i'), 'ON AIR']),
  ])
}

function playChannel(ch) {
  play({
    kind: 'channel', url: `/stream/${ch.slug}`, title: ch.name,
    channel: ch.name, art: ch.art_url || '',
  })
}

export function renderHome(container) {
  const wrap = el('div')

  const rail = el('div', { class: 'cat-rail' },
    CATEGORIES.map((c) => el('button', {
      class: 'cat-pill', 'aria-pressed': String(c === activeCat),
      onclick: () => {
        if (c === 'CDs') return navigate('#/browse?src=library')
        if (c === 'Attic') return navigate('#/browse?src=attic')
        activeCat = c
        renderHome(container)
      },
    }, c)))
  wrap.appendChild(rail)

  wrap.appendChild(el('div', { class: 'section-title', text: 'Browse' }))
  wrap.appendChild(el('div', { class: 'thumb-list' }, [
    el('button', { class: 'thumb-row', onclick: () => navigate('#/browse?src=library') }, [
      el('div', { class: 'art', text: 'CD' }),
      el('div', { class: 'meta' }, [
        el('div', { class: 't', text: 'The Shelf' }),
        el('div', { class: 's', text: 'On demand · ripped CDs' }),
      ]),
      el('div', { class: 'chev', text: '›' }),
    ]),
    el('button', { class: 'thumb-row', onclick: () => navigate('#/browse?src=attic') }, [
      el('div', { class: 'art', text: 'AT' }),
      el('div', { class: 'meta' }, [
        el('div', { class: 't', text: 'The Attic' }),
        el('div', { class: 's', text: 'On demand · the vault' }),
      ]),
      el('div', { class: 'chev', text: '›' }),
    ]),
  ]))

  if (activeCat !== 'CDs' && activeCat !== 'Attic') {
    wrap.appendChild(el('div', { class: 'section-title', text: 'Stations' }))
    const chans = state.channels || []
    wrap.appendChild(
      chans.length
        ? el('div', { class: 'thumb-list' }, chans.map(stationRow))
        : el('div', { class: 'empty', text: 'No stations yet.' })
    )
  }

  container.replaceChildren(wrap)
}
