/**
 * Battle Engine (client-side, v2).
 *
 * Ported verbatim (where possible) from server/src/services/battle-engine.js.
 * Behavior parity with the legacy engine matters more than cleanup.
 *
 * In v2 the battle state lives client-side: instead of a Map<battleId, state>
 * held on a server, the debate scene holds a single `Battle` instance. Each
 * instance also owns its own conversation history (replacing the server-side
 * session-manager, which was keyed by `battle:${philosopherId}`).
 *
 * Phase 2: the scoring/type/move tables are pack data. Each Battle resolves its
 * config from (in order) an explicit `config` arg, the active pack, then the
 * baked-in defaults below. The defaults equal the fe-ethics pack's values, so a
 * Battle built before the pack loads behaves identically.
 */

import { getBattleConfig } from '../pack-loader.js';

export const SCORE_WEIGHTS = {
  logical_validity: 0.25,
  engagement: 0.25,
  philosophical_precision: 0.2,
  rhetorical_clarity: 0.15,
  originality: 0.1,
  dialectical_awareness: 0.05,
};

export const TYPE_CHART = {
  virtue_ethics: { strong: 'consequentialism', weak: 'metaethics' },
  deontology: { strong: 'social_contract', weak: 'consequentialism' },
  consequentialism: { strong: 'deontology', weak: 'virtue_ethics' },
  social_contract: { strong: 'moral_psychology', weak: 'deontology' },
  metaethics: { strong: 'virtue_ethics', weak: 'applied_ethics' },
  moral_psychology: { strong: 'metaethics', weak: 'social_contract' },
  applied_ethics: { strong: 'moral_psychology', weak: 'metaethics' },
};

export const MOVE_BONUSES = {
  counterexample: { bonus_dim: 'engagement', bonus: 2, risk_dim: 'logical_validity', risk: -2 },
  reductio: { bonus_dim: 'logical_validity', bonus: 2, risk_dim: 'engagement', risk: -3 },
  socratic_questioning: { bonus_dim: 'dialectical_awareness', bonus: 2, damage_mult: 0.7, debuff: true },
  framework_shift: { bonus_dim: 'originality', bonus: 2, risk_dim: 'engagement', risk: -2, type_check: true },
  free_form: { bonus_dim: null, bonus: 0, risk_dim: null, risk: 0 },
};

export const DEFAULT_PLAYER_HP = 100;
export const DEFAULT_PHILOSOPHER_HP = 100;
export const MAX_EXCHANGES = 5;
export const GOON_MAX_EXCHANGES = 3;
export const SIGNATURE_MOVE_THRESHOLD = 0.3; // 30% HP

/**
 * A single battle instance. Owns HP, exchange counters, move/score history,
 * combo tracking, and the conversation history with the philosopher.
 */
export class Battle {
  /**
   * @param {string} battleId
   * @param {object} philosopherData - { id, name, tradition, level, role }
   * @param {object} [config] - pack battle config { typeChart, scoreWeights, moveBonuses }.
   *   Omit to resolve from the active pack (falling back to baked-in defaults).
   */
  constructor(battleId, philosopherData, config = null) {
    const role = philosopherData.role || '';
    const maxExchanges = role === 'goon' ? GOON_MAX_EXCHANGES : MAX_EXCHANGES;

    // Resolve pack config: explicit arg → active pack → baked-in defaults.
    const cfg = config || getBattleConfig() || {};
    this.scoreWeights = cfg.scoreWeights || SCORE_WEIGHTS;
    this.typeChart = cfg.typeChart || TYPE_CHART;
    this.moveBonuses = cfg.moveBonuses || MOVE_BONUSES;

    this.id = battleId;
    this.philosopher = philosopherData;
    this.playerHp = DEFAULT_PLAYER_HP;
    this.philosopherHp = DEFAULT_PHILOSOPHER_HP;
    this.exchanges = 0;
    this.maxExchanges = maxExchanges;
    this.playerMoves = [];
    this.philosopherMoves = [];
    this.scores = [];
    this.status = 'active'; // active, player_win, philosopher_win, draw
    this.signatureMoveUsed = false;
    this.comboTracker = [];
    this.shouldSignatureMove = false;
    this._pendingPlayerJudge = null;
    this._socraticDebuff = false;

    /**
     * Conversation history with this philosopher (replaces session-manager).
     * Each entry: { role: 'user' | 'assistant', content: string }
     * @type {Array<{role: string, content: string}>}
     */
    this.history = [];
  }

