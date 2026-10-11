/* Cloud sync — keeps the tracker the same on phone and laptop.
   She logs in with a password only. Behind it is one Firebase email/password account
   (LOGIN_EMAIL, created in the Firebase console with sign-ups turned off), and her data
   lives in Firestore at trackers/{that account's uid}, which the rules let only it read or write. This browser's localStorage stays the working
   copy, so the tracker still works offline and syncs when it's back online. */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, onSnapshot, runTransaction, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// These identify the Firebase project; they're meant to be public. The Firestore rules protect the data.
const firebaseConfig = {
  apiKey: 'AIzaSyBRGj4FHOo2sxDmNGkhQecTVwFxaSkbObc',
  authDomain: 'forbibi-88a25.firebaseapp.com',
  projectId: 'forbibi-88a25',
  storageBucket: 'forbibi-88a25.firebasestorage.app',
  messagingSenderId: '487107955045',
  appId: '1:487107955045:web:c185b7e265ced38e45b98c',
};

// The one account allowed in. It's never shown — the page only asks for the password.
const LOGIN_EMAIL = 'bibi@forbibi-88a25.firebaseapp.com';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* Sync bookkeeping for this device:
   version — the cloud version this device last matched
   dirty   — this device has changes the cloud doesn't have yet */
const META_KEY = STORE_KEY + '.sync';
let meta = (() => {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY));
    if (m) return m;
  } catch (e) { /* ignore */ }
  // first run with sync: anything already saved on this device counts as unsynced
  return { uid: null, version: null, dirty: !!localStorage.getItem(STORE_KEY) };
})();
const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ } };

let user = null;
let ref = null;
let unsubscribe = null;
let status = 'loading';   // loading | signed-out | syncing | synced | offline | error
let errorText = '';
let lastSynced = null;
let editSeq = 0;          // bumps on every local change, so edits made mid-push aren't lost
let pushTimer = null;
let pushing = false;
let pushAgain = false;
let heldSnap = null;       // a cloud update that arrived mid-push; handled once the push settles
const AUTH_FLAG = STORE_KEY + '.auth'; // lets index.html skip the password screen on a logged-in device

/* ---------- status UI ---------- */
const pill = document.getElementById('syncStatus');

function setStatus(s, err = '') {
  status = s; errorText = err;
  const text = {
    loading: '☁ …',
    'signed-out': '🔒 Logged out',
    syncing: '☁ Syncing…',
    synced: '☁ Synced',
    offline: '☁ Offline · saved on this device',
    error: '⚠ Sync problem',
  }[s];
  if (pill) {
    pill.textContent = text;
    pill.className = `sync-pill ${s}`;
    pill.title = err || (lastSynced ? `Last synced ${lastSynced.toLocaleTimeString()}` : '');
  }
  const out = document.getElementById('logoutBtn');
  if (out) out.hidden = !user;
  window.renderSyncPanel();
}

window.renderSyncPanel = () => {
  const el = document.getElementById('syncPanel');
  if (!el) return;
  if (!user) { el.innerHTML = '<p class="muted" style="margin:0">Not logged in.</p>'; el.dataset.mode = 'out'; return; }

  // Build the panel once; later status changes only touch the status line,
  // so a password she's halfway through typing isn't wiped by a sync.
  if (el.dataset.mode !== 'in') {
    el.dataset.mode = 'in';
    el.innerHTML = `
      <p style="margin:0 0 10px" id="syncLine"></p>
      <div class="actions">
        <button class="btn" data-a="sync-now">SYNC NOW</button>
        <button class="btn" data-a="sync-signout">LOG OUT</button>
      </div>
      <p class="sync-err" id="syncErr"></p>

      <h4 class="sub-h">CHANGE PASSWORD</h4>
      <form class="pw-form pw-change" autocomplete="on">
        <input type="text" name="username" value="bibi" autocomplete="username" hidden>
        <input type="password" data-pw="cur" class="field" placeholder="Current password" autocomplete="current-password" required>
        <input type="password" data-pw="new" class="field" placeholder="New password (6+ characters)" autocomplete="new-password" minlength="6" required>
        <input type="password" data-pw="new2" class="field" placeholder="Type the new password again" autocomplete="new-password" minlength="6" required>
        <button class="btn dark" type="submit" data-pw="btn">SET NEW PASSWORD</button>
        <p class="sync-err" data-pw="msg"></p>
      </form>`;
  }
  const when = lastSynced ? ` · last synced ${lastSynced.toLocaleTimeString()}` : '';
  el.querySelector('#syncLine').innerHTML = `✓ Logged in<span class="muted">${when}</span>`;
  el.querySelector('#syncErr').textContent = status === 'error' ? errorText : '';
};

