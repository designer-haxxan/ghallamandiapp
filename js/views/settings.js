// Settings: shop details, defaults, items, PIN lock, language, backup & restore, erase.
import { t, itemName, unitLabel, isUr } from '../i18n.js';
import { S, saveSettings, saveCommodity, setCommodityActive, commodityInUse, ALL_UNITS, buildBackup, markBackup, readBackup, restoreBackup, eraseAll, commodity } from '../store.js';
import { esc, fmtNum, num, download, today, fmtDateTime, AppError } from '../util.js';
import { ic, page, formSheet, toast, toastError, sectionTitle } from '../ui.js';
import { setPin, clearPin, checkPin, validPin } from '../auth.js';

export async function render(main, { rerender }) {
  const s = S.settings;
  const counts = {
    farmers: S.parties.filter((p) => p.type === 'farmer').length,
    buyers: S.parties.filter((p) => p.type === 'buyer').length,
    lots: S.lots.length, sales: S.sales.length, ledger: S.ledger.length, expenses: S.expenses.length,
  };
  const other = isUr() ? 'index.html' : 'urdu.html';

  main.innerHTML = page(t('settings'), `
    <section class="card">
      ${sectionTitle(t('shop_info'))}
      <form class="sheet-form inline-form" data-form="shop" novalidate>
        <div class="field-grid">
          <div class="field span-2"><label>${esc(t('shop_name'))}</label><input name="shopName" class="input" maxlength="120" value="${esc(s.shopName)}"></div>
          <div class="field"><label>${esc(t('owner_name'))}</label><input name="ownerName" class="input" value="${esc(s.ownerName)}"></div>
          <div class="field"><label>${esc(t('phone'))}</label><input name="phone" class="input" inputmode="tel" value="${esc(s.phone)}"></div>
          <div class="field span-2"><label>${esc(t('address'))}</label><input name="address" class="input" value="${esc(s.address)}"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary"><span>${esc(t('save'))}</span></button></div>
      </form>
    </section>

    <section class="card">
      ${sectionTitle(t('defaults'))}
      <form class="sheet-form inline-form" data-form="defaults" novalidate>
        <div class="field-grid">
          <div class="field"><label>${esc(t('default_commission'))}</label><input name="commissionPct" class="input num-in" inputmode="decimal" value="${esc(s.commissionPct)}"></div>
          <div class="field"><label>${esc(t('market_fee_pct'))}</label><input name="marketFeePct" class="input num-in" inputmode="decimal" value="${esc(s.marketFeePct)}"></div>
          <div class="field"><label>${esc(t('default_tare'))}</label><input name="tarePerBagKg" class="input num-in" inputmode="decimal" value="${esc(s.tarePerBagKg)}"></div>
          <div class="field"><label>${esc(t('opening_cash_input'))}</label><input name="openingCash" class="input num-in" inputmode="decimal" value="${esc(s.openingCash)}"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary"><span>${esc(t('save'))}</span></button></div>
      </form>
    </section>

    <section class="card">
      ${sectionTitle(t('items'), `<button type="button" class="btn btn-soft btn-sm" data-item-new>${ic('plus')} ${esc(t('item_new'))}</button>`)}
      <p class="muted small">${esc(t('items_help'))}</p>
      <div class="list" id="items">${S.commodities.map((c) => `
        <div class="row-link ${c.active === false ? 'is-void' : ''}" data-item="${esc(c.id)}">
          <span class="row-main"><span class="row-title">${esc(itemName(c))}${c.nameUr && !isUr() ? ` <span class="muted">· ${esc(c.nameUr)}</span>` : ''}</span>
          <span class="row-sub">${esc(unitLabel(c.unit))} · ${esc(t('item_commission'))}: ${c.commissionPct == null ? `${fmtNum(s.commissionPct)}% (${esc(t('none'))})` : `${fmtNum(c.commissionPct)}%`}${c.active === false ? ' · ' + esc(t('party_hidden')) : ''}</span></span>
          ${ic(isUr() ? 'back' : 'chevron')}</div>`).join('')}
      </div>
    </section>

    <section class="card">
      ${sectionTitle(t('security'))}
      <div class="row-static"><span>${s.pinHash ? ic('lock') : ic('shield')} ${esc(s.pinHash ? t('pin_on') : t('pin_off'))}</span></div>
      <div class="action-row">
        <button type="button" class="btn btn-primary" data-pin>${esc(s.pinHash ? t('change_pin') : t('pin_set'))}</button>
        ${s.pinHash ? `<button type="button" class="btn btn-ghost" data-pin-off>${esc(t('remove_pin'))}</button>` : ''}
      </div>
    </section>

    <section class="card">
      ${sectionTitle(t('lang_setting'))}
      <p class="muted small">${esc(t('lang_help'))}</p>
      <a class="btn btn-soft btn-lg w-100" href="${other}">${ic('globe')} ${esc(isUr() ? 'English' : 'اردو')}</a>
    </section>

    <section class="card">
      ${sectionTitle(t('backup_restore'))}
      <p class="muted small">${esc(t('last_backup'))}: <b>${s.lastBackupAt ? esc(fmtDateTime(s.lastBackupAt)) : '—'}</b></p>
      <div class="action-row">
        <button type="button" class="btn btn-primary" data-export>${ic('download')} ${esc(t('export_backup'))}</button>
        <label class="btn btn-ghost file-btn">${ic('upload')} ${esc(t('import_backup'))}<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
      <div class="stat-table small">
        ${[['farmers', 'farmers'], ['buyers', 'buyers'], ['lots', 'arrivals'], ['sales', 'sales'], ['ledger', 'balance'], ['expenses', 'expenses']].map(([k, label]) => `<div><span>${esc(t(label))}</span><b>${fmtNum(counts[k])}</b></div>`).join('')}
      </div>
    </section>

    <section class="card danger-card">
      ${sectionTitle(t('erase_all'))}
      <p class="muted small">${esc(t('erase_confirm'))}</p>
      <button type="button" class="btn btn-danger" data-erase>${ic('trash')} ${esc(t('erase_all'))}</button>
    </section>

    <section class="card about">
      <div class="about-logo">${ic('sprout')}</div>
      <div><b>${esc(t('app_name'))}</b> · ${esc(t('version'))} 1.0.0</div>
      <div class="muted small">${esc(t('app_tagline'))}</div>
    </section>`);

  // Save shop details and defaults.
  main.querySelectorAll('form[data-form]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const v = Object.fromEntries(new FormData(f).entries());
      if (f.dataset.form === 'shop') {
        await saveSettings({ shopName: (v.shopName || '').trim(), ownerName: (v.ownerName || '').trim(), phone: (v.phone || '').trim(), address: (v.address || '').trim() });
        document.dispatchEvent(new Event('app:shop-changed'));
      } else {
        const pct = num(v.commissionPct, NaN); const fee = num(v.marketFeePct, NaN); const tare = num(v.tarePerBagKg, NaN); const cash = num(v.openingCash, NaN);
        if (!(pct >= 0 && pct <= 100) || !(fee >= 0 && fee <= 100) || !(tare >= 0) || Number.isNaN(cash)) throw new AppError('err_number');
        await saveSettings({ commissionPct: pct, marketFeePct: fee, tarePerBagKg: tare, openingCash: cash });
      }
      toast(t('saved'));
    } catch (ex) { toastError(ex); } finally { btn.disabled = false; }
  }));

  // Items.
  main.querySelector('[data-item-new]').addEventListener('click', () => itemForm(null, rerender));
  main.querySelector('#items').addEventListener('click', (e) => {
    const row = e.target.closest('[data-item]');
    if (row) itemForm(commodity(row.dataset.item), rerender);
  });

  // PIN.
  main.querySelector('[data-pin]').addEventListener('click', () => pinForm(rerender));
  main.querySelector('[data-pin-off]')?.addEventListener('click', () => pinOff(rerender));

  // Backup.
  main.querySelector('[data-export]').addEventListener('click', async () => {
    try {
      const b = await buildBackup();
      const file = { format: b.format, backupVersion: b.backupVersion, appVersion: '1.0.0', createdAt: b.createdAt, counts: b.counts, checksum: b.checksum, body: b.body };
      download(`ghallamandi-backup-${today()}.json`, JSON.stringify(file), 'application/json');
      await markBackup();
      toast(t('backup_done'));
      rerender();
    } catch (ex) { toastError(ex); }
  });
  main.querySelector('[data-import]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const { body, counts: c, createdAt } = await readBackup(await f.text());
      restorePreview(c, createdAt, body, rerender);
    } catch (ex) { toastError(ex); }
  });

  // Erase.
  main.querySelector('[data-erase]').addEventListener('click', () => typedConfirm(t('erase_all'), 'ERASE', async () => {
    await eraseAll();
    toast(t('erased'));
    document.dispatchEvent(new Event('app:reset'));
  }));
}

