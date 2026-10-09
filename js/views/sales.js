// Sales (bills): sell lots to buyers, see commission and what each farmer gets, take part-payment, cancel with a reason.
import { t, itemName, unitLabel } from '../i18n.js';
import { S, buyers, commodity, party, lotById, lotRemaining, fromBase, openLots, createSale, saleById, voidDoc, computeLine, balance, rateFor, lastRateFor, buyerAging } from '../store.js';
import { esc, fmtNum, fmtQty, fmtDate, num, norm, today, round2 } from '../util.js';
import { ic, money, page, empty, pickSheet, formSheet, confirmBox, toast, toastError, errText, sectionTitle, countUp } from '../ui.js';
import { printSale } from '../print.js';
import { openPartyForm } from './parties.js';
import { go } from '../router.js';

// Entry point used by Home and Arrivals: opens the full-page bill composer.
export function openSaleForm({ preLot } = {}) {
  go(preLot ? `#/sales/new/${preLot.id}` : '#/sales/new');
}

export async function render(main, { params, rerender, title }) {
  const [id, sub] = params;
  if (id === 'new') return renderComposer(main, sub || null);
  if (id) return renderDetail(main, id, title);
  return renderList(main);
}

function renderList(main) {
  main.innerHTML = page(t('sales'), `
    <div class="toolbar"><div class="search-box">${ic('search')}<input type="search" class="q" placeholder="${esc(t('search'))}" autocomplete="off"></div></div>
    <div class="list list-card" id="sale-list"></div>
    <a class="fab" href="#/sales/new">${ic('plus')}<span>${esc(t('sale_new'))}</span></a>`);
  const draw = () => {
    const q = norm(main.querySelector('.q').value);
    const rows = S.sales.filter((s) => !q || norm(`${s.number} ${party(s.buyerId)?.name || ''} ${s.lines.map((l) => l.lotNumber).join(' ')}`).includes(q));
    main.querySelector('#sale-list').innerHTML = rows.length ? rows.map((s, i) => `
      <a class="row-link ${s.void ? 'is-void' : ''}" href="#/sales/${esc(s.id)}" style="--d:${Math.min(i, 10) * 35}ms">
        <span class="bill-ic">${ic('receipt')}</span>
        <span class="row-main"><span class="row-title">${esc(s.number)} · ${esc(party(s.buyerId)?.name || '')}</span>
          <span class="row-sub">${esc(fmtDate(s.date))} · ${s.lines.length} ${esc(t('lines').toLowerCase())}${s.void ? ` · <b class="text-rose">${esc(t('voided'))}</b>` : ''}</span></span>
        <span class="row-amt ${s.void ? 'strike' : ''}">${money(s.total)}</span></a>`).join('') : empty(t('sale_empty'), 'receipt');
  };
  main.querySelector('.q').addEventListener('input', draw);
  draw();
}