  /** Snapshot of battle state, matching the legacy `battle` payload shape. */
  snapshot() {
    return {
      playerHp: this.playerHp,
      philosopherHp: this.philosopherHp,
      exchanges: this.exchanges,
      maxExchanges: this.maxExchanges,
      status: this.status,
    };
  }

  // ─── Conversation history helpers (replaces session-manager) ───

  getHistory() {
    return this.history;
  }

  addMessage(role, content) {
    this.history.push({ role, content });
    // Match legacy session-manager MAX_HISTORY_LENGTH = 20
    if (this.history.length > 20) {
      this.history.splice(0, this.history.length - 20);
    }
  }

  /** The philosopher's most recent statement (what the player responds to). */
  lastPhilosopherStatement() {
    const last = [...this.history].reverse().find((m) => m.role === 'assistant');
    return last ? last.content : '';
  }

  // ─── Scoring ───

  calculateWeightedScore(scores) {
    let total = 0;
    for (const [dim, weight] of Object.entries(this.scoreWeights)) {
      total += (scores[dim] || 0) * weight;
    }
    return total;
  }

  applyMoveModifiers(scores, moveType, philosopherTradition, frameworkTradition) {
    const modified = { ...scores };
    const move = this.moveBonuses[moveType];
    if (!move) return modified;

    if (move.bonus_dim) {
      modified[move.bonus_dim] = Math.min(10, (modified[move.bonus_dim] || 0) + move.bonus);
    }

    if (move.type_check && frameworkTradition && philosopherTradition) {
      const typeInfo = this.typeChart[frameworkTradition];
      if (typeInfo && typeInfo.strong === philosopherTradition) {
        modified._typeMultiplier = 1.5;
      }
    }

    return modified;
  }

  calculatePlayerDamage(playerJudgeScores, moveType, philosopherTradition, frameworkTradition) {
    const modified = this.applyMoveModifiers(playerJudgeScores, moveType, philosopherTradition, frameworkTradition);
    const weightedScore = this.calculateWeightedScore(modified);
    const typeMultiplier = modified._typeMultiplier || 1.0;
    const moveMult = this.moveBonuses[moveType]?.damage_mult || 1.0;

    const playerDamage = Math.max(3, Math.floor(weightedScore * 3.5 * moveMult * typeMultiplier));

    return {
      playerDamage,
      weightedScore,
      typeMultiplier,
      typeEffective: typeMultiplier > 1.0,
    };
  }

  calculatePhilosopherDamage(counterJudgeScores) {
    const weightedScore = this.calculateWeightedScore(counterJudgeScores);
    const philosopherDamage = Math.max(3, Math.floor(weightedScore * 2.5));
    return { philosopherDamage, counterWeightedScore: weightedScore };
  }

  // ─── Two-phase exchange ───

  /**
   * Phase 1: apply the player's attack damage to the philosopher.
   * Called after player judge scores are available, BEFORE the philosopher responds.
   */
  applyPlayerAttack(playerJudgeScores, moveType, playerArg, frameworkTradition) {
    if (this.status !== 'active') {
      return { error: 'Battle not active' };
    }

    const playerDmg = this.calculatePlayerDamage(
      playerJudgeScores,
      moveType,
      this.philosopher.tradition,
      frameworkTradition,
    );

    this.philosopherHp = Math.max(0, this.philosopherHp - playerDmg.playerDamage);

    this.comboTracker.push(moveType);
    this.playerMoves.push({ moveType, argument: playerArg });

    this._pendingPlayerJudge = { ...playerJudgeScores, ...playerDmg };

    const isFirstExchange = this.exchanges === 0;

    return {
      damage: { ...playerDmg, firstExchange: isFirstExchange },
      battle: this.snapshot(),
    };
  }

