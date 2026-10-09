// Arrivals (aamad): record each truck with bags and weights, see what is left to sell, print the slip.
import { t, itemName, unitLabel } from '../i18n.js';
import { S, farmers, activeCommodities, commodity, party, lotById, lotRemaining, lotStatus, isWeight, fromBase, sold, createLot, updateLot, deleteLot } from '../store.js';
import { esc, fmtNum, fmtQty, fmtDate, num, norm, today } from '../util.js';
import { ic, money, formSheet, confirmBox, toastError, toast, statusPill, empty, page, sectionTitle, errText } from '../ui.js';
import { printArrival } from '../print.js';
import { openSaleForm } from './sales.js';
import { openPartyForm } from './parties.js';
import { go } from '../router.js';

const pct = (lot) => (lot.baseQty ? Math.min(100, (sold(lot.id) / lot.baseQty) * 100) : 0);

// Quantity text in the item's own unit, e.g. "12.5 maund (500 kg)".
export function lotQtyLabel(lot) {
  if (!isWeight(lot.unit)) return `${fmtQty(lot.count)} ${unitLabel(lot.unit)}`;
  const main = lot.unit === 'maund' ? `${fmtQty(fromBase(lot.netKg, 'maund'))} ${unitLabel('maund')}` : `${fmtQty(lot.netKg)} ${unitLabel('kg')}`;
  return lot.unit === 'maund' ? `${main} (${fmtQty(lot.netKg)} ${unitLabel('kg')})` : main;
}
export const lotRemainingLabel = (lot) => {
  const rem = lotRemaining(lot);
  if (!isWeight(lot.unit)) return `${fmtQty(rem)} ${unitLabel(lot.unit)}`;
  return lot.unit === 'maund' ? `${fmtQty(fromBase(rem, 'maund'))} ${unitLabel('maund')}` : `${fmtQty(rem)} ${unitLabel('kg')}`;
};

export async function render(main, { params, rerender, title }) {
  const [id, sub] = params;
  if (id === 'new') return renderNew(main);
  if (id && sub === 'edit') return renderEdit(main, id);
  if (id) return renderDetail(main, id, title);
  return renderList(main);
}

function renderList(main) {
  main.innerHTML = page(t('arrivals'), `
    <div class="toolbar">
      <div class="search-box">${ic('search')}<input type="search" class="q" placeholder="${esc(t('search'))}" autocomplete="off"></div>
      <div class="chips" role="tablist">
        <button type="button" class="chip is-on" data-f="all">${esc(t('all'))}</button>
        <button type="button" class="chip" data-f="open">${esc(t('filter_open'))}</button>
        <button type="button" class="chip" data-f="sold">${esc(t('status_sold'))}</button>
      </div>
    </div>
    <div class="list" id="lot-list"></div>
    <a class="fab" href="#/lots/new" aria-label="${esc(t('arrival_new'))}">${ic('plus')}<span>${esc(t('arrival_new'))}</span></a>`);
  let filter = 'all';
  const draw = () => {
    const q = norm(main.querySelector('.q').value);
    const rows = S.lots.filter((l) => {
      const st = lotStatus(l);
      if (filter === 'open' && st === 'sold') return false;
      if (filter === 'sold' && st !== 'sold') return false;
      if (!q) return true;
      const f = party(l.farmerId);
      return norm(`${l.number} ${f?.name || ''} ${itemName(commodity(l.commodityId))} ${l.vehicle || ''}`).includes(q);
    });
    main.querySelector('#lot-list').innerHTML = rows.length ? rows.map((l, i) => {
      const f = party(l.farmerId);
      const c = commodity(l.commodityId);
      return `<a class="lot-card" href="#/lots/${esc(l.id)}" style="--d:${Math.min(i, 10) * 40}ms">
        <div class="lot-top"><span class="lot-no">${esc(l.number)}</span>${statusPill(lotStatus(l))}</div>
        <div class="lot-title">${esc(itemName(c))} <span class="text-muted">· ${esc(f?.name || '')}</span></div>
        <div class="lot-meta"><span>${esc(fmtDate(l.date))}</span>${l.vehicle ? `<span>${ic('truck')} ${esc(l.vehicle)}</span>` : ''}<span>${esc(lotQtyLabel(l))}</span></div>
        <div class="progress" aria-label="${Math.round(pct(l))}%"><span style="--w:${pct(l).toFixed(1)}%"></span></div>
        <div class="lot-foot"><span>${esc(t('remaining'))}: <b>${esc(lotRemainingLabel(l))}</b></span><span>${esc(t('sold'))}: ${Math.round(pct(l))}%</span></div>
      </a>`;
    }).join('') : empty(S.lots.length ? t('no_open_lots') : t('arrivals_empty'), 'truck',
      S.lots.length ? '' : `<a class="btn btn-primary" href="#/lots/new">${esc(t('arrival_new'))}</a>`);
  };
  main.querySelector('.q').addEventListener('input', draw);
  main.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    main.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('is-on', x === b));
    draw();
  }));
  draw();
}

