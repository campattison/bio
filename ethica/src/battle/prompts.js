/**
 * Prompt assembly + judge/suggester orchestration (v2).
 *
 * Ports ALL prompt assembly that used to live in server/src/routes/battle.js
 * and server/src/services/cli-bridge.js:
 *   - player judge, counter judge, agree judge, reconstruct judge
 *   - move suggester
 *   - toolkit + philosopher-ally auto-generation
 *   - philosopher battle-context wrapper (incl. HP<=30% signature-move injection)
 *   - opening-statement context
 *   - free dialogue wrapper
 *   - quiz evaluation (recall + objection/reconstruct/distinguish/apply)
 *
 * These are the v2 analogs of cli-bridge's query* functions: each assembles the
 * prompt AND performs the call (via llm.js). Structured judge calls use JSON
 * schemas (below) and THROW on parse failure — no silent 5/5/5 fallback here;
 * callers decide how to surface the error state in the scene.
 */

import { MODELS, streamMessage, structuredMessage } from '../llm.js';
import * as registry from './prompt-registry.js';
import ARGUMENT_FORMS from './argument-forms.js';

// ─── JSON schemas for structured outputs ───

const DIM_NAMES = [
  'logical_validity',
  'engagement',
  'philosophical_precision',
  'rhetorical_clarity',
  'originality',
  'dialectical_awareness',
];

/**
 * An integer score dimension (1-10 per V2_SPEC).
 *
 * NOTE: no `minimum`/`maximum` on the schema. Anthropic structured outputs
 * (output_config.format json_schema) reject numeric constraints
 * (minimum/maximum/multipleOf) and complex array constraints (minItems/maxItems)
 * with a 400 (invalid_request_error: "for 'integer' type, properties maximum,
 * minimum are not permitted"). The official SDKs strip these client-side; our
 * raw-fetch client must not send them. Ranges are enforced after JSON.parse by
 * `enforceScoreRanges` in llm.js (integer dims → [1,10]), and stated in prose in
 * the judge prompt .md files.
 */
const intDim = () => ({ type: 'integer' });

function sixDimProps() {
  const props = {};
  for (const d of DIM_NAMES) props[d] = intDim();
  return props;
}

/** Player battle judge: six dims + commentary + philosopher_reaction. */
export const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...DIM_NAMES, 'commentary', 'philosopher_reaction'],
  properties: {
    ...sixDimProps(),
    commentary: { type: 'string' },
    philosopher_reaction: { type: 'string' },
  },
};

/** Counter judge (philosopher's response): six dims + commentary. */
export const COUNTER_JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...DIM_NAMES, 'commentary'],
  properties: {
    ...sixDimProps(),
    commentary: { type: 'string' },
  },
};

/** Belief-consistency (agree) judge. */
export const AGREE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claim', 'topic', 'contradiction', 'conflictingBeliefs', 'explanation', 'philosopherResponse'],
  properties: {
    claim: { type: 'string' },
    topic: { type: 'string' },
    contradiction: { type: 'boolean' },
    conflictingBeliefs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['philosopherId', 'claim', 'topic'],
        properties: {
          philosopherId: { type: 'string' },
          claim: { type: 'string' },
          topic: { type: 'string' },
        },
      },
    },
    explanation: { type: 'string' },
    philosopherResponse: { type: 'string' },
  },
};

/** Reconstruction judge: accuracy/charity/critique + commentary + weighted_score. */
export const RECONSTRUCT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['accuracy', 'charity', 'critique', 'commentary', 'weighted_score'],
  properties: {
    accuracy: intDim(),
    charity: intDim(),
    critique: intDim(),
    commentary: { type: 'string' },
    // Range enforced post-parse (enforceScoreRanges → [0,10]); see intDim note.
    weighted_score: { type: 'number' },
  },
};

/**
 * Move suggester: { id, reason } list. The prompt asks for exactly 3; the count
 * is enforced client-side in `suggestMoves` (validated, padded, sliced to 3) —
 * NOT via minItems/maxItems, which Anthropic structured outputs reject (400).
 */
export const SUGGESTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'reason'],
        properties: {
          id: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
};

/** Toolkit / ally auto-generated argument (single prose string). */
export const TOOLKIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['argument'],
  properties: {
    argument: { type: 'string' },
  },
};