/* ---------- local <-> cloud ---------- */
function payload() {
  const { ui, ...data } = state;   // the open tab is per device, not synced
  return JSON.stringify(data);
}

function applyRemote(json, version) {
  state = normalize({ ...JSON.parse(json), ui: state.ui });
  saveLocal();
  meta.version = version;
  meta.dirty = false;
  saveMeta();
  render();
  renderHeader();
}

// called by app.js save() after every change
window.onTrackerChange = () => {
  editSeq++;
  meta.dirty = true;
  saveMeta();
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 1200);
};

async function push() {
  clearTimeout(pushTimer);
  if (!user || !meta.dirty) return;
  if (pushing) { pushAgain = true; return; }
  pushing = true;
  setStatus('syncing');
  const seq = editSeq;
  try {
    const next = await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      const cur = snap.exists() ? snap.data().version : 0;
      // the cloud moved on since this device last synced: the snapshot listener sorts that out
      if (snap.exists() && cur !== meta.version) throw Object.assign(new Error('stale'), { code: 'stale' });
      tx.set(ref, { json: payload(), version: cur + 1, updatedAt: serverTimestamp() });
      return cur + 1;
    });
    meta.version = next;
    if (editSeq === seq) meta.dirty = false;
    saveMeta();
    lastSynced = new Date();
    setStatus(meta.dirty ? 'syncing' : 'synced');
    if (meta.dirty) pushAgain = true;
  } catch (e) {
    if (e.code !== 'stale') fail(e);
  } finally {
    pushing = false;
    const held = heldSnap; heldSnap = null;
    if (held) onRemote(held);
    if (pushAgain) { pushAgain = false; push(); }
  }
}

function onRemote(snap) {
  if (snap.metadata.hasPendingWrites) return;
  if (pushing) { heldSnap = snap; return; } // may just be our own upload echoing back
  if (!snap.exists()) { meta.dirty = true; push(); return; } // first time: upload this device's copy
  const { json, version } = snap.data();
  lastSynced = new Date();
  if (version === meta.version) {
    if (meta.dirty) push(); else setStatus('synced');
    return;
  }
  if (!meta.dirty) { applyRemote(json, version); setStatus('synced'); return; }

  // both this device and the cloud changed — let her choose
  const useCloud = confirm(
    'The cloud has progress from your other device, and this device also has changes that weren\'t synced yet.\n\n' +
    'OK = use the progress saved in the cloud (recommended)\n' +
    'Cancel = keep this device\'s version and overwrite the cloud'
  );
  if (useCloud) { applyRemote(json, version); setStatus('synced'); }
  else { meta.version = version; saveMeta(); push(); }
}

function fail(e) {
  console.warn('sync:', e);
  if (!navigator.onLine || e.code === 'unavailable') setStatus('offline');
  else if (e.code === 'permission-denied') setStatus('error', 'The cloud refused access. Check that the Firestore rules were published.');
  else setStatus('error', e.message || String(e));
}

/* ---------- auth ---------- */
onAuthStateChanged(auth, u => {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  user = u;
  lock(!u);
  if (!u) { ref = null; setStatus('signed-out'); return; }
  if (meta.uid !== u.uid) {   // a different account than this device last synced with
    meta.uid = u.uid;
    meta.version = null;
    saveMeta();
  }
  ref = doc(db, 'trackers', u.uid);
  setStatus('syncing');
  unsubscribe = onSnapshot(ref, onRemote, fail);
});

/* ---------- password screen ---------- */
function lock(on) {
  document.documentElement.classList.toggle('locked', on);
  try { if (on) localStorage.removeItem(AUTH_FLAG); else localStorage.setItem(AUTH_FLAG, '1'); } catch (e) { /* ignore */ }
  if (on) setTimeout(() => showLockForm(false), 0);
}