function renderNew(main) {
  // Opens the form as a full page (the bottom nav stays visible).
  main.innerHTML = page(t('arrival_new'), `<div class="card form-card" id="lot-form-host"></div>`, '', '#/lots');
  const host = main.querySelector('#lot-form-host');
  mountArrivalForm(host, null, { onSaved: (lot) => { toast(t('arrival_saved')); go(`#/lots/${lot.id}`); } });
}

function renderEdit(main, id) {
  const lot = lotById(id);
  if (!lot) return main.innerHTML = empty(t('nothing_selected'), 'truck');
  main.innerHTML = page(t('arrival_edit'), `<div class="card form-card" id="lot-form-host"></div>`, '', `#/lots/${id}`);
  mountArrivalForm(main.querySelector('#lot-form-host'), lot, { onSaved: () => { toast(t('saved')); go(`#/lots/${id}`); } });
}

// Standalone sheet version, used from the Home screen's "New arrival" action.
export function openArrivalForm({ onSaved } = {}) {
  return formSheet({
    title: t('arrival_new'), submitLabel: t('save'), wide: true,
    body: arrivalFields(null),
    onMount: (el) => wireArrivalForm(el),
    onSubmit: async (v) => {
      const lot = await createLot(payload(v));
      toast(t('arrival_saved'));
      onSaved?.(lot);
      return lot;
    },
  });
}

