/* Cloud sync — keeps the tracker the same on phone and laptop.
   She signs in with Google; her data lives in Firestore at trackers/{her uid}, which the
   Firestore rules let only her read or write. This browser's localStorage stays the working
   copy, so the tracker still works offline and syncs when it's back online. */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut,
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
let heldSnap = null;      // a cloud update that arrived mid-push; handled once the push settles

/* ---------- status UI ---------- */
const pill = document.getElementById('syncStatus');

function setStatus(s, err = '') {
  status = s; errorText = err;
  const text = {
    loading: '☁ …',
    'signed-out': '☁ Sign in to sync',
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
  window.renderSyncPanel();
}

window.renderSyncPanel = () => {
  const el = document.getElementById('syncPanel');
  if (!el) return;
  if (!user) {
    el.innerHTML = `
      <p class="muted" style="margin:0 0 10px">Sign in with Google so your progress is the same on your phone and laptop.</p>
      <div class="actions"><button class="btn dark" data-a="sync-signin">SIGN IN WITH GOOGLE</button></div>
      ${errorText ? `<p class="sync-err">${esc(errorText)}</p>` : ''}`;
    return;
  }
  const when = lastSynced ? ` · last synced ${lastSynced.toLocaleTimeString()}` : '';
  el.innerHTML = `
    <p style="margin:0 0 10px">Signed in as <b>${esc(user.email || user.displayName || 'you')}</b><span class="muted">${when}</span></p>
    <div class="actions">
      <button class="btn" data-a="sync-now">SYNC NOW</button>
      <button class="btn" data-a="sync-signout">SIGN OUT</button>
    </div>
    ${status === 'error' ? `<p class="sync-err">${esc(errorText)}</p>` : ''}`;
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
    'Your account has progress from another device, and this device also has changes that weren\'t synced yet.\n\n' +
    'OK = use the progress saved in your account (recommended)\n' +
    'Cancel = keep this device\'s version and overwrite your account'
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

async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
    } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      setStatus('signed-out', `Sign-in failed: ${e.message}`);
    }
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  switch (el.dataset.a) {
    case 'sync-signin': signIn(); break;
    case 'sync-signout':
      if (confirm('Sign out? Your progress stays on this device and in your account.')) signOut(auth);
      break;
    case 'sync-now':
      if (meta.dirty) push();
      else if (ref) { if (unsubscribe) unsubscribe(); setStatus('syncing'); unsubscribe = onSnapshot(ref, onRemote, fail); }
      break;
    case 'sync-pill':
      if (!user) signIn();
      else { state.ui.tab = 'settings'; saveLocal(); render(); }
      break;
  }
});

// push right away when she switches apps / closes the tab, or comes back online
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push(); });
window.addEventListener('online', () => { if (user) meta.dirty ? push() : setStatus('synced'); });
window.addEventListener('offline', () => { if (user) setStatus('offline'); });
