// Printable slips: arrival slip (aamad parchi), sale bill and account statement.
// They render into #print-root; CSS hides the app while printing, so the same slip works on paper, PDF or Bluetooth printers via the system dialog.
import { t, itemName, unitLabel, isUr } from './i18n.js';
import { S, party, commodity, statement, fromBase, isWeight } from './store.js';
import { esc, fmtNum, fmtQty, fmtDate, today } from './util.js';
import { money } from './ui.js';

function shell(title, body, sub = '') {
  return `<div class="slip ${isUr() ? 'slip-ur' : ''}">
    <div class="slip-head">
      <div class="slip-brand"><div class="slip-name">${esc(S.settings.shopName || t('app_name'))}</div>
        ${S.settings.ownerName ? `<div class="slip-small">${esc(S.settings.ownerName)}</div>` : ''}
        ${S.settings.address ? `<div class="slip-small">${esc(S.settings.address)}</div>` : ''}
        ${S.settings.phone ? `<div class="slip-small">${esc(S.settings.phone)}</div>` : ''}</div>
      <div class="slip-title"><div>${esc(title)}</div><div class="slip-small">${esc(t('prn_generated'))}: ${esc(fmtDate(today()))}</div></div>
    </div>
    ${sub}
    ${body}
    <div class="slip-thanks">${esc(t('prn_thanks'))}</div>
  </div>`;
}

// Puts the slip into #print-root and opens the print dialog after one frame, so the Urdu font is laid out first.
function printHtml(html) {
  const r = document.getElementById('print-root');
  r.innerHTML = html;
  requestAnimationFrame(() => setTimeout(() => window.print(), 150));
}

export function printArrival(lot) {
  const f = party(lot.farmerId);
  const c = commodity(lot.commodityId);
  const w = isWeight(lot.unit);
  const rows = w ? `
    <tr><th>${esc(t('bags'))}</th><td>${fmtNum(lot.bags)}</td></tr>
    <tr><th>${esc(t('gross_kg'))}</th><td>${fmtQty(lot.grossKg)}</td></tr>
    <tr><th>${esc(t('tare_total'))}</th><td>${fmtQty(lot.tareKg)} <span class="slip-small">(${fmtQty(lot.tarePerBagKg)} × ${fmtNum(lot.bags)})</span></td></tr>
    <tr class="slip-strong"><th>${esc(t('net_weight'))}</th><td>${fmtQty(lot.netKg)} kg${lot.unit === 'maund' ? ` · ${fmtQty(fromBase(lot.netKg, 'maund'))} ${esc(unitLabel('maund'))}` : ''}</td></tr>`
    : `<tr class="slip-strong"><th>${esc(t('count_qty'))}</th><td>${fmtQty(lot.count)} ${esc(unitLabel(lot.unit))}</td></tr>`;
  printHtml(shell(t('prn_arrival'), `<table class="slip-table">
    <tr><th>${esc(t('lot_no'))}</th><td class="slip-big">${esc(lot.number)}</td></tr>
    <tr><th>${esc(t('date'))}</th><td>${esc(fmtDate(lot.date))}</td></tr>
    <tr><th>${esc(t('farmer'))}</th><td>${esc(f?.name || '')}${f?.village ? ` · ${esc(f.village)}` : ''}</td></tr>
    <tr><th>${esc(t('commodity'))}</th><td>${esc(itemName(c))}</td></tr>
    ${lot.vehicle ? `<tr><th>${esc(t('vehicle'))}</th><td>${esc(lot.vehicle)}</td></tr>` : ''}
    ${rows}
    ${lot.expectRate ? `<tr><th>${esc(t('farmer_expect'))}</th><td>${fmtNum(lot.expectRate)}</td></tr>` : ''}
  </table>
  ${lot.notes ? `<p class="slip-small">${esc(lot.notes)}</p>` : ''}
  <p class="slip-small">${esc(t('lot_slip_note'))}</p>
  <div class="slip-sign"><span>${esc(t('farmer_sign'))}</span><span>${esc(t('agent_sign'))}</span></div>`));
}

