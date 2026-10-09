// Hash router: "#/name/param" → view. A route is { name, nav?, title(params), load() → render(main, ctx) }.
// Views receive (main, { params, rerender, go, title(text) }) and may set their own topbar title.
let table = [];
let current = null;
let token = 0;

export function defineRoutes(list) { table = list; }

export function parse(hash = location.hash) {
  const parts = (hash.replace(/^#\/?/, '') || 'home').split('/').map((p) => decodeURIComponent(p));
  const found = table.find((r) => r.name === parts[0]) || table.find((r) => r.name === 'home');
  return { route: found, params: parts.slice(1) };
}

export function go(hash) {
  if (location.hash === hash) return rerender();
  location.hash = hash;
}

export function rerender() { return dispatch(true); }

export async function dispatch(force = false) {
  const { route, params } = parse();
  const my = ++token;
  const main = document.getElementById('content');
  const key = `${route.name}/${params.join('/')}`;
  const same = !force && current === key;
  current = key;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === (route.nav || route.name)));
  document.querySelectorAll('[data-nav-group]').forEach((a) => a.classList.toggle('active', a.dataset.navGroup === route.group));
  setTitle(route.title(params));
  if (same) return;
  try {
    const render = await route.load();
    if (my !== token) return;
    main.classList.remove('view-in');
    void main.offsetWidth; // restart the entrance animation
    await render(main, { params, rerender, go, title: setTitle });
    if (my !== token) return;
    main.classList.add('view-in');
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (my === token) main.innerHTML = `<div class="empty-state"><p>${String(e?.message || e)}</p></div>`;
  }
}

function setTitle(text) {
  const el = document.getElementById('topbar-title');
  if (el && text) el.textContent = text;
}
