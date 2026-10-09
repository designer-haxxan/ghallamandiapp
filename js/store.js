// Business rules and data access. Records are loaded into memory (S) at start-up; every write goes through one
// IndexedDB transaction and then refreshes the affected collections, so screens can read S synchronously.
//
// Money model (ledger entries, signed):
//   party.balance > 0  → for a FARMER: we owe them.  for a BUYER: they owe us (udhaar).
//   sale        buyer +total (they owe)     farmer +farmerNet for each lot line (we owe them)
//   receipt     buyer −amount, cash +amount (buyer pays us)
//   payment     farmer −amount, cash −amount (we pay farmer)     advance = same, labelled peshgi
//   charge      farmer −amount, no cash     (expense recovered from farmer; cash already went out with the expense)
//   void        reversal of an earlier entry (same refId), keeps history
// Commission and market fee are not ledger lines: they are the gap between the bill total and what the farmer gets.
import * as DB from './db.js';
import { uuid, round2, num, today, nowISO, AppError, norm, fmtQty, daysBetween } from './util.js';
import { unitLabel } from './i18n.js';

export const MAUND_KG = 40; // one maund = 40 kg in Pakistan. Stored as a constant; no UI for it.
export const WEIGHT_UNITS = ['maund', 'kg'];
export const COUNT_UNITS = ['crate', 'bag', 'dozen', 'piece'];
export const ALL_UNITS = [...WEIGHT_UNITS, ...COUNT_UNITS];
export const isWeight = (unit) => WEIGHT_UNITS.includes(unit);
export const EXPENSE_CATS = ['labour', 'transport', 'food', 'rent', 'phone', 'power', 'fee', 'other'];

const DEFAULT_SETTINGS = {
  shopName: '', ownerName: '', phone: '', address: '',
  commissionPct: 6,      // default commission. Each item can override it. Placeholder: set your own rate.
  marketFeePct: 0,       // market committee fee taken from the farmer's share. Set to your market's rule.
  tarePerBagKg: 0,       // default deduction per bag (kg)
  openingCash: 0,
  pinHash: '', pinSalt: '', pinIterations: 0,
  setupDone: false,
  lastBackupAt: '',
};

const SEED_ITEMS = [
  { name: 'Tomato', nameUr: 'ٹماٹر', unit: 'maund' },
  { name: 'Onion', nameUr: 'پیاز', unit: 'maund' },
  { name: 'Potato', nameUr: 'آلو', unit: 'maund' },
  { name: 'Garlic', nameUr: 'لہسن', unit: 'maund' },
  { name: 'Ginger', nameUr: 'ادرک', unit: 'maund' },
  { name: 'Green chilli', nameUr: 'ہری مرچ', unit: 'maund' },
  { name: 'Okra', nameUr: 'بھنڈی', unit: 'maund' },
  { name: 'Cauliflower', nameUr: 'پھول گوبھی', unit: 'piece' },
  { name: 'Cabbage', nameUr: 'بند گوبھی', unit: 'piece' },
  { name: 'Mango', nameUr: 'آم', unit: 'crate' },
  { name: 'Banana', nameUr: 'کیلا', unit: 'dozen' },
];

// In-memory copy of everything. Read-only for views; mutate only through the functions below.
export const S = {
  settings: { ...DEFAULT_SETTINGS },
  parties: [], commodities: [], lots: [], sales: [], ledger: [], expenses: [], rates: [], audit: [],
};

// ---------- loading & refresh ----------
const byName = (a, b) => String(a.name).localeCompare(String(b.name));

