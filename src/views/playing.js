// The big now-playing card — tapping the deck lands here. Full details, real transport
// (play/pause, stop, ±10s, prev/next track when there's a queue), and links out to the
// album/artist/genres the deck bar itself was too small to offer.

import { el, fmtDur, initials } from '../dom.js'
import { navigate } from '../router.js'
import {
  audio, isPlaying, queueInfo, seek, skipNext, skipPrevious, stop, toggle as togglePlayback,
} from '../player.js'
import { state } from '../state.js'

export function renderPlaying(container) {
  const np = state.nowPlaying
  if (!np) {
    container.replaceChildren(el('div', { class: 'empty', text: 'nothing playing' }))
    return
  }

  const isLive = np.kind === 'channel'
  const q = queueInfo()

  const timeRow = el('div', { class: 'playing-time mono' }, [
    el('span', { class: 'cur', text: '0:00' }),
    el('input', {
      type: 'range', min: '0', max: '100', value: '0', class: 'seekbar',
      oninput: (e) => { seeking = true; seekPreview = Number(e.target.value) },
      onchange: (e) => { seeking = false; seekPreview = null; scrub(Number(e.target.value)) },
    }),
    el('span', { class: 'dur', text: '0:00' }),
  ])
  if (isLive) timeRow.style.visibility = 'hidden'

  const playBtn = el('button', {
    class: 'transport-play', onclick: togglePlayback, text: isPlaying() ? '❚❚' : '▶',
  })

  const wrap = el('div', { class: 'playing' }, [
    el('button', { class: 'back-link', onclick: () => history.back(), text: '‹ Back' }),
    np.art
      ? el('img', { class: 'playing-art', src: np.art, alt: '' })
      : el('div', { class: 'playing-art', text: initials(np.album || np.channel || np.title) }),
    el('div', { class: 'playing-title', text: np.title || np.channel || 'jam-listen' }),
    np.artist
      ? el('button', { class: 'playing-link', onclick: () => navigate(`#/artist/${encodeURIComponent(np.artist)}`), text: np.artist })
      : null,
    np.album
      ? (np.dir
        ? el('button', { class: 'playing-link', onclick: () => navigate(`#/album/${encodeURIComponent(np.dir)}`), text: np.album })
        : el('div', { class: 'playing-link static', text: np.album }))
      : null,
    np.genres && np.genres.length
      ? el('div', { class: 'playing-genres' }, np.genres.map((g) => el('button', {
        class: 'cat-pill', onclick: () => navigate(`#/?q=${encodeURIComponent(g)}`), text: g,
      })))
      : null,
    timeRow,
    el('div', { class: 'transport' }, [
      el('button', { class: 'transport-btn', disabled: !q.hasPrev || null, onclick: skipPrevious, text: '⏮' }),
      el('button', { class: 'transport-btn', disabled: isLive || null, onclick: () => seek(-10), text: '-10s' }),
      playBtn,
      el('button', { class: 'transport-btn', disabled: isLive || null, onclick: () => seek(10), text: '+10s' }),
      el('button', { class: 'transport-btn', disabled: !q.hasNext || null, onclick: skipNext, text: '⏭' }),
    ]),
    el('button', { class: 'transport-stop', onclick: stop, text: '■ stop' }),
  ])

  container.replaceChildren(wrap)

  let seeking = false
  let seekPreview = null

  function scrub(percent) {
    if (!Number.isFinite(audio.duration)) return
    audio.currentTime = (percent / 100) * audio.duration
  }

  const curEl = timeRow.querySelector('.cur')
  const durEl = timeRow.querySelector('.dur')
  const bar = timeRow.querySelector('.seekbar')

  function tick() {
    if (!document.body.contains(wrap)) { clearInterval(id); return }
    playBtn.textContent = isPlaying() ? '❚❚' : '▶'
    if (!Number.isFinite(audio.duration) || isLive) return
    if (!seeking) bar.value = String((audio.currentTime / audio.duration) * 100 || 0)
    curEl.textContent = fmtDur(seeking ? (seekPreview / 100) * audio.duration : audio.currentTime)
    durEl.textContent = fmtDur(audio.duration)
  }
  const id = setInterval(tick, 500)
  tick()
}
