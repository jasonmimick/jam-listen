// The audio engine. Top priority per Jason: "best audio quality and connection possible
// that just always works." Two rules drive everything here, both lifted from a pattern
// already proven in jam-station's index.html (static/index.html ~1170, 1338-1420):
//
// 1. Play the raw <audio> element by default. Never route through Web Audio unless the
//    listener explicitly opens the EQ — iOS suspends Web-Audio-routed playback on lock,
//    so staying off that graph is what makes lock-screen/AirPods playback reliable.
// 2. Auto-recover from stalls/drops. A dead stream must fix itself, not sit silent.

import { setState, state } from './state.js'

const audio = new Audio()
audio.preload = 'none'
audio.crossOrigin = 'use-credentials'

let eq = null   // lazily-built Web Audio graph — see openEq()
let watchdog = null
let backoffMs = 1000
const MAX_BACKOFF = 30000

function clearWatchdog() {
  if (watchdog) clearTimeout(watchdog)
  watchdog = null
}

function armWatchdog() {
  clearWatchdog()
  // If we haven't recovered within a few seconds of a stall, force a reload. Real network
  // drops don't self-heal on their own timeline — a fixed ceiling beats hoping.
  watchdog = setTimeout(() => reconnect(), 6000)
}

function reconnect() {
  if (!state.nowPlaying) return
  clearWatchdog()
  const src = audio.src
  const wasPlaying = !audio.paused
  audio.src = ''
  audio.src = src
  if (wasPlaying) {
    audio.play().catch(() => scheduleRetry())
  }
}

function scheduleRetry() {
  clearWatchdog()
  watchdog = setTimeout(() => {
    reconnect()
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF)
  }, backoffMs)
}

audio.addEventListener('playing', () => {
  backoffMs = 1000
  clearWatchdog()
  setState({})   // re-render play/pause state
})
audio.addEventListener('waiting', armWatchdog)
audio.addEventListener('stalled', armWatchdog)
audio.addEventListener('error', scheduleRetry)
audio.addEventListener('pause', () => setState({}))
audio.addEventListener('ended', () => {
  if (queue && queueIndex < queue.items.length - 1) {
    queueIndex += 1
    playFromQueue()
  } else {
    setState({})
  }
})

// A queue is how "play this album" / "play this artist" work — tap any track and the rest
// follow. A single track or a live channel is just a queue of one.
let queue = null       // {items, context: {album, artist, art}} | null
let queueIndex = 0

function playFromQueue() {
  const item = queue.items[queueIndex]
  play({ ...item, ...queue.context }, { fromQueue: true })
}

export function playQueue(tracks, startIndex, context = {}) {
  queue = { items: tracks, context }
  queueIndex = startIndex
  playFromQueue()
}

export function play(item) {
  // item: {kind: 'channel'|'track', url, title, artist, album, art, channel}
  if (!(arguments[1] && arguments[1].fromQueue)) queue = null   // a direct play breaks any queue
  backoffMs = 1000
  clearWatchdog()
  setState({ nowPlaying: item })
  audio.src = item.url
  audio.play().catch(() => {})
  updateMediaSession(item)
}

export function toggle() {
  if (!state.nowPlaying) return
  if (audio.paused) audio.play().catch(() => {})
  else audio.pause()
}

export function isPlaying() {
  return !audio.paused
}

// ── MediaSession: lock-screen/AirPods transport, works whether or not the EQ is open ──

function updateMediaSession(item) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: item.title || item.channel || 'jam-listen',
    artist: item.artist || '',
    album: item.album || '',
    artwork: item.art ? [{ src: item.art, sizes: '512x512', type: 'image/jpeg' }] : [],
  })
  navigator.mediaSession.setActionHandler('play', () => audio.play().catch(() => {}))
  navigator.mediaSession.setActionHandler('pause', () => audio.pause())
  navigator.mediaSession.setActionHandler('nexttrack', queue && queueIndex < queue.items.length - 1
    ? () => { queueIndex += 1; playFromQueue() } : null)
  navigator.mediaSession.setActionHandler('previoustrack', queue && queueIndex > 0
    ? () => { queueIndex -= 1; playFromQueue() } : null)
}

// ── EQ: opt-in Web Audio graph, built once, never torn down ───────────────────────────

const BANDS = [60, 250, 1000, 4000, 12000]

export function openEq() {
  if (eq) return eq
  const AC = window.AudioContext || window.webkitAudioContext
  const ctx = new AC()
  const source = ctx.createMediaElementSource(audio)
  const filters = BANDS.map((freq) => {
    const f = ctx.createBiquadFilter()
    f.type = freq === BANDS[0] ? 'lowshelf' : freq === BANDS[BANDS.length - 1] ? 'highshelf' : 'peaking'
    f.frequency.value = freq
    f.Q.value = 1
    f.gain.value = 0
    return f
  })
  source.connect(filters[0])
  for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1])
  filters[filters.length - 1].connect(ctx.destination)
  if (ctx.state === 'suspended') ctx.resume()
  eq = { ctx, filters, bands: BANDS }
  return eq
}

export function setEqBand(index, db) {
  if (!eq) return
  eq.filters[index].gain.value = db
}

export { audio }
