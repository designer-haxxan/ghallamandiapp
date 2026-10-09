// Home: today's numbers, live rate ticker, 7-day sales chart, quick actions and who needs follow-up.
import { t, isUr, itemName } from '../i18n.js';
import { S, salesBetween, totals, cashBalance, openLots, buyers, farmers, balance, rateFor, buyerAging, activeCommodities } from '../store.js';
import { esc, addDays, today, fmtDate, daysBetween } from '../util.js';
import { ic, money, countUp, barChart, ticker, empty, avatar, sectionTitle } from '../ui.js';
import { openArrivalForm } from './lots.js';
import { openSaleForm } from './sales.js';
import { openReceive, openPayFarmer } from './cash.js';

const greeting = () => {
  const h = new Date().getHours();
  if (isUr()) return h < 12 ? 'صبح بخیر' : h < 17 ? 'دوپہر بخیر' : 'شام بخیر';
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export async function render(main, { rerender }) {
  const d = today();
  const name = S.settings.ownerName || S.settings.shopName || '';
  const todayLots = S.lots.filter((l) => l.date === d);
  const todaySales = salesBetween(d, d);
  const todayTotal = todaySales.reduce((n, s) => n + s.total, 0);
  const todayCommission = todaySales.reduce((n, s) => n + s.commission, 0);
  const tot = totals();
  const cash = cashBalance(null);
  const open = openLots();

  // Last 7 days, oldest first.
  const days = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6));
  const series = days.map((day) => salesBetween(day, day).reduce((n, s) => n + s.total, 0));
  const labels = days.map((day) => new Date(day + 'T00:00:00').toLocaleDateString(isUr() ? 'ur-PK' : 'en-GB', { weekday: 'short' }));

  // Rates for today, for the ticker.
  const rates = activeCommodities().map((c) => ({ c, r: rateFor(d, c.id) })).filter((x) => x.r).map((x) => ({ name: itemName(x.c), low: x.r.low, high: x.r.high }));

  // Buyers who owe money, biggest first, with how old their oldest unpaid bill is.
  const dues = buyers().map((b) => ({ b, bal: balance(b.id), aging: buyerAging(b.id) })).filter((x) => x.bal > 0.005)
    .sort((a, c) => c.bal - a.bal).slice(0, 5);
  const farmerDues = farmers().map((f) => ({ f, bal: balance(f.id) })).filter((x) => x.bal > 0.005).sort((a, c) => c.bal - a.bal).slice(0, 5);

  const lastBackup = S.settings.lastBackupAt;
  const hasData = S.lots.length || S.sales.length || S.parties.length;
  const backupDays = lastBackup ? daysBetween(lastBackup.slice(0, 10), d) : null;
  const backupNote = hasData && (backupDays === null || backupDays >= 7)
    ? `<a class="notice notice-warn" href="#/settings">${ic('data')}<div><b>${esc(backupDays === null ? t('backup_never') : t('backup_due', { days: backupDays }))}</b><span>${esc(t('backup_now'))} ${ic(isUr() ? 'back' : 'chevron')}</span></div></a>`
    : '';

  main.innerHTML = `
  <section class="hero card-hero">
    <div class="hero-deco" aria-hidden="true">
      <span class="deco d1">${ic('sprout')}</span><span class="deco d2">${ic('truck')}</span><span class="deco d3">${ic('bag')}</span>
    </div>
    <div class="hero-top">
      <div>
        <div class="hero-greet">${esc(t('greet', { name: name || greeting() }))}</div>
        <div class="hero-sub">${esc(fmtDate(d))} · ${esc(t('home_sub'))}</div>
      </div>
    </div>
    <div class="hero-kpis">
      <div class="kpi"><div class="kpi-v" data-count="${todayTotal}" data-kind="money">${money(0)}</div><div class="kpi-l">${esc(t('today_sales'))}</div></div>
      <div class="kpi"><div class="kpi-v" data-count="${todayCommission}" data-kind="money">${money(0)}</div><div class="kpi-l">${esc(t('today_commission'))}</div></div>
      <div class="kpi"><div class="kpi-v" data-count="${todayLots.length}">0</div><div class="kpi-l">${esc(t('today_arrivals'))}</div></div>
    </div>
  </section>

  ${rates.length ? ticker(rates, t('ticker_prefix')) : `<a class="notice notice-soft" href="#/rates">${ic('tag')}<span>${esc(t('no_rate_today'))}</span> ${ic(isUr() ? 'back' : 'chevron')}</a>`}

  ${backupNote}

  <div class="stat-grid">
    <div class="stat tone-green"><div class="stat-ic">${ic('cash')}</div><div class="stat-v" data-count="${cash}" data-kind="money">${money(0)}</div><div class="stat-l">${esc(t('cash_in_hand'))}</div></div>
    <div class="stat tone-amber"><div class="stat-ic">${ic('store')}</div><div class="stat-v" data-count="${tot.receivable}" data-kind="money">${money(0)}</div><div class="stat-l">${esc(t('receivable'))}</div></div>
    <div class="stat tone-rose"><div class="stat-ic">${ic('sprout')}</div><div class="stat-v" data-count="${tot.payable}" data-kind="money">${money(0)}</div><div class="stat-l">${esc(t('payable'))}</div></div>
    <div class="stat tone-blue"><div class="stat-ic">${ic('truck')}</div><div class="stat-v" data-count="${open.length}">0</div><div class="stat-l">${esc(t('open_lots'))}</div></div>
  </div>

  <div class="quick">
    <button type="button" class="quick-btn q-green" data-act="arrival"><span class="qi">${ic('truck')}</span><span>${esc(t('act_arrival'))}</span></button>
    <button type="button" class="quick-btn q-amber" data-act="sale"><span class="qi">${ic('receipt')}</span><span>${esc(t('act_sale'))}</span></button>
    <button type="button" class="quick-btn q-blue" data-act="receive"><span class="qi">${ic('down')}</span><span>${esc(t('act_receive'))}</span></button>
    <button type="button" class="quick-btn q-rose" data-act="pay"><span class="qi">${ic('up')}</span><span>${esc(t('act_pay_farmer'))}</span></button>
  </div>

  <section class="card chart-card">
    ${sectionTitle(t('week_sales'))}
    ${barChart(series, labels)}
  </section>

  <div class="two-col">
    <section class="card">
      ${sectionTitle(t('overdue_buyers'), `<a class="link-more" href="#/parties/buyers">${esc(t('buyers'))} ${ic(isUr() ? 'back' : 'chevron')}</a>`)}
      ${dues.length ? dues.map(({ b, bal, aging }) => {
        const oldest = aging.open.length ? Math.max(...aging.open.map((o) => o.days)) : 0;
        const over = b.creditLimit && bal > b.creditLimit;
        return `<a class="row-link" href="#/party/${esc(b.id)}">${avatar(b.name)}
          <span class="row-main"><span class="row-title">${esc(b.name)}</span>
            <span class="row-sub">${oldest > 0 ? esc(t('days_ago', { n: oldest })) : ''}${over ? ` · <span class="text-rose">${esc(t('over_limit'))}</span>` : ''}</span></span>
          <span class="row-amt">${money(bal)}</span></a>`;
      }).join('') : empty(t('nothing_yet'), 'store')}
    </section>
    <section class="card">
      ${sectionTitle(t('top_dues'), `<a class="link-more" href="#/parties/farmers">${esc(t('farmers'))} ${ic(isUr() ? 'back' : 'chevron')}</a>`)}
      ${farmerDues.length ? farmerDues.map(({ f, bal }) => `<a class="row-link" href="#/party/${esc(f.id)}">${avatar(f.name)}
          <span class="row-main"><span class="row-title">${esc(f.name)}</span><span class="row-sub">${esc(f.village || '')}</span></span>
          <span class="row-amt">${money(bal)}</span></a>`).join('') : empty(t('nothing_yet'), 'sprout')}
    </section>
  </div>

  <section class="card">
    ${sectionTitle(t('sales'), `<a class="link-more" href="#/sales">${esc(t('sales'))} ${ic(isUr() ? 'back' : 'chevron')}</a>`)}
    ${S.sales.slice(0, 4).map((s) => `<a class="row-link" href="#/sales/${esc(s.id)}">
        <span class="row-main"><span class="row-title">${esc(s.number)} · ${esc(party(s.buyerId))}</span><span class="row-sub">${esc(fmtDate(s.date))}${s.void ? ` · ${esc(t('voided'))}` : ''}</span></span>
        <span class="row-amt ${s.void ? 'text-muted strike' : ''}">${money(s.total)}</span></a>`).join('') || empty(t('sale_empty'), 'receipt')}
  </section>

  <div class="quick-help small text-muted">${esc(t('pwa_hint'))}</div>`;

  main.querySelector('[data-act="arrival"]').addEventListener('click', () => openArrivalForm({ onSaved: rerender }));
  main.querySelector('[data-act="sale"]').addEventListener('click', () => openSaleForm({ onSaved: rerender }));
  main.querySelector('[data-act="receive"]').addEventListener('click', () => openReceive({ onSaved: rerender }));
  main.querySelector('[data-act="pay"]').addEventListener('click', () => openPayFarmer({ onSaved: rerender }));
  countUp(main);
}

function party(id) {
  return S.parties.find((p) => p.id === id)?.name || '';
}