export async function loadAll() {
  const [metaRows, parties, commodities, lots, sales, ledger, expenses, rates] = await Promise.all([
    DB.getAll('meta'), DB.getAll('parties'), DB.getAll('commodities'), DB.getAll('lots'),
    DB.getAll('sales'), DB.getAll('ledger'), DB.getAll('expenses'), DB.getAll('rates'),
  ]);
  const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
  S.settings = { ...DEFAULT_SETTINGS, ...(meta.settings || {}) };
  S.parties = parties.sort(byName);
  S.commodities = commodities.sort(byName);
  S.lots = lots.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
  S.sales = sales.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
  S.ledger = ledger.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  S.expenses = expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  S.rates = rates;
  S.audit = (await DB.getAll('audit')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
  if (!commodities.length && !meta.seeded) await seedItems();
}

async function seedItems() {
  const now = nowISO();
  const rows = SEED_ITEMS.map((c) => ({
    id: uuid(), ...c, commissionPct: null, active: true, createdAt: now,
  }));
  await DB.write(['commodities', 'meta'], async (t) => {
    for (const r of rows) await t.put('commodities', r);
    await t.put('meta', { key: 'seeded', value: true });
  });
  S.commodities = rows.sort(byName);
}

// Persist the settings object (PIN fields included, so the lock survives reloads).
export async function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  await DB.putOne('meta', { key: 'settings', value: S.settings });
  return S.settings;
}

// ---------- lookups ----------
export const party = (id) => S.parties.find((p) => p.id === id);
export const commodity = (id) => S.commodities.find((c) => c.id === id);
export const lotById = (id) => S.lots.find((l) => l.id === id);
export const saleById = (id) => S.sales.find((s) => s.id === id);
export const farmers = (includeHidden = false) => S.parties.filter((p) => p.type === 'farmer' && (includeHidden || p.active !== false));
export const buyers = (includeHidden = false) => S.parties.filter((p) => p.type === 'buyer' && (includeHidden || p.active !== false));
export const activeCommodities = () => S.commodities.filter((c) => c.active !== false);
export const commissionFor = (c) => (c && c.commissionPct != null && c.commissionPct !== '' ? Number(c.commissionPct) : S.settings.commissionPct);

// ---------- counters ----------
// Number generation happens inside the same transaction as the record, so a failed save does not use up a number.
async function nextNumber(t, key, prefix) {
  const cur = (await t.get('meta', 'counter:' + key))?.value || 0;
  await t.put('meta', { key: 'counter:' + key, value: cur + 1 });
  return `${prefix}-${String(cur + 1).padStart(6, '0')}`;
}

// ---------- lots (arrivals / aamad) ----------
// Quantities: weight items keep net weight in kg; count items keep the count. Each lot has baseQty + baseUnit.
export function lotInput(v) {
  const c = commodity(v.commodityId);
  if (!c) throw new AppError('err_commodity');
  if (!party(v.farmerId) || party(v.farmerId).type !== 'farmer') throw new AppError('err_farmer');
  const base = { commodityId: c.id, unit: c.unit, farmerId: v.farmerId, date: v.date || today(), vehicle: (v.vehicle || '').trim(), driver: (v.driver || '').trim(), notes: (v.notes || '').trim(), expectRate: num(v.expectRate, 0) || null };
  if (isWeight(c.unit)) {
    const bags = num(v.bags, NaN);
    const grossKg = num(v.grossKg, NaN);
    const tarePerBagKg = num(v.tarePerBagKg, S.settings.tarePerBagKg);
    if (!(bags > 0)) throw new AppError('err_bags');
    if (!(grossKg > 0)) throw new AppError('err_gross');
    const tareKg = round2(bags * tarePerBagKg);
    const netKg = round2(grossKg - tareKg);
    if (netKg <= 0) throw new AppError('err_gross');
    return { ...base, bags, grossKg, tarePerBagKg, tareKg, netKg, count: null, baseQty: netKg, baseUnit: 'kg' };
  }
  const count = num(v.count, NaN);
  if (!(count > 0)) throw new AppError('err_count');
  return { ...base, bags: null, grossKg: null, tarePerBagKg: null, tareKg: null, netKg: null, count, baseQty: count, baseUnit: c.unit };
}

