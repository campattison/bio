/**
 * Pack Loader (client-side, v2 Phase 2).
 *
 * Ethica content ships as a self-describing "pack": a manifest (`pack.json`)
 * plus the data + prompt files it references. The engine consumes pack data
 * instead of hardcoded content, so a new game is a new pack — not a fork.
 *
 * The active pack id comes from `localStorage.ETHICA_PACK` (default
 * `fe-ethics`). `loadPack()` is awaited once, early in the boot sequence
 * (see `main.js`), so the manifest is available synchronously by the time the
 * preload scene queues its zone/data loads and the battle engine reads its
 * config.
 *
 * Runtime data (philosophers/quiz/etc.) is large; the preload scene loads it
 * through Phaser's loader from the manifest-resolved paths and then registers
 * the parsed result here via `setPackData()`, giving a single source of truth
 * that does not require a Phaser scene handle to query.
 */

export const DEFAULT_PACK_ID = 'fe-ethics';

/** @type {object|null} the parsed active manifest */
let activePack = null;

/** @type {Record<string, any>} parsed data files, keyed by kind */
const dataStore = Object.create(null);

/**
 * Resolve the active pack id. Falls back to the default when localStorage is
 * unavailable (e.g. private mode) or unset.
 * @returns {string}
 */
export function getActivePackId() {
  try {
    // URL override (?pack=<id>) wins and persists, so a shared link selects
    // the pack for students without any console work.
    const fromUrl = (new URLSearchParams(window.location.search).get('pack') || '').trim();
    if (fromUrl) {
      localStorage.setItem('ETHICA_PACK', fromUrl);
      return fromUrl;
    }
    const id = (localStorage.getItem('ETHICA_PACK') || '').trim();
    return id || DEFAULT_PACK_ID;
  } catch {
    return DEFAULT_PACK_ID;
  }
}

/**
 * Fetch + parse a pack manifest and make it the active pack.
 * @param {string} [id] pack id; defaults to the active id from localStorage
 * @returns {Promise<object>} the parsed manifest
 */
export async function loadPack(id = getActivePackId()) {
  const url = `packs/${id}/pack.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Pack manifest not found: ${url} (HTTP ${res.status})`);
  }
  const manifest = await res.json();
  if (!manifest || !manifest.id) {
    throw new Error(`Pack manifest at ${url} is missing a top-level "id"`);
  }
  activePack = manifest;
  return manifest;
}

/** @returns {object|null} the active manifest (null until loadPack resolves) */
export function getActivePack() {
  return activePack;
}

// ─── Battle-engine config injection ──────────────────────────────────────

/**
 * The battle config the engine injects: type chart, score weights, move
 * bonuses. Returns null before the pack loads so the engine can fall back to
 * its baked-in defaults (identical values) — no behavioral change.
 * @returns {{typeChart: object, scoreWeights: object, moveBonuses: object}|null}
 */
export function getBattleConfig() {
  if (!activePack) return null;
  return {
    typeChart: activePack.typeChart,
    scoreWeights: activePack.scoreWeights,
    moveBonuses: activePack.moveBonuses,
  };
}

export function getTypeChart() {
  return activePack ? activePack.typeChart : null;
}

export function getScoreWeights() {
  return activePack ? activePack.scoreWeights : null;
}

export function getMoveBonuses() {
  return activePack ? activePack.moveBonuses : null;
}

/** @returns {string[]} tradition ids declared by the pack */
export function getTraditions() {
  return activePack?.traditions || [];
}

/** @returns {object} progression counts (gymLeaderCount, keyItemCount, ...) */
export function getProgression() {
  return activePack?.progression || {};
}

/**
 * Per-step wild-encounter probability on encounter tiles, overridable per
 * pack via pack.json `encounterRate`. Default matches the historical 0.2.
 * @returns {number}
 */
export function getEncounterRate() {
  const rate = activePack?.encounterRate;
  return typeof rate === 'number' && rate >= 0 && rate <= 1 ? rate : 0.2;
}

/**
 * Word-limit targets for LLM responses, overridable per pack via
 * pack.json `responseLimits`. Defaults match the historical fe-ethics limits.
 * @returns {{battle: number, dialogue: number, opening: number}}
 */
export function getResponseLimits() {
  return {
    battle: 300,
    dialogue: 250,
    opening: 200,
    ...(activePack?.responseLimits || {}),
  };
}

// ─── File-path accessors ─────────────────────────────────────────────────

export function getFilePath(kind) {
  return activePack?.files?.[kind] || null;
}

export const getPhilosophersPath = () => getFilePath('philosophers');
export const getNpcsPath = () => getFilePath('npcs');
export const getQuizPath = () => getFilePath('quiz');
export const getEncountersPath = () => getFilePath('encounters');

/**
 * Base directory for prompt .md files. Falls back to the legacy location so
 * prompt fetches degrade gracefully if the pack has not loaded yet.
 * @returns {string}
 */
export function getPromptsDir() {
  return activePack?.files?.promptsDir || 'assets/prompts';
}

// ─── Zones ───────────────────────────────────────────────────────────────

/** @returns {Array<object>} all zone descriptors (world, building, logical) */
export function getZones() {
  return activePack?.zones || [];
}

/** @returns {string[]} ids of every zone the manifest declares */
export function getZoneIds() {
  return getZones().map((z) => z.id);
}

/** @returns {Array<object>} only zones that carry loadable asset files */
export function getLoadableZones() {
  return getZones().filter((z) => z && z.files && z.assetKeys);
}

// ─── Parsed data registration + typed accessors ──────────────────────────

/**
 * Register parsed data loaded elsewhere (the preload scene loads the large
 * JSON through Phaser and hands the parsed result here). Makes the data
 * queryable without a Phaser scene reference.
 * @param {string} kind e.g. 'philosophers' | 'quiz' | 'npcs' | 'encounters'
 * @param {any} data
 */
export function setPackData(kind, data) {
  dataStore[kind] = data;
}

export function getPackData(kind) {
  return dataStore[kind] ?? null;
}

/** @returns {object[]} the philosophers array from the pack, or [] */
export function getPhilosophers() {
  return dataStore.philosophers?.philosophers || [];
}

/** @param {string} id @returns {object|undefined} */
export function getPhilosopherById(id) {
  return getPhilosophers().find((p) => p.id === id);
}

/** @returns {object|null} full quiz content ({traditions, philosophers, quotes}) */
export function getQuizContent() {
  return dataStore.quiz || null;
}

/**
 * Reset loader state. Test/dev helper — not used in the normal boot path.
 */
export function _resetPackLoader() {
  activePack = null;
  for (const k of Object.keys(dataStore)) delete dataStore[k];
}