export function printSale(sale) {
  const b = party(sale.buyerId);
  const cancelled = sale.void ? `<div class="slip-cancel">${esc(t('prn_cancelled'))}</div>` : '';
  const lines = sale.lines.map((l) => {
    const f = party(l.farmerId);
    return `<tr>
      <td>${esc(itemName(commodity(l.commodityId)) || l.commodityName)}<div class="slip-small">${esc(l.lotNumber)} · ${esc(f?.name || '')}</div></td>
      <td class="num">${fmtQty(l.qty)} ${esc(unitLabel(l.unit))}</td>
      <td class="num">${fmtNum(l.rate)}</td>
      <td class="num">${fmtNum(l.amount)}</td></tr>`;
  }).join('');
  const paid = sale.received || 0;
  printHtml(shell(t('prn_sale'), `${cancelled}
  <table class="slip-table">
    <tr><th>${esc(t('bill_no'))}</th><td class="slip-big">${esc(sale.number)}</td></tr>
    <tr><th>${esc(t('date'))}</th><td>${esc(fmtDate(sale.date))}</td></tr>
    <tr><th>${esc(t('buyer'))}</th><td>${esc(b?.name || '')}${b?.village ? ` · ${esc(b.village)}` : ''}</td></tr>
  </table>
  <table class="slip-lines"><thead><tr><th>${esc(t('commodity'))}</th><th class="num">${esc(t('qty'))}</th><th class="num">${esc(t('rate'))}</th><th class="num">${esc(t('amount'))}</th></tr></thead>
    <tbody>${lines}</tbody></table>
  <table class="slip-table slip-totals">
    <tr class="slip-strong"><th>${esc(t('bill_total'))}</th><td>${money(sale.total)}</td></tr>
    <tr><th>${esc(t('received_now'))}</th><td>${money(paid)}</td></tr>
    <tr class="slip-strong"><th>${esc(t('prn_due'))}</th><td>${money(sale.total - paid)}</td></tr>
  </table>
  ${sale.notes ? `<p class="slip-small">${esc(sale.notes)}</p>` : ''}`));
}

export function printStatement(partyId, from, to) {
  const p = party(partyId);
  if (!p) return;
  const st = statement(partyId, from, to);
  const rows = st.rows.map((e) => `<tr>
      <td>${esc(fmtDate(e.date))}</td>
      <td>${esc(t('kind_' + e.kind))}${e.number ? ` · ${esc(e.number)}` : ''}<div class="slip-small">${esc(e.note || '')}</div></td>
      <td class="num">${e.amount > 0 ? fmtNum(e.amount) : ''}</td>
      <td class="num">${e.amount < 0 ? fmtNum(-e.amount) : ''}</td>
      <td class="num">${fmtNum(e.running)}</td></tr>`).join('');
  const owed = p.type === 'farmer' ? t('you_owe') : t('owes_you');
  printHtml(shell(t('prn_statement'), `<table class="slip-table">
      <tr><th>${esc(p.type === 'farmer' ? t('party_type_farmer') : t('party_type_buyer'))}</th><td class="slip-big">${esc(p.name)}</td></tr>
      <tr><th>${esc(t('prn_period'))}</th><td>${esc(fmtDate(from))} – ${esc(fmtDate(to))}</td></tr>
    </table>
    <table class="slip-lines"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('notes'))}</th><th class="num">${esc(t('col_plus'))}</th><th class="num">${esc(t('col_minus'))}</th><th class="num">${esc(t('balance'))}</th></tr></thead>
      <tbody><tr><td colspan="4">${esc(t('stmt_opening'))}</td><td class="num">${fmtNum(st.opening)}</td></tr>${rows}
      <tr class="slip-strong"><td colspan="4">${esc(t('stmt_closing'))}</td><td class="num">${fmtNum(st.closing)}</td></tr></tbody></table>
    <p class="slip-strong">${esc(owed)}: ${money(Math.abs(st.closing))}</p>`));
}