export async function createLot(v) {
  const data = lotInput(v);
  const now = nowISO();
  let saved;
  await DB.write(['lots', 'meta'], async (t) => {
    const number = await nextNumber(t, 'lot', 'AAM');
    saved = { id: uuid(), number, ...data, createdAt: now, updatedAt: now };
    await t.put('lots', saved);
  });
  await refresh('lots', 'meta');
  return saved;
}

export async function updateLot(id, v) {
  const old = lotById(id);
  if (!old) throw new AppError('err_generic');
  if (sold(id) > 0) {
    // Only the vehicle, driver and notes can change once a lot has been sold.
    const saved = { ...old, vehicle: (v.vehicle || '').trim(), driver: (v.driver || '').trim(), notes: (v.notes || '').trim(), updatedAt: nowISO() };
    await DB.putOne('lots', saved);
    await refresh('lots');
    return saved;
  }
  const data = lotInput({ ...v, date: v.date || old.date });
  const saved = { ...old, ...data, updatedAt: nowISO() };
  await DB.putOne('lots', saved);
  await refresh('lots');
  return saved;
}

export async function deleteLot(id) {
  if (sold(id) > 0 || S.expenses.some((e) => e.lotId === id && !e.void)) throw new AppError('arrival_has_sales');
  await DB.write(['lots'], (t) => t.del('lots', id));
  await refresh('lots');
}

// Consumed base quantity of a lot across all live (not cancelled) bills.
const consumedMap = () => {
  const m = new Map();
  for (const s of S.sales) {
    if (s.void) continue;
    for (const l of s.lines) m.set(l.lotId, (m.get(l.lotId) || 0) + l.consumed);
  }
  return m;
};
export const sold = (lotId) => S.sales.reduce((n, s) => {
  if (s.void) return n;
  return n + s.lines.filter((l) => l.lotId === lotId).reduce((a, l) => a + l.consumed, 0);
}, 0);
export function lotRemaining(lot) {
  return round2(lot.baseQty - sold(lot.id));
}
export function lotStatus(lot) {
  const rem = lotRemaining(lot);
  if (rem <= 0.0005) return 'sold';
  if (rem < lot.baseQty - 0.0005) return 'partial';
  return 'open';
}
export const openLots = () => S.lots.filter((l) => lotRemaining(l) > 0.0005);
// Display quantity in the item's own unit (maund, crate...) for a base quantity.
export function fromBase(qtyBase, unit) {
  return unit === 'maund' ? qtyBase / MAUND_KG : qtyBase;
}
export function toBase(qty, unit) {
  return unit === 'maund' ? qty * MAUND_KG : qty;
}
export const lotQtyText = (lot) => isWeight(lot.unit) ? lot.netKg : lot.count;

// ---------- bills (sales to buyers) ----------
export function computeLine({ lot, qty, rate }) {
  const c = commodity(lot.commodityId);
  const amount = round2(qty * rate);
  const pct = commissionFor(c);
  const commission = round2(amount * pct / 100);
  const marketFee = round2(amount * (S.settings.marketFeePct || 0) / 100);
  return {
    lotId: lot.id, lotNumber: lot.number, farmerId: lot.farmerId,
    commodityId: lot.commodityId, commodityName: c?.name || '', unit: lot.unit,
    qty, rate, amount, commissionPct: pct, commission, marketFee,
    farmerNet: round2(amount - commission - marketFee),
    consumed: toBase(qty, lot.unit), consumedUnit: lot.baseUnit,
  };
}

