/**
 * API Client (v2).
 *
 * Same public surface as the legacy client (streamDialogue, startBattle,
 * streamBattleMove, getBattleState, getStatus, clearSession, evaluateChallenge,
 * evaluateRecall) so debate-scene.js / quiz-battle-scene.js need minimal edits.
 *
 * What changed under the hood: instead of hitting the Express server's
 * /api/battle/* and /api/dialogue endpoints, all game logic now runs
 * client-side. Battle state lives in a local `Battle` instance (registry keyed
 * by battleId — now a locally-minted id). Every model invocation goes through
 * the proxy's single /api/llm endpoint via llm.js. The SSE-style callback
 * contract that the scenes rely on is preserved exactly.
 */

import { Battle } from '../battle/engine.js';
import { getPhilosopherPrompt } from '../battle/prompt-registry.js';
import {
  runPlayerJudge,
  runCounterJudge,
  runAgreeJudge,
  runReconstructJudge,
  suggestMoves,
  generateToolkitArgument,
  generateAllyArgument,
  buildBattleContext,
  streamPhilosopherResponse,
  streamDialogueResponse,
  OPENING_CONTEXT,
  runQuizEvaluation,
  runQuizRecall,
} from '../battle/prompts.js';

/** @type {Map<string, Battle>} local battle registry (replaces server state) */
const battles = new Map();

/** @type {Map<string, Array<{role: string, content: string}>>} free-dialogue history per philosopher */
const dialogueHistories = new Map();

const ALLY_RE = /^\[PHILOSOPHER_ALLY:([a-z0-9_-]+)\]$/i;