function itemForm(c, rerender) {
  const inUse = c ? commodityInUse(c.id) : false;
  return formSheet({
    title: c ? t('edit') : t('item_new'),
    body: `<div class="field-grid">
      <div class="field span-2"><label>${esc(t('name'))} *</label><input name="name" class="input" required value="${esc(c?.name || '')}"></div>
      <div class="field span-2"><label>${esc(t('item_name_ur'))}</label><input name="nameUr" class="input" value="${esc(c?.nameUr || '')}"></div>
      <div class="field"><label>${esc(t('item_unit'))}</label><select name="unit" class="select" ${inUse ? 'disabled' : ''}>
        ${ALL_UNITS.map((u) => `<option value="${u}" ${(c?.unit || 'maund') === u ? 'selected' : ''}>${esc(unitLabel(u))}</option>`).join('')}</select>
        ${inUse ? `<input type="hidden" name="unit" value="${esc(c.unit)}">` : ''}</div>
      <div class="field"><label>${esc(t('item_commission'))}</label><input name="commissionPct" class="input num-in" inputmode="decimal" value="${esc(c?.commissionPct ?? '')}" placeholder="${esc(S.settings.commissionPct)}"></div>
      <div class="field span-2 muted small">${esc(t('item_commission_help'))}</div>
      ${c ? `<div class="field span-2"><label class="check"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> <span>${esc(t('item_active'))}</span></label></div>` : ''}
    </div>`,
    onSubmit: async (v) => {
      await saveCommodity({ id: c?.id, name: v.name, nameUr: v.nameUr, unit: v.unit, commissionPct: v.commissionPct });
      if (c && (v.active === undefined ? true : v.active) !== (c.active !== false)) await setCommodityActive(c.id, !!v.active);
      toast(t('saved'));
      rerender();
      return true;
    },
  });
}