export async function createSale({ date, buyerId, lines, receivedNow = 0, notes = '' }) {
  if (!party(buyerId) || party(buyerId).type !== 'buyer') throw new AppError('err_buyer');
  if (!lines.length) throw new AppError('sale_has_no_lines');
  // Check every line against what is still in each lot. Two lines from the same lot are added together.
  const taken = new Map();
  const built = lines.map((ln) => {
    const lot = lotById(ln.lotId);
    if (!lot) throw new AppError('err_generic');
    const qty = num(ln.qty, NaN);
    const rate = num(ln.rate, NaN);
    if (!(qty > 0)) throw new AppError('err_count');
    if (!(rate >= 0) || Number.isNaN(rate)) throw new AppError('err_rate');
    const need = toBase(qty, lot.unit);
    const left = lotRemaining(lot) - (taken.get(lot.id) || 0);
    if (need > left + 0.0005) throw new AppError('qty_over', { n: fmtQty(fromBase(left, lot.unit)), unit: unitLabel(lot.unit) });
    taken.set(lot.id, (taken.get(lot.id) || 0) + need);
    return computeLine({ lot, qty, rate });
  });
  const total = round2(built.reduce((n, l) => n + l.amount, 0));
  const commission = round2(built.reduce((n, l) => n + l.commission, 0));
  const marketFee = round2(built.reduce((n, l) => n + l.marketFee, 0));
  const farmerNet = round2(built.reduce((n, l) => n + l.farmerNet, 0));
  const received = round2(Math.max(0, num(receivedNow, 0)));
  if (received > total) throw new AppError('err_amount');
  const now = nowISO();
  const id = uuid();
  const lotNumbers = [...new Set(built.map((l) => l.lotNumber))].join(', ');
  let saved;
  await DB.write(['sales', 'ledger', 'meta'], async (t) => {
    const number = await nextNumber(t, 'sale', 'SAL');
    saved = { id, number, date: date || today(), buyerId, lines: built, total, commission, marketFee, farmerNet, received, notes: notes.trim(), void: false, createdAt: now };
    await t.put('sales', saved);
    await t.put('ledger', entry({ partyId: buyerId, kind: 'sale', amount: total, cash: 0, refId: id, number, date: saved.date, note: lotNumbers }));
    // One farmer line per farmer (sums of farmerNet), so statements stay short.
    const perFarmer = new Map();
    for (const l of built) perFarmer.set(l.farmerId, round2((perFarmer.get(l.farmerId) || 0) + l.farmerNet));
    for (const [farmerId, amt] of perFarmer) {
      await t.put('ledger', entry({ partyId: farmerId, kind: 'sale', amount: amt, cash: 0, refId: id, number, date: saved.date, note: `${number} · ${lotNumbers}` }));
    }
    if (received > 0) {
      const rnum = await nextNumber(t, 'receipt', 'RCV');
      await t.put('ledger', entry({ partyId: buyerId, kind: 'receipt', amount: -received, cash: received, refId: id, number: rnum, date: saved.date, note: number }));
    }
  });
  await refresh('sales', 'ledger', 'meta');
  return saved;
}

// Creates the entry object used for every ledger row.
function entry(fields) {
  return { id: uuid(), createdAt: nowISO(), ...fields };
}

// ---------- payments, expenses & reversals ----------
export async function receivePayment({ buyerId, amount, date, notes = '' }) {
  if (!party(buyerId) || party(buyerId).type !== 'buyer') throw new AppError('err_buyer');
  const amt = round2(num(amount, NaN));
  if (!(amt > 0)) throw new AppError('err_amount');
  let e;
  await DB.write(['ledger', 'meta'], async (t) => {
    const number = await nextNumber(t, 'receipt', 'RCV');
    e = entry({ partyId: buyerId, kind: 'receipt', amount: -amt, cash: amt, refId: null, number, date: date || today(), note: notes.trim() });
    e.refId = e.id;
    await t.put('ledger', e);
  });
  await refresh('ledger', 'meta');
  return e;
}