/** Quiz schemas, keyed by challenge type. Each: 3 dims + weighted_score + feedback (+commentary). */
function quizSchema(dims, withCommentary = true) {
  const props = {};
  for (const d of dims) props[d] = intDim();
  // Range enforced post-parse (enforceScoreRanges → [0,10]); see intDim note.
  props.weighted_score = { type: 'number' };
  props.feedback = { type: 'string' };
  const required = [...dims, 'weighted_score', 'feedback'];
  if (withCommentary) {
    props.commentary = { type: 'string' };
    required.push('commentary');
  }
  return { type: 'object', additionalProperties: false, required, properties: props };
}

export const QUIZ_SCHEMAS = {
  recall: quizSchema(['accuracy', 'specificity', 'completeness'], false),
  objection: quizSchema(['relevance', 'strength', 'precision']),
  reconstruct: quizSchema(['accuracy', 'completeness', 'specificity']),
  distinguish: quizSchema(['accuracy', 'depth', 'specificity']),
  apply: quizSchema(['fidelity', 'engagement', 'precision']),
};

// ─── Helpers ───

/** Move-type display names used in toolkit/ally prompts (from legacy battle.js). */
const MOVE_NAMES = {
  counterexample: 'counterexample',
  reductio: 'reductio ad absurdum',
  socratic_questioning: 'Socratic question',
  framework_shift: 'framework shift',
};

