/**
 * Pack Validation (client-side, v2 Phase 2).
 *
 * Runs soft integrity checks when a pack's data is loaded. Every failure is a
 * console warning, never a crash: a content mismatch should be visible to the
 * author without bricking the game for a player.
 *
 * Checks:
 *   1. philosophers ↔ prompt .md 1:1 — every non-`quiz_*` philosopher id has a
 *      matching `prompts/philosophers/<id>.md`. The eight `quiz_*` personas are
 *      exempt: they are procedural quiz-goon roles (dogmatist, examiner,
 *      heckler, inquisitor, pedant, provocateur, skeptic, sophist) that share
 *      generic quiz-judge scaffolding and intentionally ship no bespoke
 *      philosopher prompt (see IMPROVEMENTS.md, Phase 0 audit: 54 JSON entries,
 *      46 .md files, the 8 `quiz_*` ids being the only ones without a .md).
 *   2. traditions — every tradition referenced by a philosopher exists in the
 *      manifest's typeChart.
 *   3. zones — every zone referenced by a philosopher exists in the manifest.
 *
 * Note on prompt existence: the dev/proxy static server has an SPA fallback
 * that returns index.html (HTTP 200) for unmatched GETs, so a missing .md does
 * NOT surface as a 404. We therefore treat an HTML-looking response as "missing"
 * rather than trusting the status code alone.
 */

const QUIZ_PERSONA_PREFIX = 'quiz_';

/**
 * @param {object} params
 * @param {object} params.pack - the parsed manifest
 * @param {object[]} params.philosophers - philosophers array (from the pack data)
 * @param {string} params.promptsDir - resolved prompts base dir
 * @param {boolean} [params.checkPrompts=true] - run the (networked) 1:1 prompt check
 * @returns {Promise<{ok: boolean, warnings: string[], missingPrompts: string[]}>}
 */
export async function validatePack({ pack, philosophers, promptsDir, checkPrompts = true }) {
  const warnings = [];
  const missingPrompts = [];

  if (!pack) {
    warnings.push('No active pack manifest — skipping validation.');
    console.warn('[pack-validate]', warnings[warnings.length - 1]);
    return { ok: false, warnings, missingPrompts };
  }

  const typeChart = pack.typeChart || {};
  const typeChartKeys = new Set(Object.keys(typeChart));
  const zoneIds = new Set((pack.zones || []).map((z) => z.id));
  const list = Array.isArray(philosophers) ? philosophers : [];

  // ── 2. traditions referenced by philosophers exist in typeChart ──
  for (const p of list) {
    const trad = p.tradition;
    if (trad && !typeChartKeys.has(trad)) {
      warnings.push(`Philosopher "${p.id}" references tradition "${trad}" absent from typeChart.`);
    }
  }
  // Also flag declared traditions that are not in the typeChart (and vice versa).
  for (const trad of pack.traditions || []) {
    if (!typeChartKeys.has(trad)) {
      warnings.push(`Declared tradition "${trad}" has no typeChart entry.`);
    }
  }

  // ── 3. zones referenced by philosophers exist in the manifest ──
  for (const p of list) {
    if (p.zone && !zoneIds.has(p.zone)) {
      warnings.push(`Philosopher "${p.id}" references zone "${p.zone}" absent from manifest zones.`);
    }
  }

  // ── 1. philosophers ↔ prompt .md 1:1 (excludes quiz_* personas) ──
  if (checkPrompts) {
    const expected = list.filter((p) => p.id && !p.id.startsWith(QUIZ_PERSONA_PREFIX));
    const results = await Promise.all(
      expected.map(async (p) => {
        const present = await promptExists(`${promptsDir}/philosophers/${p.id}.md`);
        return { id: p.id, present };
      }),
    );
    for (const r of results) {
      if (!r.present) {
        missingPrompts.push(r.id);
        warnings.push(`Philosopher "${r.id}" has no prompt at ${promptsDir}/philosophers/${r.id}.md`);
      }
    }
    // Report the exempted personas for transparency (info, not a warning).
    const quizPersonas = list.filter((p) => p.id && p.id.startsWith(QUIZ_PERSONA_PREFIX)).map((p) => p.id);
    if (quizPersonas.length) {
      console.info(
        `[pack-validate] ${quizPersonas.length} quiz personas exempt from the prompt 1:1 check: ${quizPersonas.join(', ')}`,
      );
    }
  }

  const ok = warnings.length === 0;
  if (ok) {
    console.info(
      `[pack-validate] pack "${pack.id}" OK — ${list.length} philosophers, ${zoneIds.size} zones, ${typeChartKeys.size} traditions.`,
    );
  } else {
    console.warn(`[pack-validate] pack "${pack.id}" has ${warnings.length} issue(s):`);
    for (const w of warnings) console.warn('  •', w);
  }

  return { ok, warnings, missingPrompts };
}

/**
 * True if a prompt file genuinely exists. Guards against the SPA fallback that
 * serves index.html (HTTP 200) for unmatched paths by rejecting HTML-looking
 * bodies.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function promptExists(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) return false;
    const text = (await res.text()).trimStart();
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) return false;
    return text.length > 0;
  } catch {
    return false;
  }
}