// kind: 'payment' (ordinary payout) or 'advance' (peshgi, given before the produce is sold).
export async function payFarmer({ farmerId, amount, date, kind = 'payment', notes = '' }) {
  if (!party(farmerId) || party(farmerId).type !== 'farmer') throw new AppError('err_farmer');
  const amt = round2(num(amount, NaN));
  if (!(amt > 0)) throw new AppError('err_amount');
  let e;
  await DB.write(['ledger', 'meta'], async (t) => {
    const number = await nextNumber(t, 'payment', 'PAY');
    e = entry({ partyId: farmerId, kind, amount: -amt, cash: -amt, refId: null, number, date: date || today(), note: notes.trim() });
    e.refId = e.id;
    await t.put('ledger', e);
  });
  await refresh('ledger', 'meta');
  return e;
}

export async function addExpense({ date, category, amount, lotId = '', chargeFarmer = false, notes = '' }) {
  const amt = round2(num(amount, NaN));
  if (!(amt > 0)) throw new AppError('err_amount');
  if (!EXPENSE_CATS.includes(category)) throw new AppError('err_generic');
  const lot = lotId ? lotById(lotId) : null;
  if (chargeFarmer && !lot) throw new AppError('err_farmer');
  const now = nowISO();
  let exp;
  await DB.write(['expenses', 'ledger', 'meta'], async (t) => {
    const number = await nextNumber(t, 'expense', 'EXP');
    exp = { id: uuid(), number, date: date || today(), category, amount: amt, lotId: lot?.id || null, farmerId: chargeFarmer ? lot.farmerId : null, chargeFarmer: !!chargeFarmer, notes: notes.trim(), void: false, createdAt: now };
    await t.put('expenses', exp);
    if (chargeFarmer) await t.put('ledger', entry({ partyId: lot.farmerId, kind: 'charge', amount: -amt, cash: 0, refId: exp.id, number, date: exp.date, note: lot.number }));
  });
  await refresh('expenses', 'ledger', 'meta');
  return exp;
}

// Reverses a document. Ledger rows are never deleted; reversal rows are added with the same refId.
export async function voidDoc(kind, id, reason = '') {
  const store = kind === 'sale' ? 'sales' : kind === 'expense' ? 'expenses' : null;
  const ledgerRows = S.ledger.filter((e) => e.refId === id && e.kind !== 'void');
  const already = S.ledger.some((e) => e.refId === id && e.kind === 'void');
  if (kind === 'sale' && saleById(id)?.void) throw new AppError('voided');
  if (!ledgerRows.length && !store) throw new AppError('err_generic');
  const at = nowISO();
  await DB.write(['sales', 'expenses', 'ledger', 'audit'], async (t) => {
    if (store) {
      const doc = await t.get(store, id);
      if (!doc || doc.void) return;
      await t.put(store, { ...doc, void: true, voidReason: reason.trim(), voidedAt: at });
    }
    if (!already) {
      for (const e of ledgerRows) {
        await t.put('ledger', entry({ partyId: e.partyId, kind: 'void', amount: -e.amount, cash: -e.cash, refId: id, number: e.number, date: today(), note: `↺ ${e.number || kind}`, reverses: e.id }));
      }
    }
    await t.put('audit', { id: uuid(), at, action: `void-${kind}`, detail: `${id} ${reason}`.trim() });
  });
  await refresh('sales', 'expenses', 'ledger', 'audit');
}

// ---------- balances & ledgers ----------
export function balance(partyId) {
  return round2(S.ledger.reduce((n, e) => (e.partyId === partyId ? n + e.amount : n), 0));
}
const balanceMap = () => {
  const m = new Map();
  for (const e of S.ledger) m.set(e.partyId, (m.get(e.partyId) || 0) + e.amount);
  return m;
};
export function totals() {
  const m = balanceMap();
  let receivable = 0; let payable = 0; let advances = 0;
  for (const p of S.parties) {
    const b = m.get(p.id) || 0;
    if (p.type === 'buyer' && b > 0) receivable += b;
    if (p.type === 'farmer') { if (b > 0) payable += b; else advances += -b; }
  }
  return { receivable: round2(receivable), payable: round2(payable), farmerAdvances: round2(advances) };
}

