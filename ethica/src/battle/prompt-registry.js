/**
 * Prompt Registry (client-side, v2).
 *
 * Replaces server/src/prompts/registry.js. Phase 2: the .md prompt files live
 * inside the active pack (fe-ethics: client/packs/fe-ethics/prompts/, with
 * philosopher prompts under philosophers/). The base directory is resolved from
 * the pack manifest via pack-loader; files are fetched on demand and cached in
 * memory for the lifetime of the page.
 */

import { getPromptsDir } from '../pack-loader.js';

/** @type {Map<string, Promise<string>>} */
const cache = new Map();

/**
 * Fetch a prompt file (relative to the active pack's prompts dir) with
 * in-memory caching. The same in-flight promise is shared across concurrent
 * callers. Cache key includes the resolved base so a mid-session pack switch
 * cannot serve a stale file.
 * @param {string} relPath e.g. 'battle-judge.md' or 'philosophers/mill.md'
 * @returns {Promise<string>}
 */
function fetchPrompt(relPath) {
  const base = getPromptsDir();
  const key = `${base}/${relPath}`;
  if (cache.has(key)) {
    return cache.get(key);
  }
  const p = fetch(key).then((res) => {
    if (!res.ok) {
      throw new Error(`Prompt not found: ${relPath} (HTTP ${res.status})`);
    }
    return res.text();
  });
  // Cache the promise; on failure, evict so a later call can retry.
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  return p;
}

/**
 * Get a philosopher's system prompt by id. Returns null if not found
 * (parity with the legacy registry.getPrompt which returned null).
 * @param {string} philosopherId
 * @returns {Promise<string|null>}
 */
export async function getPhilosopherPrompt(philosopherId) {
  try {
    return await fetchPrompt(`philosophers/${philosopherId}.md`);
  } catch {
    return null;
  }
}

export const getJudgePrompt = () => fetchPrompt('battle-judge.md');
export const getCounterJudgePrompt = () => fetchPrompt('battle-judge-counter.md');
export const getAgreeJudgePrompt = () => fetchPrompt('agree-judge.md');
export const getReconstructJudgePrompt = () => fetchPrompt('reconstruct-judge.md');
export const getMoveSuggesterPrompt = () => fetchPrompt('move-suggester.md');
export const getQuizRecallJudgePrompt = () => fetchPrompt('quiz-recall-judge.md');

/**
 * Get a quiz challenge judge prompt by challenge type.
 * @param {string} challengeType - objection | reconstruct | distinguish | apply | recall
 * @returns {Promise<string|null>}
 */
export async function getQuizJudgePrompt(challengeType) {
  const map = {
    objection: 'quiz-objection-judge.md',
    reconstruct: 'quiz-reconstruct-judge.md',
    distinguish: 'quiz-distinguish-judge.md',
    apply: 'quiz-apply-judge.md',
    recall: 'quiz-recall-judge.md',
  };
  const file = map[challengeType];
  if (!file) return null;
  try {
    return await fetchPrompt(file);
  } catch {
    return null;
  }
}
