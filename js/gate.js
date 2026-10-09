// Gate screens: first-run setup (shop name, owner, optional PIN) and the PIN lock.
import { t, isUr } from './i18n.js';
import { S, setupShop } from './store.js';
import { makePinFields, checkPin, validPin } from './auth.js';
import { esc } from './util.js';
import { ic } from './ui.js';

// Animated brand mark: a sheaf grows, a truck rolls in, a scale swings. Pure CSS/SVG, no images.
export const heroArt = () => `
  <div class="hero-art" aria-hidden="true">
    <div class="sun"></div>
    <svg viewBox="0 0 320 200" class="hero-svg">
      <path class="ground" d="M0 170 Q160 150 320 172 L320 200 L0 200Z"/>
      <g class="sheaf">
        <path class="stalk s1" d="M118 166 Q112 120 98 90"/>
        <path class="stalk s2" d="M126 166 Q124 118 128 80"/>
        <path class="stalk s3" d="M134 166 Q140 120 158 92"/>
        <path class="stalk s4" d="M110 166 Q100 132 82 112"/>
        <path class="stalk s5" d="M142 166 Q152 132 172 116"/>
        <ellipse class="grain g1" cx="98" cy="86" rx="7" ry="11"/>
        <ellipse class="grain g2" cx="128" cy="76" rx="7" ry="11"/>
        <ellipse class="grain g3" cx="160" cy="88" rx="7" ry="11"/>
        <ellipse class="grain g4" cx="80" cy="108" rx="6" ry="10"/>
        <ellipse class="grain g5" cx="174" cy="112" rx="6" ry="10"/>
        <rect class="band" x="106" y="140" width="46" height="8" rx="4"/>
      </g>
      <g class="truck">
        <rect x="196" y="112" width="92" height="46" rx="6" class="box"/>
        <path d="M288 124 h18 l12 16 v18 h-30z" class="cab"/>
        <rect x="298" y="128" width="12" height="10" rx="2" class="glass"/>
        <circle cx="216" cy="162" r="10" class="wheel"/><circle cx="216" cy="162" r="4" class="hub"/>
        <circle cx="304" cy="162" r="10" class="wheel"/><circle cx="304" cy="162" r="4" class="hub"/>
        <rect x="204" y="120" width="26" height="12" rx="3" class="crate"/>
        <rect x="232" y="120" width="26" height="12" rx="3" class="crate"/>
      </g>
    </svg>
  </div>`;

export function renderSetup(root, onDone) {
  root.innerHTML = `
  <div class="gate gate-setup">
    <div class="gate-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span></div>
    <div class="gate-card card-glass">
      ${heroArt()}
      <h1 class="gate-title">${esc(t('setup_title'))}</h1>
      <p class="gate-sub">${esc(t('setup_sub'))}</p>
      <form class="gate-form" novalidate>
        <div class="field"><label>${esc(t('shop_name'))} *</label><input name="shopName" class="input" required maxlength="120" autocomplete="organization"></div>
        <div class="field"><label>${esc(t('owner_name'))}</label><input name="ownerName" class="input" maxlength="80" autocomplete="name"></div>
        <div class="field"><label>${esc(t('set_pin'))}</label>
          <div class="pin-dots" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <input name="pin" class="input pin-in" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="····">
          <input name="repeat" class="input pin-in mt-2" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${esc(t('pin_repeat'))}">
          <div class="field-hint">${esc(t('pin_hint'))}</div></div>
        <div class="form-error d-none" role="alert"></div>
        <button type="submit" class="btn btn-primary btn-lg w-100 btn-start"><span>${esc(t('start'))}</span>${ic(isUr() ? 'back' : 'forward')}</button>
        <button type="button" class="btn btn-link w-100 skip-pin">${esc(t('skip_pin'))}</button>
      </form>
    </div>
  </div>`;
  const form = root.querySelector('form');
  const err = root.querySelector('.form-error');
  const fail = (msg) => { err.textContent = msg; err.classList.remove('d-none'); root.querySelector('.gate-card').classList.remove('shake'); void root.offsetWidth; root.querySelector('.gate-card').classList.add('shake'); };
  const pinInput = form.pin;
  pinInput.addEventListener('input', () => {
    const n = pinInput.value.replace(/\D/g, '').length;
    root.querySelectorAll('.pin-dots span').forEach((d, i) => d.classList.toggle('on', i < n));
  });
  const submit = async (skipPin) => {
    err.classList.add('d-none');
    const shopName = form.shopName.value.trim();
    if (!shopName) return fail(t('err_name'));
    try {
      let pinFields = { pinHash: '', pinSalt: '', pinIterations: 0 };
      if (!skipPin && (form.pin.value || form.repeat.value)) {
        if (!validPin(form.pin.value)) return fail(t('err_pin_len'));
        if (form.pin.value !== form.repeat.value) return fail(t('err_pin_mismatch'));
        pinFields = await makePinFields(form.pin.value);
      }
      await setupShop({ shopName, ownerName: form.ownerName.value, ...pinFields });
      onDone();
    } catch (ex) { fail(ex.message || t('err_generic')); }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(false); });
  root.querySelector('.skip-pin').addEventListener('click', () => submit(true));
  setTimeout(() => form.shopName.focus({ preventScroll: true }), 600);
}

let lockKeyHandler = null;
function dropLockKeys() {
  if (lockKeyHandler) document.removeEventListener('keydown', lockKeyHandler);
  lockKeyHandler = null;
}

// PIN keypad. Calls onUnlock() once the right PIN is entered; onForgot() opens the erase path.
export function renderLock(root, onUnlock, onForgot) {
  dropLockKeys();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
  root.innerHTML = `
  <div class="gate gate-lock">
    <div class="gate-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span></div>
    <div class="gate-card lock-card">
      <div class="lock-mark">${ic('lock')}</div>
      <h1 class="gate-title">${esc(S.settings.shopName || t('app_name'))}</h1>
      <p class="gate-sub">${esc(t('lock_hint'))}</p>
      <div class="pin-dots lg" role="status" aria-live="polite"><span></span><span></span><span></span><span></span></div>
      <div class="lock-err d-none" role="alert">${esc(t('unlock_wrong'))}</div>
      <div class="keypad">${keys.map((k) => k === ''
        ? '<span></span>'
        : `<button type="button" class="key ${k === 'back' ? 'key-back' : ''}" data-k="${k}" aria-label="${k === 'back' ? esc(t('back')) : k}">${k === 'back' ? ic('x') : k}</button>`).join('')}</div>
      <button type="button" class="btn btn-link forgot">${esc(t('forgot_pin'))}</button>
    </div>
  </div>`;
  root.querySelector('.forgot').addEventListener('click', () => onForgot?.());
  let pin = '';
  const dots = () => root.querySelectorAll('.pin-dots span').forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const wrong = () => {
    const card = root.querySelector('.lock-card');
    root.querySelector('.lock-err').classList.remove('d-none');
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    pin = ''; dots();
  };
  const press = async (k) => {
    if (k === 'back') pin = pin.slice(0, -1);
    else if (pin.length < 4) pin += k;
    root.querySelector('.lock-err').classList.add('d-none');
    dots();
    if (pin.length === 4) {
      const ok = await checkPin(pin);
      if (ok) {
        dropLockKeys();
        root.querySelectorAll('.pin-dots span').forEach((d) => d.classList.add('ok'));
        setTimeout(onUnlock, 260);
      } else wrong();
    }
  };
  root.querySelectorAll('.key').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
  // Hardware keyboards and desktop testing.
  lockKeyHandler = (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
  };
  document.addEventListener('keydown', lockKeyHandler);
}