// Statement lines for one party, with running balance. Opening = everything before `from`.
export function statement(partyId, from, to) {
  const rows = S.ledger.filter((e) => e.partyId === partyId).sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt.localeCompare(b.createdAt));
  let opening = 0;
  const out = [];
  let run = 0;
  for (const e of rows) {
    if (e.date < from) { opening += e.amount; run += e.amount; continue; }
    if (e.date > to) continue;
    run += e.amount;
    out.push({ ...e, running: round2(run) });
  }
  return { opening: round2(opening), rows: out, closing: round2(run) };
}

// Buyer aging: unpaid bills in order of age (payments are applied to the oldest bills first).
export function buyerAging(buyerId) {
  const sales = S.sales.filter((s) => s.buyerId === buyerId && !s.void).sort((a, b) => a.date.localeCompare(b.date));
  const bal = balance(buyerId);
  let paid = round2(sales.reduce((n, s) => n + s.total, 0) - bal);
  const open = [];
  for (const s of sales) {
    const applied = Math.min(Math.max(paid, 0), s.total);
    paid = round2(paid - applied);
    const due = round2(s.total - applied);
    if (due > 0.005) open.push({ sale: s, due, days: daysBetween(s.date, today()) });
  }
  return { open, balance: bal };
}

// Cash movements (receipts, payments, advances, expenses) with running cash.
export function cashRows(from, to) {
  const reversed = new Set(S.ledger.filter((e) => e.kind === 'void').map((e) => e.refId));
  const rows = [];
  // voidId = "<kind>|<id>" for a stand-alone receipt, payment or expense that can still be cancelled.
  for (const e of S.ledger) {
    if (!e.cash) continue;
    const standalone = e.refId === e.id && !reversed.has(e.id);
    rows.push({ date: e.date, at: e.createdAt, in: e.cash > 0 ? e.cash : 0, out: e.cash < 0 ? -e.cash : 0, kind: e.kind, number: e.number, partyId: e.partyId, note: e.note || '', voidId: standalone ? `ledger|${e.id}` : null });
  }
  for (const x of S.expenses) if (!x.void) rows.push({ date: x.date, at: x.createdAt, in: 0, out: x.amount, kind: 'expense', number: x.number, partyId: x.farmerId, note: x.notes || '', category: x.category, voidId: `expense|${x.id}` });
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
  const opening = cashBalance(null, from);
  let run = opening;
  const inRange = rows.filter((r) => r.date >= from && r.date <= to).map((r) => { run += r.in - r.out; return { ...r, running: round2(run) }; });
  return { opening: round2(opening), rows: inRange, closing: round2(run) };
}
// Cash balance up to (not including) date `before`, or all time when before is null.
export function cashBalance(_from, before = null) {
  let c = Number(S.settings.openingCash) || 0;
  for (const e of S.ledger) if (e.cash && (!before || e.date < before)) c += e.cash;
  for (const x of S.expenses) if (!x.void && (!before || x.date < before)) c -= x.amount;
  return round2(c);
}

// ---------- sales & commission helpers for views ----------
export function salesBetween(from, to) {
  return S.sales.filter((s) => !s.void && s.date >= from && s.date <= to);
}

// ---------- rates (bhav board) ----------
export const rateFor = (date, commodityId) => S.rates.find((r) => r.id === `${date}|${commodityId}`) || null;
export const lastRateFor = (commodityId) => {
  for (const s of S.sales) {
    if (s.void) continue;
    const l = s.lines.find((x) => x.commodityId === commodityId);
    if (l) return l.rate;
  }
  return null;
};
export async function saveRate({ date, commodityId, low, high }) {
  const lo = num(low, NaN); const hi = num(high, NaN);
  if (!(lo >= 0) || Number.isNaN(lo)) throw new AppError('err_number');
  if (Number.isNaN(hi) || hi < lo) throw new AppError('err_number');
  await DB.putOne('rates', { id: `${date}|${commodityId}`, date, commodityId, low: lo, high: hi, updatedAt: nowISO() });
  await refresh('rates');
}

