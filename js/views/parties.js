// Farmers and buyers: balances at a glance, a statement per person, WhatsApp share, payments and aging.
import { t } from '../i18n.js';
import { S, party, balance, statement, saveParty, buyerAging, farmers, buyers, voidDoc, searchParties } from '../store.js';
import { esc, fmtDate, fmtNum, today, addDays, monthStart } from '../util.js';
import { ic, money, page, empty, formSheet, confirmBox, toast, toastError, avatar, sectionTitle, countUp } from '../ui.js';
import { printStatement } from '../print.js';
import { openReceive, openPayFarmer } from './cash.js';

// Form for a farmer or buyer. Resolves with the saved party (or undefined when cancelled).
export function openPartyForm({ type = 'farmer', person = null } = {}) {
  const kind = person?.type || type;
  const isBuyer = kind === 'buyer';
  return formSheet({
    title: person ? t('edit') : (isBuyer ? t('party_buyer') : t('party_farmer')),
    body: `<div class="field-grid">
      <div class="field span-2"><label>${esc(t('name'))} *</label><input name="name" class="input" required maxlength="120" value="${esc(person?.name || '')}" autocomplete="off"></div>
      <div class="field"><label>${esc(t('phone'))}</label><input name="phone" class="input" inputmode="tel" value="${esc(person?.phone || '')}" placeholder="0300-0000000"></div>
      <div class="field"><label>${esc(t('village'))}</label><input name="village" class="input" value="${esc(person?.village || '')}"></div>
      ${isBuyer ? `<div class="field span-2"><label>${esc(t('credit_limit'))}</label><input name="creditLimit" class="input num-in" inputmode="decimal" value="${esc(person?.creditLimit ?? '')}" placeholder="${esc(t('cr_limit_hint'))}"></div>` : ''}
      <div class="field span-2"><label>${esc(t('notes'))}</label><input name="notes" class="input" value="${esc(person?.notes || '')}"></div>
      <input type="hidden" name="type" value="${kind}">
      ${person ? `<input type="hidden" name="id" value="${esc(person.id)}">` : ''}
    </div>`,
    onSubmit: async (v) => saveParty(v),
  });
}

// Route "parties/:tab" (farmers | buyers).
export function renderParties(main, { params, rerender }) {
  return renderList(main, params[0] || 'farmers', rerender);
}

// Route "party/:id" (statement page).
export function renderParty(main, { params, rerender, title }) {
  return renderPartyPage(main, params[0], title, rerender);
}

function renderList(main, tab, rerender) {
  const isBuyer = tab === 'buyers';
  const list = () => (isBuyer ? buyers(false) : farmers(false));
  main.innerHTML = page(isBuyer ? t('buyers') : t('farmers'), `
    <div class="seg" role="tablist">
      <a class="seg-btn ${!isBuyer ? 'is-on' : ''}" href="#/parties/farmers">${ic('sprout')} ${esc(t('farmers'))}</a>
      <a class="seg-btn ${isBuyer ? 'is-on' : ''}" href="#/parties/buyers">${ic('store')} ${esc(t('buyers'))}</a>
    </div>
    <div class="toolbar"><div class="search-box">${ic('search')}<input type="search" class="q" placeholder="${esc(t('search'))}" autocomplete="off"></div></div>
    <div class="list list-card" id="party-list"></div>
    <button type="button" class="fab" id="add-party">${ic('plus')}<span>${esc(isBuyer ? t('party_buyer') : t('party_farmer'))}</span></button>`);
  const draw = () => {
    const rows = searchParties(list(), main.querySelector('.q').value);
    const total = rows.reduce((n, p) => n + balance(p.id), 0);
    main.querySelector('#party-list').innerHTML = rows.length ? rows.map((p, i) => {
      const bal = balance(p.id);
      const over = isBuyer && p.creditLimit && bal > p.creditLimit;
      const oldest = isBuyer ? buyerAging(p.id).open.reduce((m, o) => Math.max(m, o.days), 0) : 0;
      const sign = isBuyer ? (bal > 0 ? t('owes_you') : t('settled')) : (bal > 0 ? t('you_owe') : bal < 0 ? t('farmer_owed') : t('settled'));
      return `<a class="row-link" href="#/party/${esc(p.id)}" style="--d:${Math.min(i, 10) * 35}ms">
        ${avatar(p.name)}
        <span class="row-main"><span class="row-title">${esc(p.name)}</span>
          <span class="row-sub">${esc(p.village || p.phone || '')}${oldest > 30 ? ` · <b class="text-rose">${esc(t('age_30p'))}</b>` : ''}${over ? ` · <b class="text-rose">${esc(t('over_limit'))}</b>` : ''}</span></span>
        <span class="row-amt ${bal > 0 ? (isBuyer ? 'text-amber' : 'text-rose') : 'text-green'}">${money(Math.abs(bal))}<span class="row-amt-l">${esc(sign)}</span></span></a>`;
    }).join('') : empty(t('party_empty'), isBuyer ? 'store' : 'sprout');
    main.querySelector('.list-head-sum')?.remove();
    if (rows.length) main.querySelector('#party-list').insertAdjacentHTML('beforebegin', `<div class="list-head-sum small muted">${esc(isBuyer ? t('receivable') : t('payable'))}: <b>${money(Math.abs(total))}</b></div>`);
  };
  main.querySelector('.q').addEventListener('input', draw);
  main.querySelector('#add-party').addEventListener('click', async () => {
    const p = await openPartyForm({ type: isBuyer ? 'buyer' : 'farmer' });
    if (p) { toast(t('party_saved')); rerender(); }
  });
  draw();
}