  /**
   * Phase 2: apply the philosopher's counter damage and finalize the exchange.
   * On the first exchange, counterJudgeScores is null (no retaliation).
   */
  applyPhilosopherCounter(counterJudgeScores, philosopherArg) {
    if (this.status !== 'active') {
      return { error: 'Battle not active' };
    }

    const isFirstExchange = this.exchanges === 0;

    let philDmg = { philosopherDamage: 0, counterWeightedScore: 0 };
    if (!isFirstExchange && counterJudgeScores) {
      philDmg = this.calculatePhilosopherDamage(counterJudgeScores);
      this.playerHp = Math.max(0, this.playerHp - philDmg.philosopherDamage);
    }

    this.philosopherMoves.push({ argument: philosopherArg });
    this.exchanges++;

    const pending = this._pendingPlayerJudge || {};
    this.scores.push({
      ...pending,
      playerCommentary: pending.commentary,
      counterCommentary: counterJudgeScores ? counterJudgeScores.commentary : null,
      philosopherDamage: philDmg.philosopherDamage,
      counterWeightedScore: philDmg.counterWeightedScore,
      firstExchange: isFirstExchange,
    });
    this._pendingPlayerJudge = null;

    const lastMove = this.comboTracker[this.comboTracker.length - 1];
    this._socraticDebuff = lastMove === 'socratic_questioning';

    const shouldSignature =
      !this.signatureMoveUsed && this.philosopherHp <= DEFAULT_PHILOSOPHER_HP * SIGNATURE_MOVE_THRESHOLD;
    // Latch it so the next philosopher-context assembly can read it (legacy read
    // battle.shouldSignatureMove when building the battle context wrapper).
    this.shouldSignatureMove = shouldSignature;

    const combo = this.detectCombo(this.comboTracker);

    if (this.philosopherHp <= 0) {
      this.status = 'player_win';
    } else if (this.playerHp <= 0) {
      this.status = 'philosopher_win';
    } else if (this.exchanges >= this.maxExchanges) {
      this.status = 'draw';
    }

    return {
      damage: {
        philosopherDamage: philDmg.philosopherDamage,
        counterWeightedScore: philDmg.counterWeightedScore,
        firstExchange: isFirstExchange,
      },
      battle: this.snapshot(),
      shouldSignatureMove: shouldSignature,
      combo,
    };
  }

  /**
   * Process an "agree" exchange.
   * Contradiction: player takes 25-40, philosopher 0.
   * No contradiction: philosopher takes 8-15, player 0.
   */
  processAgreeExchange(agreeResult) {
    if (this.status !== 'active') {
      return { error: 'Battle not active' };
    }

    let playerDamage = 0;
    let philosopherDamage = 0;

    if (agreeResult.contradiction) {
      playerDamage = Math.floor(Math.random() * 16) + 25; // 25-40
      philosopherDamage = 0;
    } else {
      playerDamage = 0;
      philosopherDamage = Math.floor(Math.random() * 8) + 8; // 8-15
    }

    this.playerHp = Math.max(0, this.playerHp - playerDamage);
    this.philosopherHp = Math.max(0, this.philosopherHp - philosopherDamage);
    this.exchanges++;

    this.playerMoves.push({ moveType: 'agree', argument: agreeResult.claim || '' });

    if (this.philosopherHp <= 0) {
      this.status = 'player_win';
    } else if (this.playerHp <= 0) {
      this.status = 'philosopher_win';
    } else if (this.exchanges >= this.maxExchanges) {
      this.status = 'draw';
    }

    return {
      damage: { playerDamage, philosopherDamage },
      battle: this.snapshot(),
    };
  }