// ---------- parties ----------
export async function saveParty(v) {
  const name = (v.name || '').trim();
  if (!name) throw new AppError('err_name');
  if (!['farmer', 'buyer'].includes(v.type)) throw new AppError('err_generic');
  const now = nowISO();
  const old = v.id ? party(v.id) : null;
  const saved = {
    id: v.id || uuid(), type: v.type, name, phone: (v.phone || '').trim(), village: (v.village || '').trim(),
    creditLimit: v.creditLimit ? round2(num(v.creditLimit, 0)) || null : null,
    notes: (v.notes || '').trim(), active: old ? old.active !== false : true, createdAt: old?.createdAt || now,
  };
  await DB.putOne('parties', saved);
  await refresh('parties');
  return saved;
}
export async function setPartyActive(id, active) {
  const p = party(id);
  if (!p) return;
  await DB.putOne('parties', { ...p, active });
  await refresh('parties');
}
export const partyHasRecords = (id) => S.ledger.some((e) => e.partyId === id) || S.lots.some((l) => l.farmerId === id) || S.sales.some((s) => s.buyerId === id);

// ---------- items ----------
export async function saveCommodity(v) {
  const name = (v.name || '').trim();
  if (!name) throw new AppError('err_name');
  if (!ALL_UNITS.includes(v.unit)) throw new AppError('err_generic');
  const old = v.id ? commodity(v.id) : null;
  if (old && old.unit !== v.unit && S.lots.some((l) => l.commodityId === old.id)) throw new AppError('err_generic');
  const pct = v.commissionPct === '' || v.commissionPct == null ? null : round2(num(v.commissionPct, NaN));
  if (pct !== null && (Number.isNaN(pct) || pct < 0 || pct > 100)) throw new AppError('err_number');
  const saved = { id: v.id || uuid(), name, nameUr: (v.nameUr || '').trim(), unit: v.unit, commissionPct: pct, active: old ? old.active !== false : true, createdAt: old?.createdAt || nowISO() };
  await DB.putOne('commodities', saved);
  await refresh('commodities');
  return saved;
}
export const commodityInUse = (id) => S.lots.some((l) => l.commodityId === id);
export async function setCommodityActive(id, active) {
  const c = commodity(id);
  if (!c) return;
  await DB.putOne('commodities', { ...c, active });
  await refresh('commodities');
}

// ---------- audit ----------
async function audit(action, detail = '') {
  await DB.putOne('audit', { id: uuid(), at: nowISO(), action, detail });
}

// ---------- refresh ----------
// Reloads the named collections from IndexedDB into S.
async function refresh(...names) {
  const map = {
    meta: async () => {
      const row = await DB.getOne('meta', 'settings');
      if (row) S.settings = { ...DEFAULT_SETTINGS, ...row.value };
    },
    parties: async () => { S.parties = (await DB.getAll('parties')).sort(byName); },
    commodities: async () => { S.commodities = (await DB.getAll('commodities')).sort(byName); },
    lots: async () => { S.lots = (await DB.getAll('lots')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt)); },
    sales: async () => { S.sales = (await DB.getAll('sales')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt)); },
    ledger: async () => { S.ledger = (await DB.getAll('ledger')).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); },
    expenses: async () => { S.expenses = (await DB.getAll('expenses')).sort((a, b) => (b.date || '').localeCompare(a.date || '')); },
    rates: async () => { S.rates = await DB.getAll('rates'); },
    audit: async () => { S.audit = (await DB.getAll('audit')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200); },
  };
  for (const n of new Set(names)) await map[n]?.();
}

// ---------- backup & restore ----------
const BACKUP_FORMAT = 'ghallamandi-backup';
const BACKUP_VERSION = 1;
const DATA_STORES = ['parties', 'commodities', 'lots', 'sales', 'ledger', 'expenses', 'rates', 'audit'];

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Settings without the PIN fields (a PIN must not travel inside a backup file).
const exportSettings = () => {
  const { pinHash, pinSalt, pinIterations, lastBackupAt, ...rest } = S.settings; // eslint-disable-line no-unused-vars
  return rest;
};

