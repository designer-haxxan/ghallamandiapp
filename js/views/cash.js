// Cash book: every rupee in and out (buyer receipts, farmer payments, advances, expenses), with a running balance.
import { t } from '../i18n.js';
import { S, buyers, farmers, party, balance, cashRows, cashBalance, receivePayment, payFarmer, addExpense, voidDoc, EXPENSE_CATS } from '../store.js';
import { esc, fmtDate, fmtNum, today, monthStart, addDays, num } from '../util.js';
import { ic, money, page, empty, formSheet, toast, toastError, countUp, confirmBox, sectionTitle } from '../ui.js';

const CAT_KEY = { labour: 'cat_labour', transport: 'cat_transport', food: 'cat_food', rent: 'cat_rent', phone: 'cat_phone', power: 'cat_power', fee: 'cat_fee', other: 'cat_other' };

export function openReceive({ buyerId = '', onSaved } = {}) {
  return formSheet({
    title: t('receive'), submitLabel: t('receive'),
    body: `<div class="field-grid">
      <div class="field span-2"><label>${esc(t('buyer'))}</label><select name="buyerId" class="select" required>
        <option value="">${esc(t('buyer'))}…</option>${buyers().map((b) => `<option value="${esc(b.id)}" ${b.id === buyerId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
        <div class="field-hint" data-hint></div></div>
      <div class="field"><label>${esc(t('amount'))}</label><input name="amount" class="input big-in num-in" inputmode="decimal" required></div>
      <div class="field"><label>${esc(t('date'))}</label><input type="date" name="date" class="input" value="${today()}"></div>
      <div class="field span-2"><label>${esc(t('notes'))}</label><input name="notes" class="input"></div>
    </div>`,
    onMount: (el) => {
      const sel = el.querySelector('[name=buyerId]');
      const hint = el.querySelector('[data-hint]');
      const show = () => { const b = party(sel.value); hint.textContent = b ? `${t('balance')}: ${fmtNum(balance(b.id))}` : ''; };
      sel.addEventListener('change', show); show();
    },
    onSubmit: async (v) => {
      const e = await receivePayment({ buyerId: v.buyerId, amount: num(v.amount, NaN), date: v.date, notes: v.notes });
      toast(t('receive_saved'));
      onSaved?.(e);
      return e;
    },
  });
}

export function openPayFarmer({ farmerId = '', kind = 'payment', onSaved } = {}) {
  const title = kind === 'advance' ? t('advance') : t('pay_farmer');
  return formSheet({
    title, submitLabel: title,
    body: `<div class="field-grid">
      <div class="field span-2"><label>${esc(t('farmer'))}</label><select name="farmerId" class="select" required>
        <option value="">${esc(t('farmer'))}…</option>${farmers().map((f) => `<option value="${esc(f.id)}" ${f.id === farmerId ? 'selected' : ''}>${esc(f.name)}${f.village ? ' · ' + esc(f.village) : ''}</option>`).join('')}</select>
        <div class="field-hint" data-hint></div></div>
      <div class="field"><label>${esc(t('amount'))}</label><div class="input-group"><input name="amount" class="input big-in num-in" inputmode="decimal" required>
        <button type="button" class="btn btn-soft" data-all>${esc(t('balance'))}</button></div></div>
      <div class="field"><label>${esc(t('date'))}</label><input type="date" name="date" class="input" value="${today()}"></div>
      <div class="field span-2"><label>${esc(t('notes'))}</label><input name="notes" class="input"></div>
      <input type="hidden" name="kind" value="${kind}">
    </div>`,
    onMount: (el) => {
      const sel = el.querySelector('[name=farmerId]');
      const hint = el.querySelector('[data-hint]');
      const show = () => { const f = party(sel.value); hint.textContent = f ? `${t('you_owe')}: ${fmtNum(Math.max(0, balance(f.id)))}` : ''; };
      sel.addEventListener('change', show); show();
      el.querySelector('[data-all]').addEventListener('click', () => {
        const f = party(sel.value);
        if (f) el.querySelector('[name=amount]').value = Math.max(0, balance(f.id));
      });
    },
    onSubmit: async (v) => {
      const e = await payFarmer({ farmerId: v.farmerId, amount: num(v.amount, NaN), date: v.date, kind: v.kind, notes: v.notes });
      toast(t('pay_saved'));
      onSaved?.(e);
      return e;
    },
  });
}

export function openExpense({ onSaved } = {}) {
  const recentLots = S.lots.slice(0, 80);
  return formSheet({
    title: t('expense_new'), submitLabel: t('save'),
    body: `<div class="field-grid">
      <div class="field"><label>${esc(t('category'))}</label><select name="category" class="select">
        ${EXPENSE_CATS.map((c) => `<option value="${c}">${esc(t(CAT_KEY[c]))}</option>`).join('')}</select></div>
      <div class="field"><label>${esc(t('amount'))}</label><input name="amount" class="input big-in num-in" inputmode="decimal" required></div>
      <div class="field"><label>${esc(t('date'))}</label><input type="date" name="date" class="input" value="${today()}"></div>
      <div class="field"><label>${esc(t('lot_optional'))}</label><select name="lotId" class="select"><option value="">${esc(t('none'))}</option>
        ${recentLots.map((l) => `<option value="${esc(l.id)}">${esc(l.number)} · ${esc(party(l.farmerId)?.name || '')}</option>`).join('')}</select></div>
      <div class="field span-2 charge-row d-none"><label class="check"><input type="checkbox" name="chargeFarmer"> <span>${esc(t('charge_farmer'))}</span></label>
        <div class="field-hint">${esc(t('charge_help'))}</div></div>
      <div class="field span-2"><label>${esc(t('notes'))}</label><input name="notes" class="input"></div>
    </div>`,
    onMount: (el) => {
      const sel = el.querySelector('[name=lotId]');
      const row = el.querySelector('.charge-row');
      sel.addEventListener('change', () => row.classList.toggle('d-none', !sel.value));
    },
    onSubmit: async (v) => {
      const ex = await addExpense({ date: v.date, category: v.category, amount: num(v.amount, NaN), lotId: v.lotId, chargeFarmer: !!v.chargeFarmer, notes: v.notes });
      toast(t('expense_saved'));
      onSaved?.(ex);
      return ex;
    },
  });
}

export function render(main, { rerender }) {
  let range = { from: monthStart(), to: today() };
  let chip = 'month';
  const draw = () => {
    const cb = cashRows(range.from, range.to);
    const inSum = cb.rows.reduce((n, r) => n + r.in, 0);
    const outSum = cb.rows.reduce((n, r) => n + r.out, 0);
    main.querySelector('#cash-body').innerHTML = `
      <div class="cash-kpis">
        <div class="cash-k tone-green"><span>${esc(t('cash_in'))}</span><b>${money(inSum)}</b></div>
        <div class="cash-k tone-rose"><span>${esc(t('cash_out'))}</span><b>${money(outSum)}</b></div>
      </div>
      <div class="cash-open small muted"><span>${esc(t('opening_cash'))}</span><b>${money(cb.opening)}</b></div>
      <div class="list list-card">${cb.rows.length ? cb.rows.slice().reverse().map((r, i) => rowHtml(r, i)).join('') : empty(t('cash_empty'), 'cash')}</div>
      <div class="cash-close"><span>${esc(t('closing_cash'))}</span><b>${money(cb.closing)}</b></div>`;
    countUp(main.querySelector('#cash-body'));
  };
  main.innerHTML = page(t('cash_book'), `
    <div class="cash-hero card">
      <div class="cash-hero-l">${esc(t('cash_in_hand'))}</div>
      <div class="cash-hero-v" data-count="${cashBalance(null)}" data-kind="money">${money(0)}</div>
      <div class="action-row">
        <button type="button" class="btn btn-primary" data-receive>${ic('down')} ${esc(t('receive'))}</button>
        <button type="button" class="btn btn-primary" data-pay>${ic('up')} ${esc(t('pay_farmer'))}</button>
        <button type="button" class="btn btn-ghost" data-expense>${ic('wallet')} ${esc(t('expense_new'))}</button>
      </div>
    </div>
    <div class="chips" role="tablist">
      <button type="button" class="chip" data-r="today">${esc(t('today'))}</button>
      <button type="button" class="chip is-on" data-r="month">${esc(t('month'))}</button>
      <button type="button" class="chip" data-r="all">${esc(t('alltime'))}</button>
    </div>
    ${sectionTitle(t('cash_book'))}
    <div id="cash-body"></div>`);
  main.querySelector('[data-receive]').addEventListener('click', () => openReceive({ onSaved: rerender }));
  main.querySelector('[data-pay]').addEventListener('click', () => openPayFarmer({ onSaved: rerender }));
  main.querySelector('[data-expense]').addEventListener('click', () => openExpense({ onSaved: rerender }));
  main.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => {
    chip = b.dataset.r;
    range = chip === 'today' ? { from: today(), to: today() } : chip === 'month' ? { from: monthStart(), to: today() } : { from: '2000-01-01', to: addDays(today(), 1) };
    main.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('is-on', x === b));
    draw();
  }));
  main.querySelector('#cash-body').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-void]');
    if (!row) return;
    const [kind, id] = row.dataset.void.split('|');
    if (!await confirmBox(t('confirm_void'), { okLabel: t('void_sale'), danger: true })) return;
    try { await voidDoc(kind, id, ''); toast(t('deleted')); rerender(); } catch (ex) { toastError(ex); }
  });
  draw();
}

function rowHtml(r, i) {
  const who = r.kind === 'expense' ? t(CAT_KEY[r.category] || 'cat_other') : (party(r.partyId)?.name || '');
  const amt = r.in || r.out;
  return `<div class="cash-row" style="--d:${Math.min(i, 12) * 25}ms">
    <div class="cash-ic ${r.in ? 'in' : 'out'}">${ic(r.in ? 'down' : r.kind === 'expense' ? 'wallet' : 'up')}</div>
    <div class="row-main"><div class="row-title">${esc(who)}</div>
      <div class="row-sub">${esc(fmtDate(r.date))} · ${esc(t('kind_' + r.kind))}${r.number ? ` · ${esc(r.number)}` : ''}${r.note && r.kind !== 'expense' ? ` · ${esc(r.note)}` : ''}</div></div>
    <div class="cash-amt"><div class="${r.in ? 'text-green' : 'text-rose'}">${r.in ? '+' : '−'}${fmtNum(amt)}</div><div class="small muted">${fmtNum(r.running)}</div></div>
    ${r.voidId ? `<button type="button" class="icon-btn sm" data-void="${esc(r.voidId)}" aria-label="${esc(t('void_sale'))}">${ic('x')}</button>` : ''}
  </div>`;
}