  /**
   * Process a "reconstruct" exchange.
   * Goon one-shot: level <= 3 AND weighted_score >= 7 → philosopherHp = 0.
   * Philosopher 2x: weighted_score >= 5 → double damage.
   * Low score penalty: weighted_score < 4 → +5 philosopher damage.
   */
  processReconstructExchange(judgeScores, playerReconstruction, philosopherResponse) {
    if (this.status !== 'active') {
      return { error: 'Battle not active' };
    }

    const weightedScore =
      (judgeScores.accuracy || 0) * 0.45 + (judgeScores.charity || 0) * 0.25 + (judgeScores.critique || 0) * 0.3;

    const isGoon = (this.philosopher.level || 1) <= 3;
    if (isGoon && weightedScore >= 7) {
      this.philosopherHp = 0;
      this.exchanges++;
      this.playerMoves.push({ moveType: 'reconstruct', argument: playerReconstruction });
      this.philosopherMoves.push({ argument: philosopherResponse || '' });
      this.scores.push({ ...judgeScores, weightedScore, playerDamage: this.philosopherHp, philosopherDamage: 0 });
      this.status = 'player_win';

      return {
        damage: { playerDamage: 999, philosopherDamage: 0, weightedScore },
        battle: this.snapshot(),
        oneShot: true,
      };
    }

    let playerDamage;
    if (weightedScore >= 5) {
      playerDamage = Math.max(3, Math.floor(weightedScore * 3.5 * 2.0));
    } else {
      playerDamage = Math.max(3, Math.floor(weightedScore * 3.5));
    }

    let philosopherDamage = Math.max(3, Math.floor((10 - weightedScore) * 2.5));

    if (weightedScore < 4) {
      philosopherDamage += 5;
    }

    const isFirstExchange = this.exchanges === 0;
    if (isFirstExchange) {
      philosopherDamage = 0;
    }

    this.philosopherHp = Math.max(0, this.philosopherHp - playerDamage);
    this.playerHp = Math.max(0, this.playerHp - philosopherDamage);
    this.exchanges++;

    this.playerMoves.push({ moveType: 'reconstruct', argument: playerReconstruction });
    this.philosopherMoves.push({ argument: philosopherResponse || '' });
    this.scores.push({ ...judgeScores, weightedScore, playerDamage, philosopherDamage });

    if (this.philosopherHp <= 0) {
      this.status = 'player_win';
    } else if (this.playerHp <= 0) {
      this.status = 'philosopher_win';
    } else if (this.exchanges >= this.maxExchanges) {
      this.status = 'draw';
    }

    return {
      damage: { playerDamage, philosopherDamage, weightedScore, firstExchange: isFirstExchange },
      battle: this.snapshot(),
      oneShot: false,
    };
  }

  detectCombo(moves) {
    const last3 = moves.slice(-3);
    if (last3.length < 3) return null;

    if (
      last3[0] === 'socratic_questioning' &&
      last3[1] === 'socratic_questioning' &&
      last3[2] === 'counterexample'
    ) {
      return { name: 'Socratic Trap', bonus: 5, description: 'Weakened their position, then struck!' };
    }

    if (last3[0] === 'counterexample' && last3[1] === 'framework_shift' && last3[2] === 'reductio') {
      return { name: 'Case-and-Principle', bonus: 5, description: 'From particular to general to absurd!' };
    }

    if (
      last3[0] === 'framework_shift' &&
      last3[1] === 'socratic_questioning' &&
      last3[2] === 'framework_shift'
    ) {
      return { name: 'Dialectical Ascent', bonus: 5, description: 'Transcended the framework entirely!' };
    }

    return null;
  }

  useSignatureMove() {
    this.signatureMoveUsed = true;
  }

  calculateReward() {
    if (this.scores.length === 0) {
      return { xp: 0, avgScore: 0, status: this.status, exchanges: this.exchanges };
    }
    const avgScore = this.scores.reduce((sum, s) => sum + s.weightedScore, 0) / this.scores.length;
    let xp = 0;

    if (this.status === 'player_win') {
      xp = Math.round(avgScore * 10 * (this.philosopher.level || 1));
    } else if (this.status === 'draw') {
      xp = Math.round(avgScore * 5 * (this.philosopher.level || 1));
    } else {
      xp = Math.round(avgScore * 3 * (this.philosopher.level || 1));
    }

    return { xp, avgScore, status: this.status, exchanges: this.exchanges };
  }
}