function pinForm(rerender) {
  const has = !!S.settings.pinHash;
  return formSheet({
    title: has ? t('change_pin') : t('set_pin'),
    body: `<div class="field-grid">
      ${has ? `<div class="field span-2"><label>${esc(t('unlock_title'))}</label><input name="current" class="input pin-in" inputmode="numeric" maxlength="4" autocomplete="off"></div>` : ''}
      <div class="field span-2"><label>${esc(t('pin_new'))}</label><input name="pin" class="input pin-in" inputmode="numeric" maxlength="4" autocomplete="off"></div>
      <div class="field span-2"><label>${esc(t('pin_repeat'))}</label><input name="repeat" class="input pin-in" inputmode="numeric" maxlength="4" autocomplete="off"></div>
      <div class="field-hint span-2">${esc(t('pin_hint'))}</div></div>`,
    onSubmit: async (v) => {
      if (has && !await checkPin(v.current)) throw new AppError('err_pin_wrong');
      if (!validPin(v.pin)) throw new AppError('err_pin_len');
      if (v.pin !== v.repeat) throw new AppError('err_pin_mismatch');
      await setPin(v.pin);
      toast(t('pin_saved'));
      rerender();
      return true;
    },
  });
}

async function pinOff(rerender) {
  const ok = await formSheet({
    title: t('remove_pin'), submitLabel: t('remove_pin'), danger: true,
    body: `<div class="field"><label>${esc(t('unlock_title'))}</label><input name="current" class="input pin-in" inputmode="numeric" maxlength="4" autocomplete="off"></div>`,
    onSubmit: async (v) => {
      if (!await checkPin(v.current)) throw new AppError('err_pin_wrong');
      await clearPin();
      return true;
    },
  });
  if (ok) { toast(t('pin_off')); rerender(); }
}

// Shows what a backup contains and asks how to restore it.
function restorePreview(c, createdAt, body, rerender) {
  const rows = [['farmers', 'farmers'], ['buyers', 'buyers'], ['lots', 'arrivals'], ['sales', 'sales'], ['ledger', 'balance'], ['expenses', 'expenses']];
  const countsOf = (k) => c[k] ?? 0;
  formSheet({
    title: t('import_backup'), submitLabel: t('restore_mode'), danger: true,
    body: `<p class="muted small">${esc(t('last_backup'))}: <b>${esc(fmtDateTime(createdAt))}</b></p>
      <div class="stat-table small">${rows.map(([k, label]) => `<div><span>${esc(t(label))}</span><b>${fmtNum(countsOf(k))}</b></div>`).join('')}</div>
      <fieldset class="radio-set"><legend>${esc(t('restore_mode'))}</legend>
        <label class="radio"><input type="radio" name="mode" value="merge" checked> <span>${esc(t('merge_mode'))}</span></label>
        <label class="radio"><input type="radio" name="mode" value="replace"> <span>${esc(t('replace_mode'))}</span></label>
      </fieldset>
      <div class="field replace-only d-none"><label>${esc(t('type_restore'))}</label><input name="typed" class="input" autocomplete="off"></div>`,
    onMount: (el) => {
      el.querySelectorAll('[name=mode]').forEach((r) => r.addEventListener('change', () => {
        el.querySelector('.replace-only').classList.toggle('d-none', r.value !== 'replace' || !r.checked);
      }));
    },
    onSubmit: async (v) => {
      if (v.mode === 'replace' && v.typed !== 'RESTORE') throw new AppError('type_word', { word: 'RESTORE' });
      await restoreBackup(body, v.mode);
      toast(t('restore_done'));
      rerender();
      return true;
    },
  }).catch(toastError);
}

// Destructive action guarded by typing a word.
function typedConfirm(title, word, action) {
  return formSheet({
    title, danger: true, submitLabel: title,
    body: `<p class="confirm-text">${esc(t('erase_confirm'))}</p><div class="field"><label>${esc(word)}</label><input name="typed" class="input" autocomplete="off"></div>`,
    onSubmit: async (v) => {
      if (v.typed !== word) throw new AppError('type_word', { word });
      await action();
      return true;
    },
  }).catch(toastError);
}