function mountArrivalForm(host, lot, { onSaved }) {
  host.innerHTML = `<form class="sheet-form" novalidate>${arrivalFields(lot)}
    <div class="form-error d-none" role="alert"></div>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-back>${esc(t('cancel'))}</button>
    <button type="submit" class="btn btn-primary btn-submit"><span>${esc(t('save'))}</span></button></div></form>`;
  const form = host.querySelector('form');
  wireArrivalForm(host);
  host.querySelector('[data-back]').addEventListener('click', () => go(lot ? `#/lots/${lot.id}` : '#/lots'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = host.querySelector('.form-error');
    err.classList.add('d-none');
    const btn = host.querySelector('.btn-submit');
    btn.disabled = true;
    try {
      const v = Object.fromEntries(new FormData(form).entries());
      const saved = lot ? await updateLot(lot.id, payload(v)) : await createLot(payload(v));
      onSaved?.(saved);
    } catch (ex) {
      console.warn(ex);
      err.textContent = errText(ex);
      err.classList.remove('d-none');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { btn.disabled = false; }
  });
}

function payload(v) {
  return {
    farmerId: v.farmerId, commodityId: v.commodityId, date: v.date, vehicle: v.vehicle, driver: v.driver,
    bags: v.bags, grossKg: v.grossKg, tarePerBagKg: v.tarePerBagKg, count: v.count, expectRate: v.expectRate, notes: v.notes,
  };
}

const farmerOptions = (selected) => `<option value="">${esc(t('farmer'))}…</option>${farmers().map((f) => `<option value="${esc(f.id)}" ${f.id === selected ? 'selected' : ''}>${esc(f.name)}${f.village ? ' · ' + esc(f.village) : ''}</option>`).join('')}<option value="__new">＋ ${esc(t('party_farmer'))}</option>`;
const commodityOptions = (selected) => `<option value="">${esc(t('commodity'))}…</option>${activeCommodities().map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${esc(itemName(c))} (${esc(unitLabel(c.unit))})</option>`).join('')}`;

function arrivalFields(lot) {
  const c = lot ? commodity(lot.commodityId) : null;
  const w = c ? isWeight(c.unit) : true;
  const date = lot?.date || today();
  return `<div class="field-grid">
    <div class="field span-2"><label>${esc(t('farmer'))}</label><select name="farmerId" class="select" required>${farmerOptions(lot?.farmerId)}</select></div>
    <div class="field"><label>${esc(t('commodity'))}</label><select name="commodityId" class="select" required>${commodityOptions(lot?.commodityId)}</select></div>
    <div class="field"><label>${esc(t('date'))}</label><input type="date" name="date" class="input" value="${esc(date)}" required></div>
    <div class="field"><label>${esc(t('vehicle'))}</label><input name="vehicle" class="input" value="${esc(lot?.vehicle || '')}" autocomplete="off" placeholder="LEB-1234"></div>
    <div class="field"><label>${esc(t('driver'))}</label><input name="driver" class="input" value="${esc(lot?.driver || '')}" autocomplete="off"></div>
    <div class="field weight-only ${w ? '' : 'hide'}"><label>${esc(t('bags'))}</label><input name="bags" class="input num-in" inputmode="decimal" value="${esc(lot?.bags ?? '')}" ${w ? 'data-req' : ''}></div>
    <div class="field weight-only ${w ? '' : 'hide'}"><label>${esc(t('gross_kg'))}</label><input name="grossKg" class="input num-in" inputmode="decimal" value="${esc(lot?.grossKg ?? '')}" ${w ? 'data-req' : ''}></div>
    <div class="field weight-only ${w ? '' : 'hide'}"><label>${esc(t('tare_per_bag'))}</label><input name="tarePerBagKg" class="input num-in" inputmode="decimal" value="${esc(lot ? lot.tarePerBagKg ?? '' : S.settings.tarePerBagKg)}"></div>
    <div class="field count-only ${w ? 'hide' : ''}"><label>${esc(t('count_qty'))}</label><input name="count" class="input num-in" inputmode="decimal" value="${esc(lot?.count ?? '')}" ${w ? '' : 'data-req'}></div>
    <div class="field"><label>${esc(t('farmer_expect'))}</label><input name="expectRate" class="input num-in" inputmode="decimal" value="${esc(lot?.expectRate ?? '')}"></div>
    <div class="field span-2"><label>${esc(t('notes'))}</label><input name="notes" class="input" value="${esc(lot?.notes || '')}"></div>
  </div>
  <div class="weigh-box weight-only ${w ? '' : 'hide'}">
    <div class="weigh-help">${esc(t('weigh_help'))}</div>
    <div class="weigh-row"><div><span class="muted">${esc(t('tare_total'))}</span><b class="tare-out">0</b></div>
      <div class="weigh-net"><span>${esc(t('net_weight'))}</span><b class="net-out">0</b><span class="maund-out muted"></span></div></div>
  </div>`;
}

function wireArrivalForm(el) {
  const q = (s) => el.querySelector(s);
  // Shows bag/weight fields for weight items and the count field for count items.
  const sync = () => {
    const com = commodity(q('[name=commodityId]').value);
    const w = com ? isWeight(com.unit) : true;
    el.querySelectorAll('.weight-only').forEach((x) => x.classList.toggle('hide', !w));
    el.querySelectorAll('.count-only').forEach((x) => x.classList.toggle('hide', w));
    el.querySelectorAll('[name=bags],[name=grossKg]').forEach((x) => x.toggleAttribute('data-req', w));
    el.querySelector('[name=count]').toggleAttribute('data-req', !w);
    updateNet();
  };
  // Live deduction and net weight, so the weigh-in is checked before the slip is printed.
  const updateNet = () => {
    const out = el.querySelector('.net-out');
    if (!out) return;
    const bags = num(q('[name=bags]').value, 0);
    const gross = num(q('[name=grossKg]').value, 0);
    const tare = num(q('[name=tarePerBagKg]').value, 0);
    const tot = Math.round(bags * tare * 100) / 100;
    const net = Math.round((gross - tot) * 100) / 100;
    el.querySelector('.tare-out').textContent = `${fmtQty(tot)} kg`;
    out.textContent = net > 0 ? `${fmtQty(net)} kg` : '—';
    const com = commodity(q('[name=commodityId]').value);
    el.querySelector('.maund-out').textContent = com?.unit === 'maund' && net > 0 ? `= ${fmtQty(net / 40)} ${unitLabel('maund')}` : '';
  };
  el.querySelectorAll('[name=bags],[name=grossKg],[name=tarePerBagKg]').forEach((x) => x.addEventListener('input', updateNet));
  q('[name=commodityId]').addEventListener('change', sync);
  q('[name=farmerId]').addEventListener('change', async (e) => {
    if (e.target.value !== '__new') return;
    e.target.value = '';
    const p = await openPartyForm({ type: 'farmer' });
    if (!p) return;
    const sel = q('[name=farmerId]');
    sel.innerHTML = farmerOptions(p.id);
    sel.value = p.id;
  });
  sync();
}

async function renderDetail(main, id, title) {
  const lot = lotById(id);
  if (!lot) return main.innerHTML = empty(t('nothing_selected'), 'truck', `<a class="btn btn-ghost" href="#/lots">${esc(t('back'))}</a>`);
  title?.(lot.number);
  const f = party(lot.farmerId);
  const c = commodity(lot.commodityId);
  const w = isWeight(lot.unit);
  const salesOfLot = S.sales.filter((s) => s.lines.some((l) => l.lotId === lot.id));
  const soldQty = sold(lot.id);
  const hasSales = salesOfLot.some((s) => !s.void);
  const rem = lotRemaining(lot);

  main.innerHTML = page(lot.number, `
    <div class="detail-hero card">
      <div class="detail-top">${statusPill(lotStatus(lot))}<span class="muted">${esc(fmtDate(lot.date))}</span></div>
      <div class="detail-title">${esc(itemName(c))}</div>
      <div class="detail-sub">${ic('sprout')} ${esc(f?.name || '')}${f?.village ? ' · ' + esc(f.village) : ''}</div>
      <div class="big-progress"><div class="big-progress-track"><span style="--w:${pct(lot).toFixed(1)}%"></span></div>
        <div class="big-progress-l"><span>${esc(t('sold'))}: <b>${esc(lotQtyLabel({ ...lot, baseQty: soldQty, netKg: w ? soldQty : null, count: w ? null : soldQty }))}</b></span>
        <span>${esc(t('remaining'))}: <b>${esc(lotRemainingLabel(lot))}</b></span></div></div>
    </div>
    <div class="card">
      <dl class="kv">
        <dt>${esc(t('lot_no'))}</dt><dd>${esc(lot.number)}</dd>
        ${lot.vehicle ? `<dt>${esc(t('vehicle'))}</dt><dd>${esc(lot.vehicle)}${lot.driver ? ` · ${esc(lot.driver)}` : ''}</dd>` : ''}
        ${w ? `<dt>${esc(t('bags'))}</dt><dd>${fmtNum(lot.bags)}</dd>
        <dt>${esc(t('gross_kg'))}</dt><dd>${fmtQty(lot.grossKg)} kg</dd>
        <dt>${esc(t('tare_total'))}</dt><dd>${fmtQty(lot.tareKg)} kg <span class="muted">(${fmtQty(lot.tarePerBagKg)} × ${fmtNum(lot.bags)})</span></dd>
        <dt>${esc(t('net_weight'))}</dt><dd class="strong">${esc(lotQtyLabel(lot))}</dd>` : `<dt>${esc(t('count_qty'))}</dt><dd class="strong">${esc(lotQtyLabel(lot))}</dd>`}
        ${lot.expectRate ? `<dt>${esc(t('farmer_expect'))}</dt><dd>${money(lot.expectRate)}</dd>` : ''}
        ${lot.notes ? `<dt>${esc(t('notes'))}</dt><dd>${esc(lot.notes)}</dd>` : ''}
      </dl>
    </div>
    <div class="action-row">
      ${rem > 0.0005 ? `<button type="button" class="btn btn-primary btn-lg" data-sell>${ic('receipt')} ${esc(t('act_sale'))}</button>` : ''}
      <button type="button" class="btn btn-ghost" data-print>${ic('print')} ${esc(t('print'))}</button>
      <a class="btn btn-ghost" href="#/lots/${esc(lot.id)}/edit">${ic('edit')} ${esc(t('edit'))}</a>
      ${!hasSales ? `<button type="button" class="btn btn-ghost btn-danger-ghost" data-del>${ic('trash')} ${esc(t('delete'))}</button>` : ''}
    </div>
    ${sectionTitle(t('lot_sales'))}
    <div class="card list-card">${salesOfLot.length ? salesOfLot.map((s) => {
      const line = s.lines.filter((l) => l.lotId === lot.id).reduce((a, l) => ({ qty: a.qty + l.consumed, amt: a.amt + l.amount, farmerNet: a.farmerNet + l.farmerNet, comm: a.comm + l.commission }), { qty: 0, amt: 0, farmerNet: 0, comm: 0 });
      return `<a class="row-link ${s.void ? 'is-void' : ''}" href="#/sales/${esc(s.id)}">
        <span class="row-main"><span class="row-title">${esc(s.number)} · ${esc(party(s.buyerId)?.name || '')}</span>
          <span class="row-sub">${esc(fmtDate(s.date))} · ${esc(t('commission'))} ${money(line.comm)} · ${esc(t('farmer_gets'))} ${money(line.farmerNet)}</span></span>
        <span class="row-amt">${money(line.amt)}</span></a>`;
    }).join('') : `<div class="empty-state small">${esc(t('nothing_yet'))}</div>`}</div>`, '', '#/lots');

  main.querySelector('[data-print]')?.addEventListener('click', () => printArrival(lot));
  main.querySelector('[data-sell]')?.addEventListener('click', () => openSaleForm({ preLot: lot, onSaved: () => go(`#/lots/${lot.id}`) }));
  main.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!await confirmBox(t('confirm_delete'), { okLabel: t('delete'), danger: true })) return;
    try { await deleteLot(lot.id); toast(t('deleted')); go('#/lots'); } catch (e) { toastError(e); }
  });
}

