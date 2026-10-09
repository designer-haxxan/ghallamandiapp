// Rate board (bhav): today's low and high rate per item. Shown as a live ticker and used to pre-fill sale rates.
import { t, itemName, unitLabel } from '../i18n.js';
import { S, activeCommodities, rateFor, saveRate } from '../store.js';
import { esc, today, addDays, fmtDate, num } from '../util.js';
import { ic, page, toast, toastError, ticker, empty } from '../ui.js';

export async function render(main) {
  let date = today();
  const draw = async () => {
    const items = activeCommodities();
    const tick = items.map((c) => ({ c, r: rateFor(date, c.id) })).filter((x) => x.r);
    main.innerHTML = page(t('rate_board'), `
      <p class="muted small">${esc(t('rate_board_help'))}</p>
      ${date === today() && tick.length ? ticker(tick.map((x) => ({ name: itemName(x.c), low: x.r.low, high: x.r.high })), t('ticker_prefix')) : ''}
      <div class="date-bar card">
        <button type="button" class="icon-btn" data-day="-1" aria-label="${esc(t('back'))}">${ic('back')}</button>
        <label class="date-pick"><span class="muted small">${esc(t('board_date'))}</span><input type="date" class="input" name="date" value="${esc(date)}"></label>
        <button type="button" class="icon-btn" data-day="1" aria-label="${esc(t('nav_more'))}">${ic('forward')}</button>
        <div class="date-label">${esc(fmtDate(date))}</div>
      </div>
      <form class="card board-form" novalidate>
        ${items.length ? items.map((c, i) => {
          const r = rateFor(date, c.id);
          const prev = S.rates.filter((x) => x.commodityId === c.id && x.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
          return `<div class="board-row" style="--d:${i * 30}ms">
            <div class="board-name"><b>${esc(itemName(c))}</b><span class="muted small">${esc(unitLabel(c.unit))}${prev ? ` · ${esc(t('last_rate'))}: ${esc(prev.low)}–${esc(prev.high)}` : ''}</span></div>
            <label class="mini"><span>${esc(t('low'))}</span><input class="input num-in" inputmode="decimal" name="low-${esc(c.id)}" value="${r ? r.low : ''}"></label>
            <label class="mini"><span>${esc(t('high'))}</span><input class="input num-in" inputmode="decimal" name="high-${esc(c.id)}" value="${r ? r.high : ''}"></label>
          </div>`;
        }).join('') : empty(t('nothing_yet'), 'tag')}
        ${items.length ? `<div class="form-actions sticky-actions">
          <button type="button" class="btn btn-ghost" data-copy>${esc(t('last_rate'))}</button>
          <button type="submit" class="btn btn-primary btn-lg"><span>${esc(t('save'))}</span></button></div>` : ''}
      </form>`);
    wire();
  };

  const wire = () => {
    main.querySelector('[name=date]').addEventListener('change', (e) => { date = e.target.value || today(); draw(); });
    main.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { date = addDays(date, +b.dataset.day); draw(); }));
    main.querySelector('[data-copy]')?.addEventListener('click', () => {
      // Copies the most recent earlier board into empty fields, so a rate does not have to be typed twice.
      for (const c of activeCommodities()) {
        const low = main.querySelector(`[name="low-${c.id}"]`);
        const high = main.querySelector(`[name="high-${c.id}"]`);
        if (low.value || high.value) continue;
        const prev = S.rates.filter((x) => x.commodityId === c.id && x.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
        if (prev) { low.value = prev.low; high.value = prev.high; }
      }
    });
    main.querySelector('form.board-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        let saved = 0;
        for (const c of activeCommodities()) {
          const lo = main.querySelector(`[name="low-${c.id}"]`).value;
          const hi = main.querySelector(`[name="high-${c.id}"]`).value;
          if (lo === '' && hi === '') continue;
          const low = num(lo, NaN); const high = num(hi, NaN);
          await saveRate({ date, commodityId: c.id, low, high: Number.isNaN(high) ? low : high });
          saved++;
        }
        toast(saved ? t('rate_saved') : t('nothing_selected'));
        draw();
      } catch (ex) {
        toastError(ex);
      } finally { btn.disabled = false; }
    });
  };

  draw();
}