function renderComposer(main, lotId) {
  const state = { buyerId: '', date: today(), lines: [], received: '', notes: '' };
  main.innerHTML = page(t('sale_new'), `
    <form class="composer" novalidate>
      <section class="card">
        <div class="field-grid">
          <div class="field span-2"><label>${esc(t('buyer'))}</label>
            <select name="buyerId" class="select"><option value="">${esc(t('buyer'))}…</option>${buyers().map((b) => `<option value="${esc(b.id)}">${esc(b.name)}${b.village ? ' · ' + esc(b.village) : ''}</option>`).join('')}<option value="__new">＋ ${esc(t('party_buyer'))}</option></select>
            <div class="buyer-info small"></div></div>
          <div class="field"><label>${esc(t('date'))}</label><input type="date" name="date" class="input" value="${today()}"></div>
        </div>
      </section>
      <section class="card">
        ${sectionTitle(t('lines'), `<button type="button" class="btn btn-soft btn-sm" data-add>${ic('plus')} ${esc(t('add_lot'))}</button>`)}
        <div class="lines"></div>
      </section>
      <section class="card totals-card">
        <div class="tot-row"><span>${esc(t('bill_total'))}</span><b class="tot-amt">0</b></div>
        <div class="tot-row muted"><span>${esc(t('commission'))}</span><span class="tot-comm">0</span></div>
        <div class="tot-row muted"><span>${esc(t('market_fee'))}</span><span class="tot-fee">0</span></div>
        <div class="tot-row muted"><span>${esc(t('farmer_gets'))}</span><span class="tot-farmer">0</span></div>
        <div class="field mt-2"><label>${esc(t('received_now'))}</label><input name="received" class="input num-in big-in" inputmode="decimal" placeholder="0"></div>
        <div class="tot-row strong"><span>${esc(t('balance_after'))}</span><span class="tot-due">0</span></div>
        <div class="limit-warn d-none">${ic('alert')} <span>${esc(t('over_limit'))}</span></div>
      </section>
      <div class="field"><label>${esc(t('notes'))}</label><input name="notes" class="input" autocomplete="off"></div>
      <div class="form-error d-none" role="alert"></div>
      <div class="form-actions sticky-actions">
        <a class="btn btn-ghost" href="#/sales">${esc(t('cancel'))}</a>
        <button type="submit" class="btn btn-primary btn-lg btn-save"><span>${esc(t('save'))}</span></button>
      </div>
    </form>`, '', '#/sales');

  const form = main.querySelector('form');
  const linesHost = main.querySelector('.lines');
  const buyerSel = form.querySelector('[name=buyerId]');

  const addLot = (lot) => {
    if (!lot || state.lines.some((l) => l.lotId === lot.id)) return;
    const rem = lotRemaining(lot);
    const c = commodity(lot.commodityId);
    const board = rateFor(state.date, lot.commodityId);
    const suggested = board ? round2((board.low + board.high) / 2) : (lastRateFor(lot.commodityId) ?? '');
    const qtyDefault = fromBase(rem, lot.unit);
    state.lines.push({ lotId: lot.id, qty: qtyDefault, rate: suggested, lot, c });
    drawLines();
    drawTotals();
  };

  const drawLines = () => {
    if (!state.lines.length) {
      linesHost.innerHTML = `<div class="empty-state small">${esc(t('sale_has_no_lines'))}</div>`;
      return;
    }
    linesHost.innerHTML = state.lines.map((ln, i) => {
      const f = party(ln.lot.farmerId);
      const u = ln.lot.unit;
      const rem = fromBase(lotRemaining(ln.lot), u);
      const board = rateFor(state.date, ln.lot.commodityId);
      return `<div class="line-card" data-i="${i}" style="--d:${i * 60}ms">
        <div class="line-head"><div><div class="line-title">${esc(itemName(ln.c))}</div>
          <div class="line-sub">${esc(ln.lot.number)} · ${esc(f?.name || '')} · ${esc(t('remaining'))}: ${esc(fmtQty(rem))} ${esc(unitLabel(u))}</div></div>
          <button type="button" class="icon-btn" data-rm aria-label="${esc(t('remove_line'))}">${ic('x')}</button></div>
        <div class="line-grid">
          <div class="field"><label>${esc(t('qty'))} (${esc(unitLabel(u))})</label><input class="input num-in" inputmode="decimal" name="qty" value="${esc(ln.qty)}"></div>
          <div class="field"><label>${esc(t('rate_per', { unit: unitLabel(u) }))}</label><input class="input num-in" inputmode="decimal" name="rate" value="${esc(ln.rate)}"></div>
        </div>
        <div class="line-foot">
          <span class="board-chip">${board ? `${ic('tag')} ${esc(t('board_today'))}: ${esc(fmtNum(board.low))}–${esc(fmtNum(board.high))}` : ''}</span>
          <span class="line-amt"><span class="muted">${esc(t('line_amount'))}</span> <b class="amt">${money(0)}</b></span>
        </div>
        <div class="line-split small muted"><span class="split-c"></span><span class="split-f"></span></div>
      </div>`;
    }).join('');
    linesHost.querySelectorAll('.line-card').forEach((card) => {
      const i = +card.dataset.i;
      const ln = state.lines[i];
      card.querySelector('[name=qty]').addEventListener('input', (e) => { ln.qty = e.target.value; refreshLine(card, ln); drawTotals(); });
      card.querySelector('[name=rate]').addEventListener('input', (e) => { ln.rate = e.target.value; refreshLine(card, ln); drawTotals(); });
      card.querySelector('[data-rm]').addEventListener('click', () => { state.lines.splice(i, 1); drawLines(); drawTotals(); });
      refreshLine(card, ln);
    });
  };

  const lineCalc = (ln) => {
    const qty = num(ln.qty, 0);
    const rate = num(ln.rate, 0);
    const maxQty = fromBase(lotRemaining(ln.lot), ln.lot.unit);
    const over = qty > maxQty + 0.0005;
    if (!(qty > 0) || over) return { ok: false, over };
    return { ok: true, over: false, line: computeLine({ lot: ln.lot, qty, rate }) };
  };
  const refreshLine = (card, ln) => {
    const r = lineCalc(ln);
    card.classList.toggle('is-over', r.over);
    if (!r.ok) {
      card.querySelector('.amt').textContent = r.over ? t('qty_over', { n: fmtQty(fromBase(lotRemaining(ln.lot), ln.lot.unit)), unit: unitLabel(ln.lot.unit) }) : money(0);
      card.querySelector('.split-c').textContent = '';
      card.querySelector('.split-f').textContent = '';
      return;
    }
    card.querySelector('.amt').textContent = money(r.line.amount);
    card.querySelector('.split-c').textContent = `${t('commission')} ${money(r.line.commission)} (${fmtNum(r.line.commissionPct)}%)`;
    card.querySelector('.split-f').textContent = `${t('farmer_gets')} ${money(r.line.farmerNet)}`;
  };

  const drawTotals = () => {
    const calc = state.lines.map(lineCalc).filter((r) => r.ok).map((r) => r.line);
    const total = round2(calc.reduce((n, l) => n + l.amount, 0));
    const comm = round2(calc.reduce((n, l) => n + l.commission, 0));
    const fee = round2(calc.reduce((n, l) => n + l.marketFee, 0));
    const farmer = round2(calc.reduce((n, l) => n + l.farmerNet, 0));
    const recv = round2(Math.min(total, Math.max(0, num(form.received.value, 0))));
    const due = round2(total - recv);
    main.querySelector('.tot-amt').textContent = money(total);
    main.querySelector('.tot-comm').textContent = money(comm);
    main.querySelector('.tot-fee').textContent = money(fee);
    main.querySelector('.tot-farmer').textContent = money(farmer);
    main.querySelector('.tot-due').textContent = money(due);
    const b = party(state.buyerId);
    const limit = b?.creditLimit;
    main.querySelector('.limit-warn').classList.toggle('d-none', !(limit && balance(b.id) + due > limit));
  };

  const drawBuyer = () => {
    const b = party(state.buyerId);
    const info = main.querySelector('.buyer-info');
    if (!b) { info.textContent = ''; return; }
    const bal = balance(b.id);
    const oldest = buyerAging(b.id).open.reduce((m, o) => Math.max(m, o.days), 0);
    info.innerHTML = `${esc(t('balance'))}: <b>${money(bal)}</b>${oldest ? ` · ${esc(t('days_ago', { n: oldest }))}` : ''}`;
    drawTotals();
  };

  buyerSel.addEventListener('change', async () => {
    if (buyerSel.value === '__new') {
      buyerSel.value = '';
      const p = await openPartyForm({ type: 'buyer' });
      if (p) {
        buyerSel.insertAdjacentHTML('beforeend', `<option value="${esc(p.id)}">${esc(p.name)}</option>`);
        buyerSel.value = p.id;
      }
    }
    state.buyerId = buyerSel.value;
    drawBuyer();
  });
  form.querySelector('[name=date]').addEventListener('change', (e) => {
    state.date = e.target.value || today();
    state.lines.forEach((ln) => {
      const board = rateFor(state.date, ln.lot.commodityId);
      if (board && !num(ln.rate, 0)) ln.rate = round2((board.low + board.high) / 2);
    });
    drawLines(); drawTotals();
  });
  form.received.addEventListener('input', drawTotals);
  form.notes.addEventListener('input', (e) => { state.notes = e.target.value; });

  main.querySelector('[data-add]').addEventListener('click', async () => {
    const pickedId = await pickSheet({
      title: t('pick_lot'),
      placeholder: t('search'),
      emptyText: t('no_open_lots'),
      search: async (q) => {
        const n = norm(q);
        return openLots().filter((l) => {
          if (state.lines.some((x) => x.lotId === l.id)) return false;
          const f = party(l.farmerId);
          return !n || norm(`${l.number} ${f?.name || ''} ${itemName(commodity(l.commodityId))}`).includes(n);
        }).map((l) => {
          const c = commodity(l.commodityId);
          return { id: l.id, title: `${itemName(c)} · ${party(l.farmerId)?.name || ''}`, sub: `${l.number} · ${fmtDate(l.date)}`, right: `${fmtQty(fromBase(lotRemaining(l), l.unit))} ${unitLabel(l.unit)}` };
        });
      },
    });
    if (pickedId) addLot(lotById(pickedId));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = main.querySelector('.btn-save');
    const err = main.querySelector('.form-error');
    err.classList.add('d-none');
    btn.disabled = true;
    try {
      const sale = await createSale({
        date: state.date, buyerId: state.buyerId,
        lines: state.lines.map((l) => ({ lotId: l.lotId, qty: num(l.qty, NaN), rate: num(l.rate, NaN) })),
        receivedNow: num(form.received.value, 0), notes: form.notes.value,
      });
      toast(t('sale_saved'));
      go(`#/sales/${sale.id}`);
      printPrompt(sale);
    } catch (ex) {
      console.warn(ex);
      err.textContent = errText(ex);
      err.classList.remove('d-none');
    } finally { btn.disabled = false; }
  });

  if (lotId && lotById(lotId)) addLot(lotById(lotId));
  drawLines();
  drawTotals();
}

