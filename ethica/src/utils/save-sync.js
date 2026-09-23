/**
 * Save sync (v2).
 *
 * localStorage (`ETHICA_DATA`) stays the source of truth during a session.
 * On top of that we sync to the proxy's per-code save document via
 * GET/PUT /api/save (X-Access-Code). Reconciliation is by `savedAt`:
 *   - on boot, pull remote; if remote.savedAt > local.savedAt, adopt remote.
 *   - on every local save, push to the proxy (fire-and-forget-ish).
 * The proxy is treated as best-effort: if it is unreachable we keep going with
 * localStorage only and retry on the next save.
 */

import { getAccessCode } from './access-code.js';

const LOCAL_STORAGE_KEY = 'ETHICA_DATA';

function apiBase() {
  return (typeof window !== 'undefined' && window.ETHICA_API_BASE) || '';
}

function authHeaders(extra = {}) {
  const headers = { ...extra };
  const code = getAccessCode();
  if (code) headers['X-Access-Code'] = code;
  // When the API base is an ngrok tunnel, skip ngrok's browser-warning
  // interstitial so fetch receives real JSON. No-op for same-origin local play.
  if (/\bngrok\b|ngrok-free\.app|ngrok\.app|ngrok\.io/i.test(apiBase())) {
    headers['ngrok-skip-browser-warning'] = '1';
  }
  return headers;
}

/** @returns {object|null} the local save document, or null */
export function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Write the document to localStorage, stamping savedAt (ms epoch) if absent.
 * @param {object} doc
 * @returns {object} the stamped doc
 */
export function writeLocal(doc) {
  const stamped = { ...doc, savedAt: doc.savedAt || Date.now() };
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stamped));
  } catch {
    /* localStorage unavailable */
  }
  return stamped;
}

/** Extract a comparable timestamp (ms) from a save doc. */
function savedAtMs(doc) {
  if (!doc) return 0;
  const v = doc.savedAt;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/**
 * Push the current document to the proxy. Stamps savedAt, writes localStorage
 * first (source of truth), then PUTs. Returns { savedAt } on success or null if
 * the proxy is unreachable / rejects (offline-graceful).
 * @param {object} doc
 * @returns {Promise<{savedAt: number}|null>}
 */
export async function syncSave(doc) {
  const stamped = writeLocal({ ...doc, savedAt: Date.now() });

  try {
    const res = await fetch(`${apiBase()}/api/save`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(stamped),
    });
    if (!res.ok) {
      // 400 suspicious_save, 401, etc. — keep localStorage, do not throw.
      console.warn(`[save-sync] proxy save rejected (${res.status})`);
      return null;
    }
    const json = await res.json().catch(() => ({}));
    return { savedAt: json.savedAt ?? stamped.savedAt };
  } catch (err) {
    console.warn('[save-sync] proxy unreachable, kept local save:', err.message);
    return null;
  }
}

/**
 * Pull the remote save document. Returns the doc, or null if unavailable.
 * Tolerates both the v2 shape (bare document) and a legacy { ok, data } wrapper.
 * @returns {Promise<object|null>}
 */
export async function pullRemote() {
  try {
    const res = await fetch(`${apiBase()}/api/save`, { headers: authHeaders() });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json) return null;
    if (json.ok && json.data) return json.data; // legacy wrapper
    if (json.player && json.options) return json; // v2 bare document
    return null;
  } catch (err) {
    console.warn('[save-sync] proxy load failed:', err.message);
    return null;
  }
}

/**
 * Boot reconciliation. Pull remote; if it is newer than local by savedAt, adopt
 * it into localStorage and return it. Otherwise return the local doc (or null).
 * The live in-session store is NOT mutated here — callers load from localStorage,
 * so adopting into localStorage is enough for the source-of-truth model.
 * @returns {Promise<{doc: object|null, adoptedRemote: boolean}>}
 */
export async function reconcileOnBoot() {
  const local = readLocal();
  const remote = await pullRemote();

  if (remote && savedAtMs(remote) > savedAtMs(local)) {
    writeLocal(remote);
    return { doc: remote, adoptedRemote: true };
  }
  return { doc: local, adoptedRemote: false };
}
