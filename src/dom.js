// The smallest possible DOM helper — no vdom, no diffing. Views re-render their own
// container wholesale on state change; the app is small enough that this is plenty fast
// and there's nothing else to break.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v
    else if (k === 'html') node.innerHTML = v
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v)
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v)
  }
  for (const child of [].concat(children)) {
    if (child == null) continue
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild)
}

export function mount(container, node) {
  clear(container)
  container.appendChild(node)
}

export function initials(text) {
  return (text || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

export function fmtDur(seconds) {
  if (!seconds && seconds !== 0) return ''
  const s = Math.round(seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}