// Offers to print the bill right after saving it.
function printPrompt(sale) {
  setTimeout(async () => {
    const ok = await confirmBox(t('print_slip') + '?', { okLabel: t('print') });
    if (ok) printSale(sale);
  }, 350);
}

function renderDetail(main, id, title) {
  const s = saleById(id);
  if (!s) return main.innerHTML = empty(t('nothing_selected'), 'receipt', `<a class="btn btn-ghost" href="#/sales">${esc(t('back'))}</a>`);
  title?.(s.number);
  const b = party(s.buyerId);
  const paid = s.received || 0;
  const ledgerReceipt = S.ledger.filter((e) => e.refId === s.id && e.kind === 'receipt').reduce((n, e) => n + e.cash, 0);
  main.innerHTML = page(s.number, `
    <div class="detail-hero card ${s.void ? 'is-void' : ''}">
      <div class="detail-top">${s.void ? `<span class="pill pill-sold">${esc(t('voided'))}</span>` : `<span class="pill pill-open">${esc(fmtDate(s.date))}</span>`}<span class="muted">${esc(s.number)}</span></div>
      <div class="detail-title">${esc(b?.name || '')}</div>
      <div class="detail-sub">${esc(b?.village || '')}</div>
      <div class="bill-total-big" data-count="${s.total}" data-kind="money">${money(0)}</div>
      <div class="bill-split"><span>${esc(t('commission'))} <b>${money(s.commission)}</b></span><span>${esc(t('market_fee'))} <b>${money(s.marketFee)}</b></span><span>${esc(t('farmer_gets'))} <b>${money(s.farmerNet)}</b></span></div>
      ${s.void && s.voidReason ? `<div class="notice notice-warn small">${esc(t('void_reason'))}: ${esc(s.voidReason)}</div>` : ''}
    </div>
    <div class="card list-card">${s.lines.map((l, i) => `<div class="row-link no-hover" style="--d:${i * 60}ms">
      <span class="row-main"><span class="row-title">${esc(itemName(commodity(l.commodityId)) || l.commodityName)} · ${esc(l.lotNumber)}</span>
        <span class="row-sub">${esc(party(l.farmerId)?.name || '')} · ${fmtQty(l.qty)} ${esc(unitLabel(l.unit))} × ${fmtNum(l.rate)} · ${esc(t('commission'))} ${fmtNum(l.commissionPct)}%</span></span>
      <span class="row-amt">${money(l.amount)}</span></div>`).join('')}</div>
    <div class="card">
      <dl class="kv">
        <dt>${esc(t('received_now'))}</dt><dd>${money(paid)}</dd>
        <dt>${esc(t('balance_after'))}</dt><dd class="strong">${money(s.total - ledgerReceipt)}</dd>
      </dl>
    </div>
    <div class="action-row">
      <button type="button" class="btn btn-primary" data-print>${ic('print')} ${esc(t('print'))}</button>
      ${s.void ? '' : `<button type="button" class="btn btn-ghost btn-danger-ghost" data-void>${ic('x')} ${esc(t('void_sale'))}</button>`}
    </div>`, '', '#/sales');

  countUp(main);
  main.querySelector('[data-print]').addEventListener('click', () => printSale(s));
  main.querySelector('[data-void]')?.addEventListener('click', () => {
    formSheet({
      title: t('void_sale'), danger: true, submitLabel: t('void_sale'),
      body: `<p class="confirm-text">${esc(t('confirm_void'))}</p><div class="field"><label>${esc(t('void_reason'))}</label><input name="reason" class="input" required></div>`,
      onSubmit: async (v) => {
        if (!v.reason?.trim()) throw new Error(t('err_name'));
        await voidDoc('sale', s.id, v.reason);
        toast(t('sale_void_done'));
        go(`#/sales/${s.id}`);
        return true;
      },
    }).catch(toastError);
  });
}