function mintBattleId() {
  return `battle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Start a dialogue stream with a philosopher (free chat).
 * @param {string} philosopherId
 * @param {string} message
 * @param {object} callbacks - { onText, onDone, onError }
 * @param {string} [playerId='default']
 */
export function streamDialogue(philosopherId, message, callbacks, playerId = 'default') {
  const { onText, onDone, onError } = callbacks;

  (async () => {
    const systemPrompt = await getPhilosopherPrompt(philosopherId);
    if (!systemPrompt) {
      onError(`No prompt found for philosopher: ${philosopherId}`);
      return;
    }

    const history = dialogueHistories.get(philosopherId) || [];
    const historyCopy = [...history];
    // Persist the player's message to history (parity with server session-manager).
    history.push({ role: 'user', content: message });
    dialogueHistories.set(philosopherId, history);

    try {
      const fullText = await streamDialogueResponse({
        philosopherPrompt: systemPrompt,
        history: historyCopy,
        message,
        onToken: (chunk) => onText(chunk),
      });
      history.push({ role: 'assistant', content: fullText });
      if (history.length > 20) history.splice(0, history.length - 20);
      onDone(fullText);
    } catch (err) {
      onError(err.message);
    }
  })();
}

/**
 * Start a battle. Mints a local battleId and creates a Battle instance.
 * @param {string} philosopherId
 * @param {object} philosopherData
 * @param {string} [playerId='default']
 * @returns {Promise<{battleId: string, battle: object}>}
 */
export async function startBattle(philosopherId, philosopherData, playerId = 'default') {
  const data = philosopherData || { id: philosopherId, name: philosopherId, tradition: 'deontology', level: 1 };
  const battleId = mintBattleId();
  const battle = new Battle(battleId, data);
  battles.set(battleId, battle);
  return { battleId, battle: battle.snapshot() };
}

/**
 * Submit a battle move and drive the same callbacks the debate scene expects.
 * @param {object} params - { battleId, philosopherId, moveType, argument, frameworkTradition, beliefs, openingStatement, playerId }
 * @param {object} callbacks
 */
export function streamBattleMove(params, callbacks) {
  const { battleId, philosopherId, moveType, argument, frameworkTradition, beliefs, openingStatement } = params;
  const {
    onText = () => {},
    onJudging = () => {},
    onPlayerJudgeResult = () => {},
    onCounterJudgeResult = () => {},
    onResult = () => {},
    onAgreeResult = () => {},
    onReconstructResult = () => {},
    onPhilosopherStatement = () => {},
    onToolkitArgument = () => {},
    onMoveSuggestions = () => {},
    onBattleEnd = () => {},
    onDone = () => {},
    onError = () => {},
  } = callbacks;

  (async () => {
    const battle = battles.get(battleId);
    if (!battle) {
      onError('Battle not found');
      return;
    }

    const isToolkit = argument === '[TOOLKIT]';
    const allyMatch = argument ? argument.match(ALLY_RE) : null;
    const isPhilosopherAlly = !!allyMatch;
    const allyPhilosopherId = allyMatch ? allyMatch[1] : null;

    const philName = battle.philosopher.name || philosopherId;

    // Validate philosopher prompt for moves that need one.
    const needsPhilPrompt = moveType !== 'agree' && moveType !== 'reconstruct';
    let systemPrompt = null;
    if (needsPhilPrompt) {
      systemPrompt = await getPhilosopherPrompt(philosopherId);
      if (!systemPrompt) {
        onError(`No prompt found for philosopher: ${philosopherId}`);
        return;
      }
    }

    try {
      // ─── RECONSTRUCT ───
      if (moveType === 'reconstruct') {
        if (openingStatement && battle.getHistory().length === 0) {
          battle.addMessage('assistant', openingStatement);
        }
        const lastStatement = battle.lastPhilosopherStatement();
        if (!lastStatement) {
          onError('No philosopher statement to reconstruct');
          return;
        }
        onPhilosopherStatement(lastStatement);
        onJudging();

        const judgeScores = await runReconstructJudge({
          philosopherStatement: lastStatement,
          playerReconstruction: argument,
          philosopherName: philName,
        });
        onReconstructResult({ judgeScores });

        const result = battle.processReconstructExchange(judgeScores, argument, '');
        onResult({ judgeScores, damage: result.damage, battle: result.battle, oneShot: result.oneShot });

        if (result.battle.status !== 'active') {
          const reward = battle.calculateReward();
          onBattleEnd(reward);
          battles.delete(battleId);
        }
        onDone();
        return;
      }

      // ─── AGREE ───
      if (moveType === 'agree') {
        const lastStatement = battle.lastPhilosopherStatement();
        if (!lastStatement) {
          onError('No philosopher statement to agree with');
          return;
        }
        const agreeResult = await runAgreeJudge({
          philosopherStatement: lastStatement,
          philosopherName: philName,
          beliefs: beliefs || [],
        });
        onAgreeResult({ agreeResult });

        const result = battle.processAgreeExchange(agreeResult);
        onResult({ damage: result.damage, battle: result.battle });

        if (result.battle.status !== 'active') {
          const reward = battle.calculateReward();
          onBattleEnd(reward);
          battles.delete(battleId);
        }
        onDone();
        return;
      }

      // ─── OPENING ───
      if (moveType === 'opening') {
        const philosopherResponse = await streamPhilosopherResponse({
          philosopherPrompt: systemPrompt,
          battleContext: OPENING_CONTEXT,
          history: battle.getHistory(),
          userMessage: argument,
          onToken: (chunk) => onText(chunk),
        });
        battle.addMessage('assistant', philosopherResponse);
        onResult({ battle: battle.snapshot() });
        onDone();
        return;
      }

      // ─── STANDARD MOVES ───
      if (openingStatement && battle.getHistory().length === 0) {
        battle.addMessage('assistant', openingStatement);
      }

      let finalArgument = argument;
      if (isToolkit) {
        finalArgument = await generateToolkitArgument({
          moveType,
          lastPhilosopherStatement: battle.lastPhilosopherStatement(),
        });
        onToolkitArgument(finalArgument);
      } else if (isPhilosopherAlly) {
        finalArgument = await generateAllyArgument({
          allyPhilosopherId,
          opponentName: philName,
          moveType,
          lastPhilosopherStatement: battle.lastPhilosopherStatement(),
        });
        if (!finalArgument || !finalArgument.trim()) {
          finalArgument = `I must challenge this position. A careful ${moveType} analysis reveals it fails to account for crucial philosophical considerations.`;
        }
        onToolkitArgument(finalArgument);
      }

      const allyDisplayName = allyPhilosopherId
        ? allyPhilosopherId.charAt(0).toUpperCase() + allyPhilosopherId.slice(1)
        : null;

      // Capture the philosopher's previous statement + history BEFORE we log the
      // player's move (parity with the legacy route ordering).
      const philosopherPrevStatement = battle.lastPhilosopherStatement();
      const historyCopy = [...battle.getHistory()];
      battle.addMessage('user', `[${moveType}] ${finalArgument}`);

      const isFirstExchange = battle.exchanges === 0;

      const previousPlayerCommentary = battle.scores.map((s) => s.playerCommentary || s.commentary).filter(Boolean);
      const previousCounterCommentary = battle.scores.map((s) => s.counterCommentary).filter(Boolean);

      // Phase 1: player judge (fail loud on parse error).
      onJudging('player');
      const playerJudgeScores = await runPlayerJudge({
        philosopherStatement: philosopherPrevStatement,
        playerArg: finalArgument,
        moveType,
        philosopherName: philName,
        previousCommentary: previousPlayerCommentary,
      });

      const playerResult = battle.applyPlayerAttack(playerJudgeScores, moveType, finalArgument, frameworkTradition);
      onPlayerJudgeResult({
        judgeScores: playerJudgeScores,
        damage: playerResult.damage,
        battle: playerResult.battle,
      });

      // Build the philosopher's battle context AFTER phase 1 so the judge's
      // verdict (six dims + commentary) calibrates the reply — without it the
      // in-character model steelmans junk input into a serious objection.
      // Deferring is safe: neither the judge nor applyPlayerAttack touches
      // battle.shouldSignatureMove (latched in applyPhilosopherCounter for the
      // NEXT exchange), so the signature-move injection reads the same value it
      // did before phase 1.
      const battleContext = buildBattleContext(battle, {
        moveType,
        finalArgument,
        isPhilosopherAlly,
        allyDisplayName,
        judgeResult: playerJudgeScores,
      });

      // Phase 2 + 3: philosopher streams, then counter judge. On failure here we
      // still finalize the exchange so the battle state can't get stuck.
      try {
        const philosopherResponse = await streamPhilosopherResponse({
          philosopherPrompt: systemPrompt,
          battleContext,
          history: historyCopy,
          userMessage: finalArgument,
          onToken: (chunk) => onText(chunk),
        });
        battle.addMessage('assistant', philosopherResponse);

        let counterJudgeScores = null;
        if (!isFirstExchange) {
          onJudging('counter');
          counterJudgeScores = await runCounterJudge({
            playerArg: finalArgument,
            philosopherResponse,
            philosopherName: philName,
            previousCommentary: previousCounterCommentary,
          });
        }

        const counterResult = battle.applyPhilosopherCounter(counterJudgeScores, philosopherResponse);

        if (!isFirstExchange && counterJudgeScores) {
          onCounterJudgeResult({
            counterJudgeScores,
            damage: counterResult.damage,
            battle: counterResult.battle,
          });
        }

        onResult({
          battle: counterResult.battle,
          combo: counterResult.combo,
          shouldSignatureMove: counterResult.shouldSignatureMove,
        });

        if (counterResult.battle.status !== 'active') {
          const reward = battle.calculateReward();
          onBattleEnd(reward);
          battles.delete(battleId);
        }

        // Suggest moves for the next round (non-fatal).
        if (counterResult.battle.status === 'active' && philosopherResponse) {
          try {
            const suggestions = await suggestMoves({ philosopherStatement: philosopherResponse });
            onMoveSuggestions(suggestions);
          } catch (suggestErr) {
            console.warn('Move suggestion failed (non-fatal):', suggestErr.message);
          }
        }

        onDone();
      } catch (streamErr) {
        // Finalize with no counter damage so the exchange doesn't get stuck.
        battle.applyPhilosopherCounter(null, '');
        onError(streamErr.message);
      }
    } catch (err) {
      onError(err.message);
    }
  })();
}

/**
 * Get current battle state.
 * @param {string} battleId
 * @returns {Promise<object>}
 */
export async function getBattleState(battleId) {
  const battle = battles.get(battleId);
  if (!battle) {
    return { error: 'Battle not found' };
  }
  return { ...battle.snapshot(), scores: battle.scores };
}

/**
 * Status stub (legacy hit the server's /api/status). Kept for surface parity.
 * @returns {Promise<object>}
 */
export async function getStatus() {
  return { ok: true, activeBattles: battles.size };
}

/**
 * Clear a philosopher's free-dialogue session history.
 * @param {string} philosopherId
 * @param {string} [playerId='default']
 */
export async function clearSession(philosopherId, playerId = 'default') {
  if (philosopherId) {
    dialogueHistories.delete(philosopherId);
  } else {
    dialogueHistories.clear();
  }
}

/**
 * Evaluate a free-text quiz challenge via LLM judge.
 * @param {object} payload - { challenge_type, studentAnswer, ...fields }
 * @returns {Promise<{score: number, dimensions: object, commentary: string, feedback: string}>}
 */
export async function evaluateChallenge(payload) {
  const { challenge_type, studentAnswer } = payload;
  if (!challenge_type || !studentAnswer) {
    throw new Error('challenge_type and studentAnswer required');
  }

  const result = await runQuizEvaluation(challenge_type, payload);

  let weighted = result.weighted_score;
  if (weighted == null) {
    const dims = Object.entries(result).filter(([k, v]) => typeof v === 'number' && k !== 'weighted_score');
    weighted = dims.length > 0 ? dims.reduce((sum, [, v]) => sum + v, 0) / dims.length : 5;
  }

  return {
    score: weighted,
    dimensions: Object.fromEntries(
      Object.entries(result).filter(([k]) => !['weighted_score', 'feedback', 'commentary'].includes(k)),
    ),
    commentary: result.commentary || result.feedback || '',
    feedback: result.feedback || '',
  };
}

/**
 * Evaluate a recall-mode quiz answer via LLM judge.
 * @param {object} params - { philosopherName, tradition, coreAssumptions, studentAnswer }
 * @returns {Promise<object>} { accuracy, specificity, completeness, weighted_score, feedback }
 */
export async function evaluateRecall({ philosopherName, tradition, coreAssumptions, studentAnswer }) {
  if (!philosopherName || !studentAnswer) {
    throw new Error('philosopherName and studentAnswer required');
  }
  return runQuizRecall({ philosopherName, tradition, coreAssumptions, studentAnswer });
}
