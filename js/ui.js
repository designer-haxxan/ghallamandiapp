// UI kit: icons, money text, bottom sheets, confirm dialogs, toasts, animated numbers, charts and the rate ticker.
import { t, unitLabel, isUr } from './i18n.js';
import { esc, fmtNum, fmtQty, AppError } from './util.js';

// ---------- icons (stroke icons, 24x24) ----------
const P = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  truck: '<path d="M1 6h13v10H1z"/><path d="M14 10h4l4 4v2h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><circle cx="17" cy="9" r="3"/><path d="M22 20c0-3-2-5-5-5"/>',
  wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M16 13h3"/><path d="M3 7l12-4v4"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  print: '<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  forward: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  sprout: '<path d="M12 22V12"/><path d="M12 12c0-4 3-7 8-7 0 5-3 7-8 7z"/><path d="M12 14c0-3-2-5-6-5 0 4 2 5 6 5z"/>',
  store: '<path d="M3 9l2-5h14l2 5"/><path d="M3 9v11h18V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  scale: '<path d="M12 3v18M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  bag: '<path d="M6 2l-3 4v15a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
  bolt: '<path d="M13 2L3 14h8l-1 8 10-12h-8z"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  data: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
};
export const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------- money & numbers ----------
// Rupees: "Rs 1,200" in English, "1,200 روپے" in Urdu. Digits stay Latin in both.
export const money = (n) => (isUr() ? `${fmtNum(n)} ${t('rs')}` : `${t('rs')} ${fmtNum(n)}`);
export const moneyNoSymbol = (n) => fmtNum(n);
export const qtyUnit = (q, unit) => `${fmtQty(q)} ${unitLabel(unit)}`;

export function statusPill(status) {
  const map = { open: ['pill-open', 'status_open'], partial: ['pill-partial', 'status_partial'], sold: ['pill-sold', 'status_sold'] };
  const [cls, key] = map[status] || map.open;
  return `<span class="pill ${cls}">${esc(t(key))}</span>`;
}

// ---------- toasts ----------
export function toast(message, kind = 'ok', ms = 3000) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${ic(kind === 'err' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}
export const errText = (e) => (e instanceof AppError || e?.key ? t(e.key, e.vars || {}) : (e?.message || t('err_generic')));
export const toastError = (e) => { console.warn(e); toast(errText(e), 'err', 4200); };

// ---------- bottom sheet / dialog ----------
// Returns { el, close(value), closed: Promise }. Closing with no value resolves undefined.
export function openSheet({ title, body = '', footer = '', wide = false, onMount } = {}) {
  const root = document.getElementById('sheet-root');
  const el = document.createElement('div');
  el.className = 'sheet-backdrop';
  el.innerHTML = `<div class="sheet ${wide ? 'sheet-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="${esc(t('close'))}">${ic('x')}</button></div>
      <div class="sheet-body">${body}</div>
      ${footer ? `<div class="sheet-foot">${footer}</div>` : ''}
    </div>`;
  root.appendChild(el);
  let done = false;
  let resolveFn;
  const closed = new Promise((r) => { resolveFn = r; });
  const close = (value) => {
    if (done) return;
    done = true;
    el.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => el.remove(), 280);
    resolveFn(value);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(undefined); };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(undefined); });
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => el.classList.add('open'));
  onMount?.(el, close);
  setTimeout(() => el.querySelector('input:not([type=hidden]):not([disabled]),select,textarea')?.focus({ preventScroll: true }), 220);
  return { el, close, closed };
}

// A form in a sheet. onSubmit(values, el) returns a value to close with, or throws (the message is shown).
export function formSheet({ title, body, submitLabel = t('save'), danger = false, wide = false, onSubmit, onMount }) {
  const sheet = openSheet({
    title, wide,
    body: `<form class="sheet-form" novalidate>${body}<div class="form-error d-none" role="alert"></div></form>`,
    footer: `<button type="button" class="btn btn-ghost" data-close>${esc(t('cancel'))}</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-submit"><span>${esc(submitLabel)}</span></button>`,
    onMount: (el, close) => {
      const form = el.querySelector('form');
      const btn = el.querySelector('.btn-submit');
      let busy = false;
      const submit = async (e) => {
        e?.preventDefault();
        if (busy) return;
        busy = true;
        btn.disabled = true;
        const err = el.querySelector('.form-error');
        err.classList.add('d-none');
        try {
          const values = Object.fromEntries(new FormData(form).entries());
          form.querySelectorAll('input[type=checkbox]').forEach((c) => { values[c.name] = c.checked; });
          const r = await onSubmit(values, el, close);
          if (r !== undefined && r !== false) close(r);
        } catch (ex) {
          console.warn(ex);
          err.textContent = errText(ex);
          err.classList.remove('d-none');
          el.querySelector('.sheet')?.classList.remove('shake');
          void el.querySelector('.sheet')?.offsetWidth;
          el.querySelector('.sheet')?.classList.add('shake');
        } finally { busy = false; btn.disabled = false; }
      };
      form.addEventListener('submit', submit);
      btn.addEventListener('click', submit);
      onMount?.(el, close);
    },
  });
  return sheet.closed;
}