function renderPartyPage(main, id, title, rerender) {
  const p = party(id);
  if (!p) return main.innerHTML = empty(t('nothing_selected'), 'users', `<a class="btn btn-ghost" href="#/parties/farmers">${esc(t('back'))}</a>`);
  title?.(p.name);
  const isBuyer = p.type === 'buyer';
  const range = { from: monthStart(), to: today() };
  const bal = balance(p.id);
  const used = isBuyer ? Math.max(0, bal) : 0;
  const aging = isBuyer ? buyerAging(p.id).open : [];
  const backTo = isBuyer ? '#/parties/buyers' : '#/parties/farmers';

  main.innerHTML = page(p.name, `
    <div class="detail-hero card ${bal > 0.005 ? '' : 'is-settled'}">
      <div class="detail-top"><span class="pill ${isBuyer ? 'pill-partial' : 'pill-open'}">${esc(isBuyer ? t('party_type_buyer') : t('party_type_farmer'))}</span>
        ${p.active === false ? `<span class="pill pill-sold">${esc(t('party_hidden'))}</span>` : ''}</div>
      <div class="detail-title">${esc(p.name)}</div>
      <div class="detail-sub">${esc([p.village, p.phone].filter(Boolean).join(' · '))}</div>
      <div class="bal-big">
        <span data-count="${Math.abs(bal)}" data-kind="money">${money(0)}</span></div>
      <div class="bal-sub">${bal > 0.005 ? esc(isBuyer ? t('owes_you') : t('you_owe')) : bal < -0.005 ? esc(t('farmer_owed')) : esc(t('settled'))}</div>
      ${isBuyer && p.creditLimit ? `<div class="limit-bar"><span style="--w:${Math.min(100, (used / p.creditLimit) * 100).toFixed(1)}%" class="${used > p.creditLimit ? 'over' : ''}"></span></div>
        <div class="small muted">${esc(t('credit_limit'))}: ${money(p.creditLimit)}</div>` : ''}
    </div>
    <div class="action-row">
      ${isBuyer ? `<button type="button" class="btn btn-primary btn-lg" data-receive>${ic('down')} ${esc(t('receive'))}</button>`
        : `<button type="button" class="btn btn-primary btn-lg" data-pay>${ic('up')} ${esc(t('pay_farmer'))}</button>
           <button type="button" class="btn btn-ghost" data-advance>${ic('cash')} ${esc(t('advance'))}</button>`}
      <button type="button" class="btn btn-ghost" data-share>${ic('share')} ${esc(t('share_wa'))}</button>
      <button type="button" class="btn btn-ghost" data-print>${ic('print')} ${esc(t('print'))}</button>
      <button type="button" class="btn btn-ghost" data-edit>${ic('edit')} ${esc(t('edit'))}</button>
    </div>

    ${isBuyer && aging.length ? `<section class="card">${sectionTitle(t('aging'))}
      <div class="aging">${agingBucket(aging, 0, 7, t('age_0_7'))}${agingBucket(aging, 8, 30, t('age_8_30'))}${agingBucket(aging, 31, 99999, t('age_30p'))}</div>
    </section>` : ''}

    <section class="card">
      ${sectionTitle(t('statement'))}
      <form class="range-form">
        <div class="chips">
          <button type="button" class="chip" data-r="today">${esc(t('today'))}</button>
          <button type="button" class="chip is-on" data-r="month">${esc(t('month'))}</button>
          <button type="button" class="chip" data-r="all">${esc(t('alltime'))}</button>
        </div>
      </form>
      <div class="stmt" id="stmt"></div>
    </section>`, '', backTo);

  countUp(main);
  let current = range;
  const drawStmt = () => {
    const st = statement(p.id, current.from, current.to);
    const rows = st.rows.slice().reverse();
    main.querySelector('#stmt').innerHTML = `
      <div class="stmt-head small muted"><span>${esc(t('stmt_opening'))}</span><b>${money(st.opening)}</b></div>
      ${rows.length ? rows.map((e, i) => {
        const voidable = (e.kind === 'receipt' || e.kind === 'payment' || e.kind === 'advance') && e.refId === e.id && !S.ledger.some((x) => x.refId === e.id && x.kind === 'void');
        return `<div class="stmt-row ${e.kind === 'void' ? 'is-void' : ''}" style="--d:${Math.min(i, 12) * 30}ms">
          <div class="stmt-date">${esc(fmtDate(e.date))}</div>
          <div class="stmt-main"><div class="stmt-title">${esc(t('kind_' + e.kind))}${e.number ? ` · ${esc(e.number)}` : ''}</div>
            <div class="stmt-note">${esc(e.note || '')}</div></div>
          <div class="stmt-amt"><div class="${e.amount > 0 ? 'text-rose' : 'text-green'}">${e.amount > 0 ? '+' : '−'}${fmtNum(Math.abs(e.amount))}</div>
            <div class="stmt-run small muted">${fmtNum(e.running)}</div></div>
          ${voidable ? `<button type="button" class="icon-btn sm" data-void="${esc(e.id)}" aria-label="${esc(t('void_sale'))}">${ic('x')}</button>` : ''}
        </div>`;
      }).join('') : `<div class="empty-state small">${esc(t('stmt_empty'))}</div>`}
      <div class="stmt-head strong"><span>${esc(t('stmt_closing'))}</span><b>${money(st.closing)}</b></div>`;
  };
  drawStmt();

  main.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.r;
    current = k === 'today' ? { from: today(), to: today() } : k === 'month' ? { from: monthStart(), to: today() } : { from: '2000-01-01', to: addDays(today(), 1) };
    main.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('is-on', x === b));
    drawStmt();
  }));

  main.querySelector('[data-receive]')?.addEventListener('click', () => openReceive({ buyerId: p.id, onSaved: rerender }));
  main.querySelector('[data-pay]')?.addEventListener('click', () => openPayFarmer({ farmerId: p.id, onSaved: rerender }));
  main.querySelector('[data-advance]')?.addEventListener('click', () => openPayFarmer({ farmerId: p.id, kind: 'advance', onSaved: rerender }));
  main.querySelector('[data-print]').addEventListener('click', () => printStatement(p.id, current.from, current.to));
  main.querySelector('[data-share]').addEventListener('click', () => shareWhatsApp(p, current));
  main.querySelector('[data-edit]').addEventListener('click', async () => {
    const saved = await openPartyForm({ person: p });
    if (saved) { toast(t('party_saved')); rerender(); }
  });
  main.querySelector('#stmt').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-void]');
    if (!b) return;
    if (!await confirmBox(t('confirm_void'), { okLabel: t('void_sale'), danger: true })) return;
    try { await voidDoc('payment', b.dataset.void, ''); toast(t('deleted')); rerender(); } catch (ex) { toastError(ex); }
  });
}