export async function buildBackup() {
  const data = {};
  for (const s of DATA_STORES) data[s] = await DB.getAll(s);
  const meta = await DB.getAll('meta');
  const counters = Object.fromEntries(meta.filter((m) => m.key.startsWith('counter:')).map((m) => [m.key, m.value]));
  const body = { settings: exportSettings(), counters, data };
  const json = JSON.stringify(body);
  const counts = Object.fromEntries(DATA_STORES.map((s) => [s, data[s].length]));
  return { format: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, createdAt: nowISO(), counts, checksum: await sha256Hex(json), body: json };
}

export async function markBackup() {
  await saveSettings({ lastBackupAt: nowISO() });
}

// Validates a backup file before anything is changed. Returns the parsed body and counts.
export async function readBackup(text) {
  let file;
  try { file = JSON.parse(text); } catch { throw new AppError('bad_backup'); }
  if (!file || file.format !== BACKUP_FORMAT || file.backupVersion !== BACKUP_VERSION || typeof file.body !== 'string') throw new AppError('bad_backup');
  if ((await sha256Hex(file.body)) !== file.checksum) throw new AppError('bad_backup');
  const body = JSON.parse(file.body);
  for (const s of DATA_STORES) if (!Array.isArray(body.data?.[s])) throw new AppError('bad_backup');
  for (const s of DATA_STORES) {
    if (body.data[s].some((r) => !r || typeof r.id !== 'string')) throw new AppError('bad_backup');
  }
  return { body, counts: file.counts, createdAt: file.createdAt };
}

export async function restoreBackup(body, mode) {
  await DB.write([...DATA_STORES, 'meta'], async (t) => {
    if (mode === 'replace') {
      for (const s of DATA_STORES) await t.clear(s);
      for (const [k, v] of Object.entries(body.counters || {})) await t.put('meta', { key: k, value: v });
      await t.put('meta', { key: 'settings', value: { ...S.settings, ...body.settings, pinHash: S.settings.pinHash, pinSalt: S.settings.pinSalt, pinIterations: S.settings.pinIterations } });
      await t.put('meta', { key: 'seeded', value: true });
      for (const s of DATA_STORES) for (const r of body.data[s]) await t.put(s, r);
    } else {
      // Merge: add only records whose id is new. Existing records are never overwritten.
      for (const s of DATA_STORES) {
        const have = new Set((await t.getAll(s)).map((r) => r.id));
        for (const r of body.data[s]) if (!have.has(r.id)) await t.put(s, r);
      }
    }
  });
  await loadAll();
}

export async function eraseAll() {
  await DB.clearAll();
  S.settings = { ...DEFAULT_SETTINGS };
  S.parties = []; S.commodities = []; S.lots = []; S.sales = []; S.ledger = []; S.expenses = []; S.rates = []; S.audit = [];
  await DB.putOne('meta', { key: 'settings', value: S.settings });
  await loadAll();
}

// ---------- search ----------
// Matches farmers, buyers, lots, bills and items by name, phone, lot or bill number.
export function searchParties(list, q) {
  const n = norm(q);
  if (!n) return list;
  return list.filter((p) => norm(p.name).includes(n) || norm(p.phone).includes(n) || norm(p.village).includes(n));
}

export async function setupShop({ shopName, ownerName, pinHash, pinSalt, pinIterations }) {
  await saveSettings({ shopName: shopName.trim(), ownerName: ownerName.trim(), pinHash: pinHash || '', pinSalt: pinSalt || '', pinIterations: pinIterations || 0, setupDone: true });
  await audit('setup', 'shop set up');
}

export const hasLock = () => !!S.settings.pinHash;
export const CONSUMED = consumedMap; // exported for tests and reports
