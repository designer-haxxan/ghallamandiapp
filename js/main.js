// Boot: language, database, first-run setup, PIN lock, app shell, routes and the service worker.
import { t, setLang, isUr } from './i18n.js';
import { openDB } from './db.js';
import { S, loadAll, hasLock, eraseAll } from './store.js';
import { renderSetup, renderLock } from './gate.js';
import { defineRoutes, dispatch } from './router.js';
import { ic, formSheet, toast, toastError, openSheet } from './ui.js';
import { esc, AppError } from './util.js';

const AUTO_LOCK_MS = 5 * 60 * 1000;
let hiddenAt = 0;

defineRoutes([
  { name: 'home', title: () => t('nav_home'), load: () => import('./views/home.js').then((m) => m.render) },
  { name: 'lots', nav: 'lots', title: () => t('nav_arrivals'), load: () => import('./views/lots.js').then((m) => m.render) },
  { name: 'sales', title: () => t('nav_sales'), load: () => import('./views/sales.js').then((m) => m.render) },
  { name: 'parties', nav: 'parties', title: () => t('nav_parties'), load: () => import('./views/parties.js').then((m) => m.renderParties) },
  { name: 'party', nav: 'parties', title: () => t('nav_parties'), load: () => import('./views/parties.js').then((m) => m.renderParty) },
  { name: 'cash', group: 'more', title: () => t('nav_cash'), load: () => import('./views/cash.js').then((m) => m.render) },
  { name: 'rates', group: 'more', title: () => t('nav_rates'), load: () => import('./views/rates.js').then((m) => m.render) },
  { name: 'reports', group: 'more', title: () => t('nav_reports'), load: () => import('./views/reports.js').then((m) => m.render) },
  { name: 'settings', group: 'more', title: () => t('nav_settings'), load: () => import('./views/settings.js').then((m) => m.render) },
]);

const $ = (s) => document.querySelector(s);

// Bottom navigation and side menu. "More" groups the less frequent screens.
const NAV = [
  { name: 'home', icon: 'home', label: 'nav_home' },
  { name: 'lots', icon: 'truck', label: 'nav_arrivals' },
  { name: 'sales', icon: 'receipt', label: 'nav_sales' },
  { name: 'parties', icon: 'users', label: 'nav_parties' },
  { name: 'cash', icon: 'wallet', label: 'nav_cash' },
  { name: 'rates', icon: 'tag', label: 'nav_rates' },
  { name: 'reports', icon: 'chart', label: 'nav_reports' },
  { name: 'settings', icon: 'gear', label: 'nav_settings' },
];
const MORE = ['cash', 'rates', 'reports', 'settings'];

function buildShell() {
  const other = isUr() ? 'index.html' : 'urdu.html';
  const hash = location.hash || '#/home';
  const items = (list) => list.map((n) => `<a class="nav-link" href="#/${n.name}" data-nav="${n.name}">${ic(n.icon)}<span>${esc(t(n.label))}</span></a>`).join('');
  $('#side-nav').innerHTML = items(NAV);
  $('#bottom-nav').innerHTML = [
    ...['home', 'lots', 'sales', 'parties'].map((name) => NAV.find((n) => n.name === name)).map((n) => `<a class="bn-link" href="#/${n.name}" data-nav="${n.name}">${ic(n.icon)}<span>${esc(t(n.label))}</span></a>`),
    `<button type="button" class="bn-link" id="more-btn" data-nav-group="more">${ic('gear')}<span>${esc(t('nav_more'))}</span></button>`,
  ].join('');
  $('#more-btn').addEventListener('click', openMore);
  $('#lang-switch').href = `${other}${hash}`;
  $('#lang-switch').textContent = isUr() ? 'English' : 'اردو';
  $('#lock-btn').innerHTML = ic('lock');
  $('#lock-btn').toggleAttribute('hidden', !hasLock());
  applyBrand();
}

function openMore() {
  openSheet({
    title: t('nav_more'),
    body: `<div class="more-grid">${MORE.map((m) => {
      const n = NAV.find((x) => x.name === m);
      return `<a class="more-tile" href="#/${m}" data-close>${ic(n.icon)}<span>${esc(t(n.label))}</span></a>`;
    }).join('')}</div>`,
    onMount: (el, close) => el.querySelectorAll('.more-tile').forEach((a) => a.addEventListener('click', () => close())),
  });
}

function applyBrand() {
  const name = S.settings.shopName || t('app_name');
  document.querySelectorAll('.brand-name').forEach((el) => { el.textContent = t('app_name'); });
  $('#shop-line').textContent = name;
  document.title = `${name} · ${t('app_name')}`;
}

function show(which) {
  $('#boot').classList.add('d-none');
  $('#gate-root').classList.toggle('d-none', which !== 'gate');
  $('#shell').classList.toggle('d-none', which !== 'app');
  if (which !== 'gate') $('#gate-root').innerHTML = '';
}

function showSetup() {
  show('gate');
  renderSetup($('#gate-root'), () => { showApp(); toast(t('welcome_back')); });
}

function showLock() {
  show('gate');
  renderLock($('#gate-root'), () => showApp(), forgotPin);
}

function showApp() {
  show('app');
  buildShell();
  dispatch(true);
}

// Forgotten PIN: the only way back is erasing this phone's data (there is no server to reset it). Requires typing ERASE.
function forgotPin() {
  formSheet({
    title: t('erase_all'), danger: true, submitLabel: t('erase_all'),
    body: `<p class="confirm-text">${esc(t('forgot_pin'))}</p><div class="field"><label>ERASE</label><input name="typed" class="input" autocomplete="off"></div>`,
    onSubmit: async (v) => {
      if (v.typed !== 'ERASE') throw new AppError('type_word', { word: 'ERASE' });
      await eraseAll();
      document.dispatchEvent(new Event('app:reset'));
      return true;
    },
  }).catch(toastError);
}

function lockNow() {
  if (!hasLock()) return;
  showLock();
}

// Lock automatically when the app has been in the background for a while.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS && hasLock() && !$('#shell').classList.contains('d-none')) lockNow();
  hiddenAt = 0;
});

window.addEventListener('hashchange', () => { if (!$('#shell').classList.contains('d-none')) dispatch(); });
document.addEventListener('app:shop-changed', applyBrand);
document.addEventListener('app:reset', () => { $('#lock-btn').setAttribute('hidden', ''); showSetup(); });
$('#lock-btn').addEventListener('click', lockNow);

window.addEventListener('error', (e) => { console.error(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); toastError(e.reason); });

// Wire the sheet's Escape/back behaviour and language before anything renders.
(async function boot() {
  setLang(document.documentElement.lang === 'ur' ? 'ur' : 'en');
  document.getElementById('boot-msg').textContent = t('loading');
  try {
    await openDB();
    await loadAll();
  } catch (e) {
    console.error(e);
    document.getElementById('boot-msg').textContent = `${t('err_generic')} ${e.message || ''}`;
    return;
  }
  if (!S.settings.setupDone) return showSetup();
  if (hasLock()) return showLock();
  showApp();
})();

// Service worker: offline app shell. Updates reload the page once the new files are in place.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('service-worker.js').catch((e) => console.warn('SW failed', e));
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (controlled) location.reload(); controlled = true; });
}