export function confirmBox(message, { okLabel = t('confirm'), danger = false } = {}) {
  return openSheet({
    title: t('confirm'),
    body: `<p class="confirm-text">${esc(message)}</p>`,
    footer: `<button type="button" class="btn btn-ghost" data-close>${esc(t('cancel'))}</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okLabel)}</button>`,
    onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => close(true)),
  }).closed.then((v) => v === true);
}

// Searchable picker. search(q) returns [{ id, title, sub, right }]; resolves to the chosen item's id or null.
export function pickSheet({ title, placeholder = t('search'), search, emptyText = t('nothing_yet'), extra = '' }) {
  return openSheet({
    title,
    body: `<div class="search-box">${ic('search')}<input type="search" class="pick-q" placeholder="${esc(placeholder)}" autocomplete="off"></div>
      ${extra}<div class="pick-list"></div>`,
    onMount: (el, close) => {
      const list = el.querySelector('.pick-list');
      let items = [];
      const draw = async () => {
        items = await search(el.querySelector('.pick-q').value.trim());
        list.innerHTML = items.length ? items.map((it, i) => `
          <button type="button" class="pick-item" data-i="${i}" style="--d:${Math.min(i, 12) * 22}ms">
            <span class="pick-main"><span class="pick-title">${esc(it.title)}</span>${it.sub ? `<span class="pick-sub">${esc(it.sub)}</span>` : ''}</span>
            ${it.right ? `<span class="pick-right">${it.right}</span>` : ''}
          </button>`).join('') : `<div class="empty-state small">${esc(emptyText)}</div>`;
      };
      el.querySelector('.pick-q').addEventListener('input', debounceFn(draw, 120));
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (b) close(items[+b.dataset.i]?.id ?? null);
      });
      draw();
    },
  }).closed;
}
function debounceFn(fn, ms) { let t0; return (...a) => { clearTimeout(t0); t0 = setTimeout(() => fn(...a), ms); }; }

// ---------- animated numbers ----------
// Elements with data-count="123.45" count up from 0. data-kind="money" formats as money.
export function countUp(root = document) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count) || 0;
    const kind = el.dataset.kind || 'num';
    // Plain counts stay whole numbers while animating; money keeps paise.
    const fmt = (v) => (kind === 'money' ? money(v) : kind === 'qty' ? fmtQty(v) : Math.round(v).toLocaleString('en-IN'));
    if (reduce || end === 0) { el.textContent = fmt(end); return; }
    const t0 = performance.now();
    const dur = 900;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(end * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ---------- charts ----------
// Vertical bar chart. values: number[], labels: string[]. Bars grow in with a staggered CSS animation.
export function barChart(values, labels, { height = 160 } = {}) {
  const max = Math.max(1, ...values);
  const w = 100 / Math.max(1, values.length);
  const bars = values.map((v, i) => {
    const h = (v / max) * 100;
    return `<div class="bc-col" style="width:${w}%">
      <div class="bc-val">${v ? esc(fmtNum(v)) : ''}</div>
      <div class="bc-track"><div class="bc-bar" style="--h:${h.toFixed(1)}%;--d:${i * 90}ms" title="${esc(labels[i] || '')}: ${esc(fmtNum(v))}"></div></div>
      <div class="bc-lbl">${esc(labels[i] || '')}</div></div>`;
  }).join('');
  return `<div class="barchart" style="height:${height + 46}px">${bars}</div>`;
}

// Rate ticker: scrolling strip of today's rates. items: [{ name, low, high }]
export function ticker(items, label) {
  if (!items.length) return '';
  const one = items.map((i) => `<span class="tick"><b>${esc(i.name)}</b> ${esc(fmtNum(i.low))}–${esc(fmtNum(i.high))}</span>`).join('');
  return `<div class="ticker" aria-label="${esc(label)}"><div class="ticker-label">${esc(label)}</div><div class="ticker-track"><div class="ticker-run">${one}${one}</div></div></div>`;
}

// ---------- layout helpers ----------
export const page = (title, inner, actions = '', back = '') => `
  <header class="page-head">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="${esc(t('back'))}">${ic(isUr() ? 'forward' : 'back')}</a>` : ''}
    <h1>${esc(title)}</h1>
    <div class="page-actions">${actions}</div>
  </header>${inner}`;

export const empty = (text, icon = 'sprout', action = '') => `<div class="empty-state">
  <div class="empty-art">${ic(icon)}</div><p>${esc(text)}</p>${action}</div>`;

export const sectionTitle = (text, right = '') => `<div class="section-title"><h2>${esc(text)}</h2>${right}</div>`;

export const avatar = (name) => {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const ini = ((words[0]?.[0] || '?') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `<span class="avatar av-${h % 6}" aria-hidden="true">${esc(ini)}</span>`;
};

// Disables a button and shows a spinner while fn runs.
export async function busy(btn, fn) {
  btn.disabled = true; btn.classList.add('is-busy');
  try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('is-busy'); }
}
