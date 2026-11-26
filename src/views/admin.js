import { el } from '../dom.js'
import { api } from '../api.js'

// Station on/off dashboard at #/admin. Needs the server's ADMIN_TOKEN, kept in
// localStorage after the first successful load. Each change restarts the radio (~30s),
// so flip everything you want, then wait once.

const KEY = 'jl-admin-token'
const getToken = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY) } catch {} }

let tab = 'stations'   // 'stations' | 'usage'
let days = 30

function tabs(container) {
  const t = (id, label) => el('button', {
    class: 'tab' + (tab === id ? ' on' : ''), text: label,
    onclick: () => { tab = id; renderAdmin(container) },
  })
  return el('div', { class: 'admin-tabs' }, [t('stations', 'Stations'), t('usage', 'Usage')])
}

export async function renderAdmin(container) {
  const token = getToken()
  if (!token) return renderLogin(container)
  if (tab === 'usage') return renderUsage(container, token)
  let chans
  try {
    chans = await api.adminChannels(token)
  } catch {
    setToken('')
    return renderLogin(container, 'Token rejected.')
  }
  const onCount = chans.filter((c) => c.enabled).length
  container.replaceChildren(
    tabs(container),
    el('div', { class: 'empty', text: `${onCount} of ${chans.length} stations on. Changes take ~30s to reach the streams.` }),
    el('div', { class: 'thumb-list' }, chans.map((c) => row(container, token, c))),
    el('button', { class: 'thumb-row', text: 'Sign out', onclick: () => { setToken(''); renderAdmin(container) } }),
  )
}

function row(container, token, c) {
  return el('button', {
    class: 'thumb-row',
    'aria-pressed': c.enabled ? 'true' : 'false',
    onclick: async () => {
      await api.adminToggle(token, c.slug, !c.enabled)
      renderAdmin(container)
    },
  }, [
    el('div', { class: 'meta' }, [
      el('div', { class: 't', text: c.name }),
      el('div', { class: 's', text: c.slug }),
    ]),
    el('div', { class: 's', text: c.enabled ? 'ON' : 'OFF' }),
  ])
}

function renderLogin(container, msg) {
  const input = el('input', { type: 'password', placeholder: 'admin token', autocomplete: 'off' })
  const go = () => { setToken(input.value.trim()); renderAdmin(container) }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go() })
  container.replaceChildren(
    el('div', { class: 'empty', text: msg || 'Admin token' }),
    input,
    el('button', { class: 'thumb-row', text: 'Continue', onclick: go }),
  )
}

// ---------------------------------------------------------------- usage report
// Listening hours from the brain's `listens` log (jam-station docs/DESIGN-usage-reports.md).
// Stations that stream all the time but had under 1 h in 30 days are flagged as
// candidates for on-demand.

const fmtH = (h) => (h >= 10 ? h.toFixed(0) : h >= 1 ? h.toFixed(1) : `${Math.round(h * 60)}m`)

async function renderUsage(container, token) {
  container.replaceChildren(tabs(container), el('div', { class: 'empty', text: 'Loading…' }))
  let r
  try {
    r = await api.adminUsage(token, days)
  } catch {
    container.replaceChildren(tabs(container), el('div', { class: 'empty', text: 'Usage report unavailable.' }))
    return
  }
  const stations = r.channels.filter((c) => c.continuous || c.source)
  const other = r.channels.filter((c) => !c.continuous && !c.source)
  const max = Math.max(0.01, ...r.channels.map((c) => c.hours))
  const idle = stations.filter((c) => c.idle)
  const dayKeys = []
  for (let i = days - 1; i >= 0; i--) dayKeys.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))

  const range = el('div', { class: 'admin-tabs' }, [7, 30, 90].map((d) => el('button', {
    class: 'tab' + (d === days ? ' on' : ''), text: `${d} days`,
    onclick: () => { days = d; renderUsage(container, token) },
  })))

  container.replaceChildren(...[
    tabs(container),
    range,
    el('div', { class: 'usage-summary' }, [
      el('div', {}, [el('b', { text: fmtH(r.total_hours) }), el('span', { text: ` listened in the last ${days} days` })]),
      el('div', { class: 's', text: `data since ${(r.data_since || '—').slice(0, 10)}` }),
      spark(dayKeys, r.by_day, 'usage-spark big'),
    ]),
    idle.length ? el('div', { class: 'usage-note', text:
      `${idle.length} always-on station${idle.length > 1 ? 's' : ''} had under ${r.idle_threshold_hours_30d} h in 30 days: ${idle.map((c) => c.name).join(', ')}` }) : null,
    section('Stations', stations, max, dayKeys),
    other.length ? section('Albums, mixes & artists (on demand)', other.slice(0, 40), max, dayKeys) : null,
    split('By app', r.clients),
    split('By person', r.people),
  ].filter(Boolean))
}

function section(title, rows, max, dayKeys) {
  return el('div', { class: 'usage-sec' }, [
    el('div', { class: 'usage-h', text: title }),
    ...rows.map((c) => el('div', { class: 'usage-row' + (c.idle ? ' idle' : '') }, [
      el('div', { class: 'meta' }, [
        el('div', { class: 't', text: c.name }),
        el('div', { class: 's', text: [
          c.continuous ? 'always on' : c.source ? 'on demand' : '',
          c.sessions ? `${c.sessions} session${c.sessions > 1 ? 's' : ''}` : 'not played',
          c.last_played ? `last ${c.last_played.slice(0, 10)}` : '',
        ].filter(Boolean).join(' · ') }),
      ]),
      spark(dayKeys, c.days, 'usage-spark'),
      el('div', { class: 'usage-bar' }, [el('i', { style: `width:${(100 * c.hours) / max}%` })]),
      el('div', { class: 'usage-h-num mono', text: c.hours ? fmtH(c.hours) : '—' }),
    ])),
  ])
}

function split(title, rows) {
  if (!rows.length) return null
  return el('div', { class: 'usage-sec' }, [
    el('div', { class: 'usage-h', text: title }),
    ...rows.map((x) => el('div', { class: 'usage-row' }, [
      el('div', { class: 'meta' }, [el('div', { class: 't', text: x.name })]),
      el('div', { class: 'usage-h-num mono', text: fmtH(x.hours) }),
    ])),
  ])
}

function spark(dayKeys, byDay, cls) {
  const vals = dayKeys.map((d) => (byDay && byDay[d]) || 0)
  const top = Math.max(...vals)
  const W = 100, H = 20, bw = W / vals.length
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('class', cls)
  vals.forEach((v, i) => {
    if (!v) return
    const h = Math.max(1.5, (v / top) * H)
    const r = document.createElementNS(ns, 'rect')
    r.setAttribute('x', (i * bw).toFixed(2)); r.setAttribute('width', Math.max(0.6, bw - 0.4).toFixed(2))
    r.setAttribute('y', (H - h).toFixed(2)); r.setAttribute('height', h.toFixed(2))
    const t = document.createElementNS(ns, 'title'); t.textContent = `${dayKeys[i]}: ${fmtH(v)}`
    r.appendChild(t)
    svg.appendChild(r)
  })
  return svg
}