/** A cached system block for the philosopher prompt (billed at cache-read rates). */
function cachedSystem(text) {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

/**
 * Convert stored history + a new user turn into an Anthropic messages array.
 * Anthropic requires the first message to have role 'user'; the legacy CLI
 * bridge flattened everything to text so a leading assistant (curated opening)
 * was fine. Here we prepend a minimal user primer when needed.
 */
function toApiMessages(history, userContent) {
  const msgs = (history || []).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
  if (userContent != null) msgs.push({ role: 'user', content: userContent });
  if (msgs.length && msgs[0].role !== 'user') {
    msgs.unshift({ role: 'user', content: '(The debate begins.)' });
  }
  return msgs;
}

/** Anti-repetition block: prior judge commentary the judge must not reuse. */
function previousCommentaryBlock(previousCommentary) {
  if (!previousCommentary || previousCommentary.length === 0) return '';
  return (
    `\nYOUR PREVIOUS COMMENTARY (do NOT repeat this language — find new observations):\n` +
    previousCommentary.map((c, i) => `  Round ${i + 1}: "${c}"`).join('\n') +
    '\n'
  );
}

// ─── Philosopher battle context (ported from battle.js) ───

/**
 * Build the battle-context wrapper appended to the philosopher's system prompt.
 * Includes the HP<=30% "USE YOUR SIGNATURE MOVE" injection (reads
 * battle.shouldSignatureMove, latched by the engine on the previous exchange).
 * @param {import('./engine.js').Battle} battle
 * @param {object} opts - { moveType, finalArgument, isPhilosopherAlly, allyDisplayName }
 */
export function buildBattleContext(battle, { moveType, finalArgument, isPhilosopherAlly, allyDisplayName }) {
  const signatureInjection = battle.shouldSignatureMove
    ? '\n[USE YOUR SIGNATURE MOVE — your conviction is being challenged at its core. Deploy your most powerful philosophical argument.]'
    : '';

  if (isPhilosopherAlly) {
    return (
      `You are in a philosophical debate battle. The student has deployed their captured ally, ${allyDisplayName}, to argue against you. ${allyDisplayName} has used a "${moveType}" move.\n` +
      `${allyDisplayName}'s argument: "${finalArgument}"\n\n` +
      `Respond in character. You are now debating a fellow philosopher, not just a student — match their level. Defend your position rigorously.` +
      `${signatureInjection}\n` +
      `Keep your response under 300 words.`
    );
  }

  return (
    `You are in a philosophical debate battle. The student has used the move type "${moveType}".\n` +
    `Their argument: "${finalArgument}"\n\n` +
    `Respond in character. Defend your philosophical position. Be rigorous but educational.` +
    `${signatureInjection}\n` +
    `Keep your response under 300 words.`
  );
}

/** The opening-statement context (philosopher presents position, no damage). */
export const OPENING_CONTEXT =
  'You are beginning a philosophical debate. Present your core philosophical position clearly and compellingly. This is your opening statement — lay out what you believe and why. Keep it focused: state one central claim and your strongest reason for holding it. Keep your response under 200 words.';

/**
 * Stream a philosopher response for a battle move (or opening).
 * @param {object} params
 * @param {string} params.philosopherPrompt - the philosopher's system prompt
 * @param {string} params.battleContext - the wrapper from buildBattleContext / OPENING_CONTEXT
 * @param {Array} params.history - conversation history ({role, content})
 * @param {string} params.userMessage - the player's argument (or opening kickoff)
 * @param {function} [params.onToken]
 * @returns {Promise<string>} full response text
 */
export async function streamPhilosopherResponse({ philosopherPrompt, battleContext, history, userMessage, onToken }) {
  const system = [
    { type: 'text', text: philosopherPrompt, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: battleContext },
  ];
  const messages = toApiMessages(history, userMessage);
  const { text } = await streamMessage({ system, messages, model: MODELS.PHILOSOPHER, maxTokens: 1024, onToken });
  return text;
}

/**
 * Stream a free-dialogue response.
 * @returns {Promise<string>}
 */
export async function streamDialogueResponse({ philosopherPrompt, history, message, onToken }) {
  const system = cachedSystem(philosopherPrompt);
  const messages = toApiMessages(history, message);
  const { text } = await streamMessage({ system, messages, model: MODELS.DIALOGUE, maxTokens: 1024, onToken });
  return text;
}

// ─── Judges (structured) ───

/**
 * Player battle judge — scores the STUDENT's argument.
 * @returns {Promise<object>} JUDGE_SCHEMA-shaped scores
 */
export async function runPlayerJudge({ philosopherStatement, playerArg, moveType, philosopherName, previousCommentary }) {
  const judgePrompt = await registry.getJudgePrompt();
  const userBlock =
    `${previousCommentaryBlock(previousCommentary)}\n` +
    `PHILOSOPHER: ${philosopherName}\n` +
    `PHILOSOPHER'S STATEMENT (what the student is responding to): ${philosopherStatement}\n` +
    `PLAYER'S MOVE TYPE: ${moveType}\n` +
    `PLAYER'S ARGUMENT: ${playerArg}`;

  return structuredMessage({
    system: cachedSystem(judgePrompt),
    messages: [{ role: 'user', content: userBlock }],
    schema: JUDGE_SCHEMA,
    schemaName: 'battle_judge',
    model: MODELS.JUDGE,
    maxTokens: 1024,
  });
}

/**
 * Counter judge — scores the PHILOSOPHER's response.
 * @returns {Promise<object>} COUNTER_JUDGE_SCHEMA-shaped scores
 */
export async function runCounterJudge({ playerArg, philosopherResponse, philosopherName, previousCommentary }) {
  const counterPrompt = await registry.getCounterJudgePrompt();
  const userBlock =
    `${previousCommentaryBlock(previousCommentary)}\n` +
    `PHILOSOPHER: ${philosopherName}\n` +
    `STUDENT'S ARGUMENT (what the philosopher is responding to): ${playerArg}\n` +
    `PHILOSOPHER'S RESPONSE: ${philosopherResponse}`;

  return structuredMessage({
    system: cachedSystem(counterPrompt),
    messages: [{ role: 'user', content: userBlock }],
    schema: COUNTER_JUDGE_SCHEMA,
    schemaName: 'counter_judge',
    model: MODELS.JUDGE,
    maxTokens: 1024,
  });
}

/**
 * Agree / belief-consistency judge.
 * @returns {Promise<object>} AGREE_SCHEMA-shaped result
 */
export async function runAgreeJudge({ philosopherStatement, philosopherName, beliefs }) {
  const agreePrompt = await registry.getAgreeJudgePrompt();
  const beliefList =
    beliefs && beliefs.length > 0
      ? beliefs.map((b, i) => `${i + 1}. [${b.philosopherId}] (${b.topic}): "${b.claim}"`).join('\n')
      : '(No existing beliefs)';

  const userBlock =
    `PHILOSOPHER: ${philosopherName}\n` +
    `PHILOSOPHER'S STATEMENT: ${philosopherStatement}\n\n` +
    `STUDENT'S EXISTING BELIEFS:\n${beliefList}\n\n` +
    `Evaluate whether agreeing with this philosopher's claim contradicts any existing beliefs. Return a JSON object.`;

  return structuredMessage({
    system: cachedSystem(agreePrompt),
    messages: [{ role: 'user', content: userBlock }],
    schema: AGREE_SCHEMA,
    schemaName: 'agree_judge',
    model: MODELS.JUDGE,
    maxTokens: 1024,
  });
}

/**
 * Reconstruction judge.
 * @returns {Promise<object>} RECONSTRUCT_SCHEMA-shaped result
 */
export async function runReconstructJudge({ philosopherStatement, playerReconstruction, philosopherName }) {
  const reconstructPrompt = await registry.getReconstructJudgePrompt();
  const userBlock =
    `PHILOSOPHER: ${philosopherName}\n` +
    `PHILOSOPHER'S STATEMENT: ${philosopherStatement}\n\n` +
    `PLAYER'S RECONSTRUCTION AND CRITIQUE: ${playerReconstruction}\n\n` +
    `Evaluate the player's reconstruction and return a JSON object.`;

  return structuredMessage({
    system: cachedSystem(reconstructPrompt),
    messages: [{ role: 'user', content: userBlock }],
    schema: RECONSTRUCT_SCHEMA,
    schemaName: 'reconstruct_judge',
    model: MODELS.JUDGE,
    maxTokens: 1024,
  });
}

// ─── Move suggester ───

/**
 * Suggest 3 argument forms for the next round, enriched from the catalog.
 * @returns {Promise<Array<{id, name, desc, templates, reason}>>}
 */
export async function suggestMoves({ philosopherStatement }) {
  const template = await registry.getMoveSuggesterPrompt();
  const catalogStr = ARGUMENT_FORMS.map((f) => `- **${f.id}** (${f.name}): ${f.desc}`).join('\n');
  const prompt = template.replace('{{CATALOG}}', catalogStr).replace('{{PHILOSOPHER_STATEMENT}}', philosopherStatement);

  const result = await structuredMessage({
    system: [{ type: 'text', text: prompt }],
    messages: [{ role: 'user', content: 'Suggest the 3 best moves as specified.' }],
    schema: SUGGESTER_SCHEMA,
    schemaName: 'move_suggester',
    model: MODELS.SUGGESTER,
    maxTokens: 1024,
  });

  const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
  const catalogMap = new Map(ARGUMENT_FORMS.map((f) => [f.id, f]));

  const validated = [];
  for (const s of suggestions) {
    const form = catalogMap.get(s.id);
    if (form) {
      validated.push({
        id: form.id,
        name: form.name,
        desc: form.desc,
        templates: form.templates,
        reason: s.reason || '',
      });
    }
  }

  // Ensure exactly 3 — pad with random catalog entries (parity with legacy).
  while (validated.length < 3) {
    const unused = ARGUMENT_FORMS.filter((f) => !validated.some((v) => v.id === f.id));
    if (unused.length === 0) break;
    const pick = unused[Math.floor(Math.random() * unused.length)];
    validated.push({ ...pick, reason: '' });
  }

  return validated.slice(0, 3);
}

// ─── Toolkit / ally auto-generation ───

/**
 * Auto-generate a toolkit argument (the player's toolkit produces the argument).
 * @returns {Promise<string>}
 */
export async function generateToolkitArgument({ moveType, lastPhilosopherStatement }) {
  const prompt =
    `You are a philosophy student's toolkit. Generate a strong, concise ${MOVE_NAMES[moveType] || moveType} argument against this philosopher's position. ` +
    `The philosopher just said: "${lastPhilosopherStatement || 'their opening position'}". ` +
    `Write ONLY the argument itself in 2-3 sentences. Be philosophically rigorous.`;

  const result = await structuredMessage({
    system: [{ type: 'text', text: prompt }],
    messages: [{ role: 'user', content: 'Produce the argument.' }],
    schema: TOOLKIT_SCHEMA,
    schemaName: 'toolkit_argument',
    model: MODELS.TOOLKIT,
    maxTokens: 1024,
  });
  return result.argument;
}

/**
 * Generate an argument in a captured ally philosopher's voice.
 * @returns {Promise<string>}
 */
export async function generateAllyArgument({ allyPhilosopherId, opponentName, moveType, lastPhilosopherStatement }) {
  const allyPrompt = await registry.getPhilosopherPrompt(allyPhilosopherId);
  if (!allyPrompt) {
    throw new Error(`No prompt found for ally philosopher: ${allyPhilosopherId}`);
  }

  const instruction =
    `${allyPrompt}\n\n---\n\n` +
    `BATTLE CONTEXT: You have been captured by a philosophy student and now fight as their ally. You are deployed to argue against ${opponentName} on the student's behalf.\n\n` +
    `${
      lastPhilosopherStatement
        ? `Your opponent (${opponentName}) just said:\n"${lastPhilosopherStatement}"`
        : `You are responding to ${opponentName}'s opening position.`
    }\n\n` +
    `The student wants you to use a **${MOVE_NAMES[moveType] || moveType}** argument. Argue in your own philosophical voice, drawing from your actual positions and works. Write ONLY the argument itself (2-4 sentences). Be rigorous and stay in character.`;

  const result = await structuredMessage({
    system: [{ type: 'text', text: instruction }],
    messages: [{ role: 'user', content: 'Produce the argument.' }],
    schema: TOOLKIT_SCHEMA,
    schemaName: 'ally_argument',
    model: MODELS.TOOLKIT,
    maxTokens: 1024,
  });
  return result.argument;
}

// ─── Quiz evaluation ───

/**
 * Evaluate a recall-mode quiz answer.
 * @returns {Promise<object>} { accuracy, specificity, completeness, weighted_score, feedback }
 */
export async function runQuizRecall({ philosopherName, tradition, coreAssumptions, studentAnswer }) {
  let prompt = await registry.getQuizRecallJudgePrompt();
  prompt = prompt
    .replaceAll('{{PHILOSOPHER_NAME}}', philosopherName || '')
    .replaceAll('{{TRADITION}}', tradition || 'unknown')
    .replaceAll('{{CORE_ASSUMPTIONS}}', coreAssumptions || 'Not provided')
    .replaceAll('{{STUDENT_ANSWER}}', studentAnswer || '');

  const result = await structuredMessage({
    system: [{ type: 'text', text: prompt }],
    messages: [{ role: 'user', content: 'Evaluate the answer and return JSON.' }],
    schema: QUIZ_SCHEMAS.recall,
    schemaName: 'quiz_recall',
    model: MODELS.JUDGE,
    maxTokens: 1024,
  });

  if (result.weighted_score == null) {
    result.weighted_score =
      (result.accuracy || 0) * 0.5 + (result.specificity || 0) * 0.3 + (result.completeness || 0) * 0.2;
  }
  return result;
}

/**
 * Evaluate a free-text quiz challenge (objection / reconstruct / distinguish / apply).
 * @param {string} challengeType
 * @param {object} fields - the payload fields from the caller
 * @returns {Promise<object>} raw judge result (dimensions + weighted_score + feedback [+commentary])
 */
export async function runQuizEvaluation(challengeType, fields) {
  const template = await registry.getQuizJudgePrompt(challengeType);
  const schema = QUIZ_SCHEMAS[challengeType];
  if (!template || !schema) {
    throw new Error(`Unknown challenge_type: ${challengeType}`);
  }

  const substitutions = {
    '{{PHILOSOPHER_NAME}}': fields.philosopherName || '',
    '{{TRADITION}}': fields.tradition || '',
    '{{CLAIM}}': fields.claim || '',
    '{{CORE_ASSUMPTIONS}}': fields.coreAssumptions || '',
    '{{KEY_WORKS}}': fields.keyWorks || '',
    '{{STUDENT_ANSWER}}': fields.studentAnswer || '',
    '{{PHILOSOPHER_A_NAME}}': fields.philosopherAName || '',
    '{{PHILOSOPHER_B_NAME}}': fields.philosopherBName || '',
    '{{PHILOSOPHER_A_POSITION}}': fields.philosopherAPosition || '',
    '{{PHILOSOPHER_B_POSITION}}': fields.philosopherBPosition || '',
    '{{TRADITION_A}}': fields.traditionA || '',
    '{{TRADITION_B}}': fields.traditionB || '',
    '{{QUOTE}}': fields.quote || '',
  };

  let filledPrompt = template;
  for (const [key, value] of Object.entries(substitutions)) {
    filledPrompt = filledPrompt.replaceAll(key, value);
  }

  const result = await structuredMessage({
    system: [{ type: 'text', text: filledPrompt }],
    messages: [{ role: 'user', content: 'Evaluate the response and return JSON.' }],
    schema,
    schemaName: `quiz_${challengeType}`,
    model: MODELS.JUDGE,
    maxTokens: 1024,
  });

  return result;
}
