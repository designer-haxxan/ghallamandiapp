// Reports: commission, lot-wise, farmer dues, buyer aging and expenses, for any period. Each one exports to CSV.
import { t, itemName, unitLabel } from '../i18n.js';
import { S, salesBetween, party, commodity, lotRemaining, sold, farmers, buyers, balance, buyerAging, cashRows, EXPENSE_CATS } from '../store.js';
import { esc, fmtNum, fmtQty, fmtDate, today, monthStart, addDays, toCSV, download, round2 } from '../util.js';
import { ic, money, page, empty, countUp, toast } from '../ui.js';
import { lotQtyLabel } from './lots.js';

const CAT_KEY = { labour: 'cat_labour', transport: 'cat_transport', food: 'cat_food', rent: 'cat_rent', phone: 'cat_phone', power: 'cat_power', fee: 'cat_fee', other: 'cat_other' };
const REPORTS = ['commission', 'lots', 'dues', 'aging', 'expenses', 'cash'];
const REPORT_TITLE = { commission: 'r_commission', lots: 'r_lots', dues: 'r_farmer_dues', aging: 'r_buyer_aging', expenses: 'r_expenses', cash: 'r_cash' };

export function render(main, { params }) {
  let kind = REPORTS.includes(params[0]) ? params[0] : 'commission';
  let range = { from: monthStart(), to: today() };
  let csv = null;

  const body = () => {
    const sales = salesBetween(range.from, range.to);
    switch (kind) {
      case 'commission': return commission(sales);
      case 'lots': return lots();
      case 'dues': return dues();
      case 'aging': return aging();
      case 'expenses': return expenses();
      default: return cash();
    }
  };

  const draw = () => {
    const b = body();
    csv = b.csv;
    main.querySelector('#rep-body').innerHTML = b.html;
    main.querySelector('[data-csv]').disabled = !csv;
    countUp(main.querySelector('#rep-body'));
  };

  main.innerHTML = page(t('nav_reports'), `
    <div class="chips rep-tabs" role="tablist">${REPORTS.map((k) => `<button type="button" class="chip ${k === kind ? 'is-on' : ''}" data-kind="${k}">${esc(t(REPORT_TITLE[k]))}</button>`).join('')}</div>
    <form class="card range-card" novalidate>
      <div class="range-grid">
        <label class="mini"><span>${esc(t('from'))}</span><input type="date" class="input" name="from" value="${esc(range.from)}"></label>
        <label class="mini"><span>${esc(t('to'))}</span><input type="date" class="input" name="to" value="${esc(range.to)}"></label>
      </div>
      <div class="chips">
        <button type="button" class="chip" data-r="today">${esc(t('today'))}</button>
        <button type="button" class="chip is-on" data-r="month">${esc(t('month'))}</button>
        <button type="button" class="chip" data-r="all">${esc(t('alltime'))}</button>
        <button type="button" class="btn btn-soft btn-sm csv-btn" data-csv>${ic('download')} ${esc(t('export_csv'))}</button>
      </div>
    </form>
    <div id="rep-body"></div>`);

  main.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.kind;
    main.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('is-on', x === b));
    draw();
  }));
  const form = main.querySelector('form.range-card');
  form.addEventListener('input', () => { range = { from: form.from.value || '2000-01-01', to: form.to.value || today() }; draw(); });
  main.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.r;
    range = k === 'today' ? { from: today(), to: today() } : k === 'month' ? { from: monthStart(), to: today() } : { from: '2000-01-01', to: addDays(today(), 1) };
    form.from.value = range.from; form.to.value = range.to;
    main.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('is-on', x === b));
    draw();
  }));
  main.querySelector('[data-csv]').addEventListener('click', () => {
    if (!csv) return;
    download(`ghallamandi-${kind}-${range.from}-${range.to}.csv`, toCSV(csv), 'text/csv');
    toast(t('export_csv'));
  });
  draw();

  function commission(sales) {
    const total = round2(sales.reduce((n, s) => n + s.total, 0));
    const comm = round2(sales.reduce((n, s) => n + s.commission, 0));
    const fee = round2(sales.reduce((n, s) => n + s.marketFee, 0));
    const farmer = round2(sales.reduce((n, s) => n + s.farmerNet, 0));
    const ownExp = round2(S.expenses.filter((x) => !x.void && !x.chargeFarmer && x.date >= range.from && x.date <= range.to).reduce((n, x) => n + x.amount, 0));
    const profit = round2(comm - ownExp);
    // Commission per item.
    const byItem = new Map();
    for (const s of sales) for (const l of s.lines) {
      const r = byItem.get(l.commodityId) || { name: itemName(commodity(l.commodityId)) || l.commodityName, qty: 0, unit: l.unit, amount: 0, comm: 0, bills: new Set() };
      r.qty += l.qty; r.amount += l.amount; r.comm += l.commission; r.bills.add(s.id);
      byItem.set(l.commodityId, r);
    }
    const rows = [...byItem.values()].sort((a, b) => b.amount - a.amount);
    const html = `<div class="kpi-grid">
        <div class="kpi-card tone-green"><span>${esc(t('total_commission'))}</span><b data-count="${comm}" data-kind="money">0</b></div>
        <div class="kpi-card tone-blue"><span>${esc(t('total_sales'))}</span><b data-count="${total}" data-kind="money">0</b></div>
        <div class="kpi-card tone-amber"><span>${esc(t('total_fee'))}</span><b data-count="${fee}" data-kind="money">0</b></div>
        <div class="kpi-card tone-rose"><span>${esc(t('net_profit'))}</span><b data-count="${profit}" data-kind="money">0</b><small>${esc(t('net_profit_help'))}</small></div>
      </div>
      <div class="card">${table([t('by_commodity'), t('qty_sold'), t('total_sales'), t('total_commission'), t('bills')],
        rows.map((r) => [r.name, `${fmtQty(r.qty)} ${unitLabel(r.unit)}`, fmtNum(r.amount), fmtNum(r.comm), r.bills.size]))}</div>
      <div class="card small muted">${esc(t('farmer_gets'))}: <b>${money(farmer)}</b></div>`;
    return {
      html: sales.length ? html : empty(t('r_empty'), 'chart'),
      csv: sales.length ? [[t('by_commodity'), t('qty_sold'), t('total_sales'), t('total_commission'), t('bills')], ...rows.map((r) => [r.name, `${r.qty} ${r.unit}`, r.amount, r.comm, r.bills.size])] : null,
    };
  }

  function lots() {
    const rows = S.lots.filter((l) => l.date >= range.from && l.date <= range.to);
    const data = rows.map((l) => {
      const f = party(l.farmerId);
      const soldQ = sold(l.id);
      const amt = S.sales.filter((s) => !s.void).reduce((n, s) => n + s.lines.filter((x) => x.lotId === l.id).reduce((a, x) => a + x.amount, 0), 0);
      const net = S.sales.filter((s) => !s.void).reduce((n, s) => n + s.lines.filter((x) => x.lotId === l.id).reduce((a, x) => a + x.farmerNet, 0), 0);
      return [l.number, fmtDate(l.date), f?.name || '', itemName(commodity(l.commodityId)), lotQtyLabel(l), fmtQty(lotRemaining(l)), fmtNum(amt), fmtNum(net)];
    });
    const heads = [t('lot_no'), t('date'), t('farmer'), t('commodity'), t('net_weight'), t('remaining'), t('total_sales'), t('farmer_gets')];
    return {
      html: rows.length ? `<div class="card">${table(heads, data)}</div>` : empty(t('r_empty'), 'truck'),
      csv: rows.length ? [heads, ...data] : null,
    };
  }

  function dues() {
    const list = farmers().map((f) => ({ f, bal: balance(f.id) })).filter((x) => Math.abs(x.bal) > 0.005).sort((a, b) => b.bal - a.bal);
    const heads = [t('farmer'), t('village'), t('phone'), t('you_owe')];
    const data = list.map((x) => [x.f.name, x.f.village || '', x.f.phone || '', fmtNum(x.bal)]);
    const total = round2(list.reduce((n, x) => n + Math.max(0, x.bal), 0));
    return {
      html: list.length ? `<div class="card kpi-line"><span>${esc(t('payable'))}</span><b data-count="${total}" data-kind="money">0</b></div><div class="card">${table(heads, data)}</div>` : empty(t('r_empty'), 'sprout'),
      csv: list.length ? [heads, ...data] : null,
    };
  }

  function aging() {
    const list = buyers().map((b) => ({ b, bal: balance(b.id), ag: buyerAging(b.id) })).filter((x) => Math.abs(x.bal) > 0.005);
    const bucket = (lo, hi, open) => round2(open.filter((o) => o.days >= lo && o.days <= hi).reduce((n, o) => n + o.due, 0));
    const data = list.map(({ b, bal, ag }) => [b.name, b.village || '', b.phone || '', fmtNum(bucket(0, 7, ag.open)), fmtNum(bucket(8, 30, ag.open)), fmtNum(bucket(31, 99999, ag.open)), fmtNum(bal)]);
    const heads = [t('buyer'), t('village'), t('phone'), t('age_0_7'), t('age_8_30'), t('age_30p'), t('balance')];
    return {
      html: list.length ? `<div class="card">${table(heads, data)}</div>` : empty(t('r_empty'), 'store'),
      csv: list.length ? [heads, ...data] : null,
    };
  }

  function expenses() {
    const rows = S.expenses.filter((x) => !x.void && x.date >= range.from && x.date <= range.to);
    const byCat = new Map(EXPENSE_CATS.map((c) => [c, 0]));
    rows.forEach((x) => byCat.set(x.category, round2((byCat.get(x.category) || 0) + x.amount)));
    const data = [...byCat.entries()].filter(([, v]) => v > 0).map(([c, v]) => [t(CAT_KEY[c]), fmtNum(v)]);
    const heads = [t('category'), t('amount')];
    const total = round2(rows.reduce((n, x) => n + x.amount, 0));
    return {
      html: rows.length ? `<div class="card kpi-line"><span>${esc(t('expenses'))}</span><b data-count="${total}" data-kind="money">0</b></div><div class="card">${table(heads, data)}</div>` : empty(t('r_empty'), 'wallet'),
      csv: rows.length ? [heads, ...data] : null,
    };
  }

  function cash() {
    const cb = cashRows(range.from, range.to);
    const heads = [t('date'), t('kind_sale'), t('number_short'), t('name'), t('cash_in'), t('cash_out'), t('balance')];
    const data = cb.rows.map((r) => [fmtDate(r.date), t('kind_' + r.kind), r.number || '', r.kind === 'expense' ? t(CAT_KEY[r.category] || 'cat_other') : (party(r.partyId)?.name || ''), fmtNum(r.in), fmtNum(r.out), fmtNum(r.running)]);
    return {
      html: cb.rows.length ? `<div class="card kpi-line"><span>${esc(t('closing_cash'))}</span><b data-count="${cb.closing}" data-kind="money">0</b></div><div class="card">${table(heads, data)}</div>` : empty(t('cash_empty'), 'cash'),
      csv: cb.rows.length ? [heads, ...data] : null,
    };
  }
}

function table(heads, rows) {
  return `<div class="table-wrap"><table class="rtable"><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
