import { el } from '../dom.js'
import { api } from '../api.js'

// Station on/off dashboard at #/admin. Needs the server's ADMIN_TOKEN, kept in
// localStorage after the first successful load. Each change restarts the radio (~30s),
// so flip everything you want, then wait once.

const KEY = 'jl-admin-token'
const getToken = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY) } catch {} }

export async function renderAdmin(container) {
  const token = getToken()
  if (!token) return renderLogin(container)
  let chans
  try {
    chans = await api.adminChannels(token)
  } catch {
    setToken('')
    return renderLogin(container, 'Token rejected.')
  }
  const onCount = chans.filter((c) => c.enabled).length
  container.replaceChildren(
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
