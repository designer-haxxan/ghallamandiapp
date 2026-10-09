// Optional PIN lock. The PIN is hashed with PBKDF2-SHA256 and a random salt; it is never stored in plain text.
// This protects against casual use of an unlocked phone. It is not a substitute for the phone's own lock screen.
import { saveSettings, S } from './store.js';
import { AppError } from './util.js';

const ITER = 150000;
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}

export function validPin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

// Returns the new PIN fields, to be stored in settings by the caller.
export async function makePinFields(pin) {
  if (!validPin(pin)) throw new AppError('err_pin_len');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { pinHash: await derive(pin, salt, ITER), pinSalt: b64(salt), pinIterations: ITER };
}

export async function setPin(pin) {
  await saveSettings(await makePinFields(pin));
}

export async function clearPin() {
  await saveSettings({ pinHash: '', pinSalt: '', pinIterations: 0 });
}

export async function checkPin(pin) {
  if (!S.settings.pinHash) return true;
  const hash = await derive(String(pin), unb64(S.settings.pinSalt), S.settings.pinIterations || ITER);
  return hash === S.settings.pinHash;
}