function agingBucket(open, lo, hi, label) {
  const items = open.filter((o) => o.days >= lo && o.days <= hi);
  const sum = items.reduce((n, o) => n + o.due, 0);
  return `<div class="aging-b ${sum > 0 ? 'has' : ''}"><div class="aging-l">${esc(label)}</div><div class="aging-v">${money(sum)}</div><div class="small muted">${items.length} ${esc(t('bills'))}</div></div>`;
}

// WhatsApp deep link with a plain-text statement summary. Opens WhatsApp with the text; the user chooses to send.
function shareWhatsApp(p, range) {
  const st = statement(p.id, range.from, range.to);
  const isBuyer = p.type === 'buyer';
  const lines = [
    `${S.settings.shopName || t('app_name')}`,
    `${t('statement')}: ${p.name}`,
    `${fmtDate(range.from)} – ${fmtDate(range.to)}`,
    `${t('stmt_opening')}: ${fmtNum(st.opening)}`,
    `${t('stmt_closing')}: ${fmtNum(st.closing)}`,
    st.closing > 0.005 ? `${isBuyer ? t('owes_you') : t('you_owe')}: ${money(st.closing)}` : t('settled'),
  ];
  const digits = String(p.phone || '').replace(/\D/g, '');
  const intl = digits.startsWith('0') ? '92' + digits.slice(1) : digits;
  const url = `https://wa.me/${intl}?text=${encodeURIComponent(lines.join('\n'))}`;
  window.open(url, '_blank', 'noopener');
}