async function logIn(password) {
  const btn = document.getElementById('loginBtn'), err = document.getElementById('loginErr');
  btn.disabled = true; btn.textContent = '…'; err.textContent = '';
  try {
    await signInWithEmailAndPassword(auth, LOGIN_EMAIL, password);
    document.getElementById('loginPw').value = '';
  } catch (e) {
    err.textContent = {
      'auth/invalid-credential': 'Wrong password.',
      'auth/wrong-password': 'Wrong password.',
      'auth/invalid-login-credentials': 'Wrong password.',
      'auth/user-not-found': "The login account isn't set up in Firebase yet.",
      'auth/too-many-requests': 'Too many tries — wait a few minutes and try again.',
      'auth/network-request-failed': 'No internet connection.',
      'auth/operation-not-allowed': "Password login isn't turned on in Firebase yet.",
    }[e.code] || `Couldn't log in: ${e.message}`;
    document.getElementById('loginPw').select();
  } finally {
    btn.disabled = false; btn.textContent = 'ENTER';
  }
}

// Works from the password screen (logs in with the current password, then changes it)
// and from Settings (re-checks the current password, then changes it).
async function changePassword(form) {
  const f = k => form.querySelector(`[data-pw="${k}"]`);
  const cur = f('cur'), nw = f('new'), nw2 = f('new2'), btn = f('btn'), msg = f('msg');
  const say = (text, ok) => { msg.textContent = text; msg.classList.toggle('ok', !!ok); };
  if (nw.value !== nw2.value) { say("The new passwords don't match."); nw2.select(); return; }
  if (nw.value.length < 6) { say('The new password needs at least 6 characters.'); nw.select(); return; }
  btn.disabled = true; btn.textContent = '…'; say('');
  try {
    if (user) await reauthenticateWithCredential(user, EmailAuthProvider.credential(LOGIN_EMAIL, cur.value));
    else await signInWithEmailAndPassword(auth, LOGIN_EMAIL, cur.value);
    await updatePassword(auth.currentUser, nw.value);
    cur.value = nw.value = nw2.value = '';
    say('Password changed! Use the new one next time you log in on another device.', true);
    toast('Password changed!');
  } catch (e) {
    say({
      'auth/invalid-credential': 'The current password is wrong.',
      'auth/wrong-password': 'The current password is wrong.',
      'auth/invalid-login-credentials': 'The current password is wrong.',
      'auth/weak-password': 'The new password needs at least 6 characters.',
      'auth/too-many-requests': 'Too many tries — wait a few minutes and try again.',
      'auth/network-request-failed': 'No internet connection.',
    }[e.code] || `Couldn't change the password: ${e.message}`);
  } finally {
    btn.disabled = false; btn.textContent = 'SET NEW PASSWORD';
  }
}

document.addEventListener('submit', e => {
  if (!e.target.classList.contains('pw-change')) return;
  e.preventDefault();
  changePassword(e.target);
});

// password screen: switch between "enter password" and "change password"
function showLockForm(change) {
  document.getElementById('loginForm').hidden = change;
  const pw = document.querySelector('.lock .pw-change');
  pw.reset();
  pw.querySelector('[data-pw="msg"]').textContent = '';
  pw.hidden = !change;
  (change ? pw.querySelector('[data-pw="cur"]') : document.getElementById('loginPw')).focus();
}

document.getElementById('loginForm').addEventListener('submit', e => {
  e.preventDefault();
  const pw = document.getElementById('loginPw').value;
  if (pw) logIn(pw);
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  switch (el.dataset.a) {
    case 'lock-pw': showLockForm(true); break;
    case 'lock-back': showLockForm(false); break;
    case 'sync-signout':
      if (confirm("Log out? You'll need the password to open the tracker again.")) signOut(auth);
      break;
    case 'sync-now':
      if (meta.dirty) push();
      else if (ref) { if (unsubscribe) unsubscribe(); setStatus('syncing'); unsubscribe = onSnapshot(ref, onRemote, fail); }
      break;
    case 'sync-pill':
      state.ui.tab = 'settings'; saveLocal(); render();
      break;
  }
});

// push right away when she switches apps / closes the tab, or comes back online
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push(); });
window.addEventListener('online', () => { if (user) meta.dirty ? push() : setStatus('synced'); });
window.addEventListener('offline', () => { if (user) setStatus('offline'); });
