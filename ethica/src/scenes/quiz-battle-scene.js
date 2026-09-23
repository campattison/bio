import Phaser from '../lib/phaser.js';
import { SCENE_KEYS } from './scene-keys.js';
import { StateMachine } from '../utils/state-machine.js';
import { BaseScene } from './base-scene.js';
import { DIRECTION } from '../common/direction.js';
import { evaluateChallenge } from '../services/api-client.js';
import { dataManager } from '../utils/data-manager.js';
import { BattleMenu } from '../battle/ui/menu/battle-menu.js';
import { EnemyBattleMonster } from '../battle/monsters/enemy-battle-monster.js';
import { PlayerBattleMonster } from '../battle/monsters/player-battle-monster.js';
import { Background } from '../battle/background.js';
import { DataUtils } from '../utils/data-utils.js';
import {
  BATTLE_ASSET_KEYS,
  CHARACTER_ASSET_KEYS,
} from '../assets/asset-keys.js';
import { KENNEY_FUTURE_NARROW_FONT_NAME } from '../assets/font-keys.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUIZ_STATES = Object.freeze({
  INTRO: 'INTRO',
  ROUND_SELECT: 'ROUND_SELECT',
  PRESENT_CHALLENGE: 'PRESENT_CHALLENGE',
  PLAYER_INPUT: 'PLAYER_INPUT',
  EVALUATE: 'EVALUATE',
  DAMAGE_ANIM: 'DAMAGE_ANIM',
  GOON_REACT: 'GOON_REACT',
  POST_ROUND_CHECK: 'POST_ROUND_CHECK',
  RESOLVE: 'RESOLVE',
  FINISHED: 'FINISHED',
});

const MAX_ROUNDS = 3;
const GOON_HP = 60;
const PLAYER_HP = 100;
const FAST_THRESHOLD_MS = 5000;

// Damage table
const DAMAGE = {
  MC_CORRECT: 25,
  MC_CORRECT_FAST: 30,
  MC_WRONG_TO_PLAYER: 20,
  FREE_TEXT_HIGH: 25,     // score >= 7
  FREE_TEXT_MID_GOON: 10, // score 4-6
  FREE_TEXT_MID_PLAYER: 10,
  FREE_TEXT_LOW: 20,      // score < 4
};

// Challenge type sets
const MC_TYPES = new Set(['voice', 'tradition']);
const FREE_TEXT_TYPES = new Set(['objection', 'reconstruct', 'distinguish', 'apply']);

// Personality-keyed challenge prompts
const CHALLENGE_PROMPTS = {
  aggressive: {
    voice: [
      'I BET you can\'t tell me who said THIS!',
      'Name the philosopher or ADMIT you haven\'t read anything!',
      'Who said this? Quick! No stalling!',
    ],
    tradition: [
      'What tradition is this from? Don\'t guess — KNOW!',
      'Sort THIS into a tradition. If you even CAN!',
      'Name the school! And don\'t you DARE get it wrong!',
    ],
    objection: [
      'Here\'s what I believe. PROVE ME WRONG!',
      'This claim is OBVIOUSLY true. Object if you dare!',
      'Go ahead, try to knock THIS down. I\'ll wait.',
    ],
    reconstruct: [
      'State this argument EXACTLY. No hand-waving!',
      'Tell me what they ACTUALLY said! Not your version — THEIRS!',
      'Reconstruct this argument or admit you never understood it!',
    ],
    distinguish: [
      'These two say the SAME THING. Fight me!',
      'I bet you can\'t tell these two apart!',
      'Same tradition, same ideas. PROVE me wrong!',
    ],
    apply: [
      'I DARE you to channel this philosopher\'s response!',
      'How would THEY respond? Not you — THEM!',
      'Speak as if you were this philosopher. IF you can!',
    ],
  },
  corrective: {
    voice: [
      'Identify the author. Precisely, if you please.',
      'Which philosopher wrote this? I expect exactitude.',
      'Name the source. And do be specific.',
    ],
    tradition: [
      'Classify this passage by tradition. Correctly, this time.',
      'To which school does this belong? Think carefully.',
      'Tradition identification. A simple task for a prepared student.',
    ],
    objection: [
      'State your objection to this claim. With precision.',
      'This position has a flaw. Identify it. Exactly.',
      'Object — but do so with philosophical rigor, not bluster.',
    ],
    reconstruct: [
      'State the argument precisely. No hand-waving.',
      'Reconstruct this position. Every premise. Every step.',
      'I require a complete reconstruction. Omit nothing essential.',
    ],
    distinguish: [
      'These positions are often confused. Distinguish them. Carefully.',
      'Students routinely conflate these two. Show me you do not.',
      'The distinction is subtle. I expect you to capture it.',
    ],
    apply: [
      'How would this philosopher respond? I expect fidelity to their actual views.',
      'Channel this thinker\'s perspective. Not your interpretation — their argument.',
      'Apply their framework. And do not confuse it with anyone else\'s.',
    ],
  },
  baiting: {
    voice: [
      'Okay who even said this? They all sound the same to me.',
      'I\'m gonna say this is Kant. It\'s always Kant, right?',
      'Bet you can\'t tell — these philosophers all repeat each other.',
    ],
    tradition: [
      'This could be from ANY tradition. They\'re all interchangeable.',
      'I say this is consequentialism. Or deontology. Or whatever. Same difference.',
      'Traditions are just labels. Prove they\'re real by sorting THIS.',
    ],
    objection: [
      'This claim is obviously true AND obviously false. Pick a side.',
      'I believe the opposite of whatever you\'re about to say. Go.',
      'Here\'s a claim designed to be wrong. Or IS it? Object!',
    ],
    reconstruct: [
      'I heard this argument is actually bad. Reconstruct it and we\'ll see.',
      'People CLAIM this is a great argument. State it and let\'s test that.',
      'Go ahead, reconstruct it. I bet it\'s weaker than people think.',
    ],
    distinguish: [
      'Same thing, right? These two are basically copies of each other.',
      'I deliberately picked the two most similar thinkers. Good luck.',
      'Honestly? I can\'t tell them apart. Can YOU?',
    ],
    apply: [
      'I doubt you understand this philosopher well enough to answer.',
      'Try channeling someone you probably can\'t even spell. Go.',
      'This is where everyone fails. How would THEY respond?',
    ],
  },
  dismissive: {
    voice: [
      'I doubt you can identify this. But go ahead.',
      'Name the author. I\'m not expecting much.',
      'Who said this? And no, "some philosopher" doesn\'t count.',
    ],
    tradition: [
      'Place this in its tradition. If you can.',
      'Which school? I suspect you\'ll guess wrong.',
      'Tradition identification. Let\'s see if you surprise me.',
    ],
    objection: [
      'Object to this. Assuming you can muster a real argument.',
      'I doubt you can find anything wrong with this. Prove me wrong.',
      'Raise an objection. A real one, not a feeling.',
    ],
    reconstruct: [
      'Reconstruct this argument. I doubt you\'ve understood it.',
      'State the actual argument. Not what you THINK it says.',
      'Let\'s see if you can reconstruct something you probably skimmed.',
    ],
    distinguish: [
      'These two are different. Or so they claim. Explain how.',
      'I doubt you see the difference. Show me.',
      'Distinguish these positions. IF there\'s a difference to find.',
    ],
    apply: [
      'I doubt you even understand this philosopher well enough to answer.',
      'How would they respond? I expect a shallow attempt.',
      'Channel their perspective. I\'m already skeptical.',
    ],
  },
  probing: {
    voice: [
      'Identify the author of this passage.',
      'Attribution. Who wrote this?',
      'Name the philosopher. Justify your answer.',
    ],
    tradition: [
      'Classify this passage by philosophical tradition.',
      'Which school produced this thinking?',
      'Identify the tradition. Explain your reasoning.',
    ],
    objection: [
      'This claim has a vulnerability. Identify it and press it.',
      'State the strongest objection to this position.',
      'Where does this argument fail? Be specific.',
    ],
    reconstruct: [
      'Reconstruct this philosopher\'s central argument. Completely.',
      'State the full argument. Premises, inferences, conclusion.',
      'What is this philosopher\'s position? State it as they would.',
    ],
    distinguish: [
      'These two are often conflated. Distinguish them precisely.',
      'What separates these positions? Be thorough.',
      'The difference matters. Explain why and how.',
    ],
    apply: [
      'How would this philosopher respond to the passage? Be faithful.',
      'Channel this thinker. What would they actually say?',
      'Apply their framework to this passage. Demonstrate mastery.',
    ],
  },
  slippery: {
    voice: [
      'Who said this? Or... did they? Maybe I changed a word or two.',
      'Name the author. But are you sure it\'s who you think?',
      'Identify this. Careful — the attribution might not be obvious.',
    ],
    tradition: [
      'What tradition? But notice — it borrows from several.',
      'Sort this. Though honestly, the boundaries are blurry.',
      'Which school? The answer might be less clear than you expect.',
    ],
    objection: [
      'Object! But I warn you — this claim is slipperier than it looks.',
      'Find the flaw. Assuming there IS one. Maybe the flaw is in YOUR thinking.',
      'Raise your objection. I\'ll wiggle out of it either way.',
    ],
    reconstruct: [
      'State the argument. But which version? There are several.',
      'Reconstruct this position. The real one, not the straw man.',
      'What did they ACTUALLY argue? Not what their critics say.',
    ],
    distinguish: [
      'Different? Or the same viewed from different angles?',
      'Tell me the difference. If there even is one.',
      'Distinguish — but maybe the real distinction isn\'t where you think.',
    ],
    apply: [
      'How would they respond? But which version of their view are you using?',
      'Channel them. But their position shifted over time — be careful.',
      'Apply their thinking. If you can pin it down.',
    ],
  },
  stubborn: {
    voice: [
      'Who said this? I already know. I want to see if YOU do.',
      'Name the philosopher. I won\'t change my mind about the answer.',
      'Identify the author. And I WILL argue if you\'re wrong.',
    ],
    tradition: [
      'What tradition? I have my answer and nothing will change it.',
      'Sort this. And don\'t try to convince me of a wrong answer.',
      'Which school? I already know. Do you?',
    ],
    objection: [
      'This is what I believe. I won\'t budge. Try to move me.',
      'Object all you want. My conviction is immovable.',
      'Here\'s my claim. It\'s true. MAKE me think otherwise.',
    ],
    reconstruct: [
      'State this argument. Get it wrong and I\'ll correct you. Harshly.',
      'Reconstruct it. I know every detail — don\'t skip anything.',
      'The argument is clear. Can you state it? I\'ll judge.',
    ],
    distinguish: [
      'I say these are the same. You say different? SHOW me.',
      'These are identical positions. Change my mind.',
      'Same ideas, different names. Prove otherwise. You can\'t.',
    ],
    apply: [
      'How would they respond? I know exactly how. Do you?',
      'Channel their view. I\'ll know immediately if you\'re wrong.',
      'Apply their framework. And don\'t water it down.',
    ],
  },
  clinical: {
    voice: [
      'Passage attribution. Identify the philosopher.',
      'Author identification task. Proceed.',
      'Name the source of this passage.',
    ],
    tradition: [
      'Tradition classification exercise. Identify the school.',
      'Categorize this passage by philosophical tradition.',
      'Tradition identification. Select the correct classification.',
    ],
    objection: [
      'Objection task. Identify a substantive flaw in this claim.',
      'Evaluate this position and formulate your strongest objection.',
      'Construct a rigorous objection to the following claim.',
    ],
    reconstruct: [
      'Argument reconstruction exercise. State the full argument.',
      'Reconstruct this philosopher\'s position. Include all key premises.',
      'Full argument reconstruction required. Demonstrate comprehension.',
    ],
    distinguish: [
      'Comparison exercise. Distinguish these two positions.',
      'These philosophers occupy the same tradition. Identify their differences.',
      'Distinguish between these positions with philosophical precision.',
    ],
    apply: [
      'Application task. How would this philosopher respond to the passage?',
      'Channel this philosopher\'s perspective in response to the quote.',
      'Cross-perspective application. Respond from the named philosopher\'s view.',
    ],
  },
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function philosopherToMonster(philosopher) {
  return {
    id: `quiz_${philosopher.id}`,
    monsterId: 900,
    name: philosopher.name,
    assetKey: CHARACTER_ASSET_KEYS.NPC,
    assetFrame: philosopher.npcFrame || 0,
    currentLevel: philosopher.level || 1,
    maxHp: philosopher.hp || GOON_HP,
    currentHp: philosopher.hp || GOON_HP,
    baseAttack: 5,
    attackIds: [],
    currentAttack: 5,
    baseExp: (philosopher.level || 1) * 10,
    currentExp: 0,
    isPhilosopher: true,
    philosopherId: philosopher.id,
  };
}

function playerToMonster() {
  const level = dataManager.getPlayerLevel();
  return {
    id: 'student_0',
    monsterId: 999,
    name: 'STUDENT',
    assetKey: BATTLE_ASSET_KEYS.TRAINER_YOUTH_BOY,
    assetFrame: 0,
    currentLevel: level,
    maxHp: PLAYER_HP,
    currentHp: PLAYER_HP,
    baseAttack: 10,
    attackIds: [],
    currentAttack: 10,
    baseExp: 0,
    currentExp: 0,
  };
}

/**
 * Fisher-Yates shuffle.
 * @param {any[]} arr
 * @returns {any[]}
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Weighted random selection from a weights object.
 * @param {Object<string, number>} weights - e.g. { objection: 40, voice: 30 }
 * @returns {string}
 */
function weightedRandom(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [key, weight] of entries) {
    r -= weight;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/**
 * Pick a random element from an array. Returns undefined if empty.
 */
function pickRandom(arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Truncate a string to maxLen characters, adding ellipsis if needed.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen = 28) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}

// ---------------------------------------------------------------------------
// JSDoc
// ---------------------------------------------------------------------------

/**
 * @typedef QuizBattleSceneData
 * @type {object}
 * @property {object} philosopher - The quiz goon data from philosophers.json
 * @property {number} [npcFrame]
 * @property {boolean} [isWild]
 */

// ---------------------------------------------------------------------------
// QuizBattleScene
// ---------------------------------------------------------------------------

export class QuizBattleScene extends BaseScene {
  /** @type {StateMachine} */
  #stateMachine;
  /** @type {QuizBattleSceneData} */
  #sceneData;
  /** @type {number} */
  #playerHp;
  /** @type {number} */
  #goonHp;
  /** @type {number} */
  #round;
  /** @type {string} */
  #personality;
  /** @type {Object<string, number>} */
  #challengeWeights;
  /** @type {number[]} */
  #difficultyRange;
  /** @type {string} */
  #currentChallengeType;
  /** @type {EnemyBattleMonster} */
  #activeEnemyMonster;
  /** @type {PlayerBattleMonster} */
  #activePlayerMonster;
  /** @type {Background} */
  #background;
  /** @type {BattleMenu} */
  #battleMenu;
  /** @type {Phaser.GameObjects.Text} */
  #dialogueText;
  /** @type {Phaser.GameObjects.Rectangle} */
  #dialogueBg;
  /** @type {Phaser.GameObjects.Text} */
  #roundCounter;
  /** @type {Phaser.GameObjects.Text} */
  #statusText;
  /** @type {number} */
  #dialogueAreaTop;
  /** @type {number} */
  #dialogueAreaBottom;
  /** @type {object} */
  #currentQuestion;
  /** @type {string[]} */
  #currentChoices;
  /** @type {number} */
  #correctIndex;
  /** @type {number} */
  #selectedChoice;
  /** @type {Set<string>} */
  #seenQuoteIds;
  /** @type {number} */
  #questionStartTime;
  /** @type {object[]} */
  #quizQuotes;
  /** @type {object[]} */
  #quizPhilosophers;
  /** @type {object[]} */
  #quizTraditions;
  /** @type {HTMLTextAreaElement|null} */
  #freeTextInput;
  /** @type {HTMLButtonElement|null} */
  #freeTextSubmitBtn;
  /** @type {number} */
  #prevGoonHp;
  /** @type {number} */
  #prevPlayerHp;
  /** @type {string} */
  #lastFeedback;
  /** @type {boolean} */
  #lastRoundCorrect;

  constructor() {
    super({ key: SCENE_KEYS.QUIZ_BATTLE_SCENE });
  }

  /**
   * @param {QuizBattleSceneData} data
   */
  init(data) {
    super.init(data);
    this.#sceneData = data;
    this.#playerHp = PLAYER_HP;
    this.#goonHp = data.philosopher?.hp || GOON_HP;
    this.#round = 0;
    this.#personality = data.philosopher?.personality || 'clinical';
    this.#challengeWeights = data.philosopher?.challenge_weights || { voice: 50, tradition: 50 };
    this.#difficultyRange = data.philosopher?.difficulty_range || [1, 3];
    this.#currentChallengeType = '';
    this.#currentQuestion = null;
    this.#currentChoices = [];
    this.#correctIndex = -1;
    this.#selectedChoice = 0;
    this.#seenQuoteIds = new Set();
    this.#questionStartTime = 0;
    this.#freeTextInput = null;
    this.#freeTextSubmitBtn = null;
    this.#prevGoonHp = this.#goonHp;
    this.#prevPlayerHp = this.#playerHp;
    this.#lastFeedback = '';
    this.#lastRoundCorrect = false;
  }

  shutdown() {
    this.#hideFreeTextInput();
  }

  create() {
    super.create();

    // Load quiz content
    const quizContent = DataUtils.getQuizContent(this);
    this.#quizQuotes = quizContent?.quotes || [];
    this.#quizPhilosophers = quizContent?.philosophers || [];
    this.#quizTraditions = quizContent?.traditions || [];

    // --- Background ---
    this.#background = new Background(this);
    this.#background.showForest();

    // --- Enemy (quiz goon) monster ---
    const enemyMonsterData = philosopherToMonster(this.#sceneData.philosopher);
    this.#activeEnemyMonster = new EnemyBattleMonster({
      scene: this,
      monsterDetails: enemyMonsterData,
      skipBattleAnimations: false,
    });
    this.#activeEnemyMonster._phaserGameObject.setScale(4);
    this.#activeEnemyMonster._phaserGameObject.setAlpha(0);

    // --- Player monster ---
    const studentData = playerToMonster();
    this.#activePlayerMonster = new PlayerBattleMonster({
      scene: this,
      monsterDetails: studentData,
      skipBattleAnimations: false,
    });
    this.#activePlayerMonster._phaserGameObject.setAlpha(0);

    // --- Dialogue area ---
    const dialogBoxTop = 190;
    const dialogBoxHeight = 240;
    this.#dialogueAreaTop = dialogBoxTop + 5;
    this.#dialogueAreaBottom = dialogBoxTop + dialogBoxHeight - 10;

    this.#dialogueBg = this.add
      .rectangle(
        this.scale.width / 2,
        dialogBoxTop + dialogBoxHeight / 2,
        this.scale.width - 40,
        dialogBoxHeight,
        0x0f3460,
        0.85,
      )
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x533483)
      .setDepth(5);

    this.#dialogueText = this.add
      .text(40, this.#dialogueAreaTop, '', {
        fontSize: '16px',
        fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
        color: '#e0e0e0',
        wordWrap: { width: this.scale.width - 80 },
        lineSpacing: 5,
      })
      .setOrigin(0, 0)
      .setDepth(6);

    // Geometry mask
    const maskGfx = this.make.graphics({ add: false });
    maskGfx.fillRect(20, dialogBoxTop, this.scale.width - 40, dialogBoxHeight);
    this.#dialogueText.setMask(new Phaser.Display.Masks.GeometryMask(this, maskGfx));

    // Mouse-wheel scrolling
    this.input.on('wheel', (_pointer, _gos, _dx, dy) => {
      const vis = this.#dialogueAreaBottom - this.#dialogueAreaTop;
      const h = this.#dialogueText.height;
      if (h <= vis) return;
      const ny = this.#dialogueText.y + (dy > 0 ? -10 : 10);
      this.#dialogueText.y = Math.max(this.#dialogueAreaBottom - h, Math.min(this.#dialogueAreaTop, ny));
    });

    // --- Round counter ---
    this.#roundCounter = this.add
      .text(this.scale.width - 20, 8, `0/${MAX_ROUNDS}`, {
        fontSize: '20px',
        fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
        color: '#555',
      })
      .setOrigin(1, 0);

    // --- Status text ---
    this.#statusText = this.add
      .text(this.scale.width / 2, 170, '', {
        fontSize: '16px',
        fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
        color: '#c792ea',
        fontStyle: 'italic',
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(10);

    // --- Battle menu (bottom panel) ---
    this.#battleMenu = new BattleMenu(this, this.#activePlayerMonster, false, false, {
      labels: { fight: 'ANSWER', switch: '-', item: '-', flee: '-' },
      infoLine1: 'Quiz',
      infoLine2: 'battle!',
      attackTextStyle: { fontSize: '20px' },
      attackColumnX: 520,
    });

    // --- State machine ---
    this.#createStateMachine();
  }

  update() {
    super.update();
    this.#stateMachine.update();

    if (this._controls.isInputLocked) return;
    const currentState = this.#stateMachine.currentStateName;

    // --- PLAYER_INPUT + MC: navigate attack sub-menu ---
    if (currentState === QUIZ_STATES.PLAYER_INPUT && MC_TYPES.has(this.#currentChallengeType)) {
      const dir = this._controls.getDirectionKeyJustPressed();
      if (dir !== DIRECTION.NONE) {
        this.#battleMenu.handlePlayerInput(dir);
      }
      if (this._controls.wasSpaceKeyPressed()) {
        this.#battleMenu.handlePlayerInput('OK');
        if (this.#battleMenu.selectedAttack !== undefined) {
          this.#selectedChoice = this.#battleMenu.selectedAttack;
          this.#battleMenu.hideMonsterAttackSubMenu();
          this.#stateMachine.setState(QUIZ_STATES.EVALUATE);
        }
      }
      return;
    }

    // --- All other states: SPACE advances BattleMenu message queue ---
    if (this._controls.wasSpaceKeyPressed()) {
      this.#battleMenu.handlePlayerInput('OK');
    }
  }

  // =========================================================================
  // Free-Text Input (HTML overlay)
  // =========================================================================

  #showFreeTextInput(placeholder) {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();

    this.#freeTextInput = document.createElement('textarea');
    this.#freeTextInput.id = 'ethica-quiz-freetext-input';
    this.#freeTextInput.placeholder = placeholder;
    this.#freeTextInput.maxLength = 500;
    this.#freeTextInput.style.cssText = `
      position: fixed;
      left: ${rect.left + 20}px;
      top: ${rect.top + rect.height - 160}px;
      width: ${rect.width - 100}px;
      height: 60px;
      background: rgba(15, 52, 96, 0.95);
      color: #e0e0e0;
      border: 2px solid #533483;
      border-radius: 8px;
      padding: 10px;
      font-family: '${KENNEY_FUTURE_NARROW_FONT_NAME}', monospace;
      font-size: 14px;
      resize: none;
      z-index: 1000;
    `;
    document.body.appendChild(this.#freeTextInput);

    // Prevent Phaser from capturing keyboard events while textarea is focused (Bug 3 fix)
    const stopPhaserCapture = (e) => e.stopPropagation();
    this.#freeTextInput.addEventListener('keydown', stopPhaserCapture);
    this.#freeTextInput.addEventListener('keyup', stopPhaserCapture);
    this.#freeTextInput.addEventListener('keypress', stopPhaserCapture);

    this.#freeTextInput.focus();

    this.#freeTextSubmitBtn = document.createElement('button');
    this.#freeTextSubmitBtn.textContent = 'SUBMIT';
    this.#freeTextSubmitBtn.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width - 75}px;
      top: ${rect.top + rect.height - 150}px;
      width: 55px;
      height: 40px;
      background: #533483;
      color: #e0e0e0;
      border: none;
      border-radius: 6px;
      font-family: '${KENNEY_FUTURE_NARROW_FONT_NAME}', monospace;
      font-size: 12px;
      cursor: pointer;
      z-index: 1001;
    `;
    document.body.appendChild(this.#freeTextSubmitBtn);

    this.#freeTextSubmitBtn.addEventListener('click', () => {
      const answer = this.#freeTextInput.value.trim();
      if (answer.length > 0) {
        this.#hideFreeTextInput();
        this.#evaluateFreeTextAnswer(answer, this.#currentChallengeType);
      }
    });
  }

  #hideFreeTextInput() {
    if (this.#freeTextInput) {
      this.#freeTextInput.remove();
      this.#freeTextInput = null;
    }
    if (this.#freeTextSubmitBtn) {
      this.#freeTextSubmitBtn.remove();
      this.#freeTextSubmitBtn = null;
    }
  }

  async #evaluateFreeTextAnswer(answer, challengeType) {
    this._controls.lockInput = true;
    this.#statusText.setText('Evaluating...').setAlpha(1);

    const q = this.#currentQuestion;
    let payload = { challenge_type: challengeType, studentAnswer: answer };

    // Build payload based on challenge type
    if (challengeType === 'objection') {
      payload.philosopherName = q._philosopherName;
      payload.tradition = q._tradition;
      payload.claim = q._claim;
    } else if (challengeType === 'reconstruct') {
      payload.philosopherName = q._philosopherName;
      payload.tradition = q._tradition;
      payload.coreAssumptions = q._coreAssumptions;
      payload.keyWorks = q._keyWorks;
    } else if (challengeType === 'distinguish') {
      payload.philosopherAName = q._philosopherAName;
      payload.philosopherBName = q._philosopherBName;
      payload.tradition = q._tradition;
      payload.philosopherAPosition = q._philosopherAPosition;
      payload.philosopherBPosition = q._philosopherBPosition;
    } else if (challengeType === 'apply') {
      payload.philosopherAName = q._philosopherAName;
      payload.traditionA = q._traditionA;
      payload.quote = q._quote;
      payload.philosopherBName = q._philosopherBName;
      payload.traditionB = q._traditionB;
      payload.philosopherBPosition = q._philosopherBPosition;
    }

    try {
      const result = await evaluateChallenge(payload);
      const score = result.score || 5;
      this.#lastFeedback = result.commentary || result.feedback || '';

      // Apply damage based on score
      this.#prevGoonHp = this.#goonHp;
      this.#prevPlayerHp = this.#playerHp;

      if (score >= 7) {
        this.#goonHp = Math.max(0, this.#goonHp - DAMAGE.FREE_TEXT_HIGH);
        this.#lastRoundCorrect = true;
      } else if (score >= 4) {
        this.#goonHp = Math.max(0, this.#goonHp - DAMAGE.FREE_TEXT_MID_GOON);
        this.#playerHp = Math.max(0, this.#playerHp - DAMAGE.FREE_TEXT_MID_PLAYER);
        this.#lastRoundCorrect = false;
      } else {
        this.#playerHp = Math.max(0, this.#playerHp - DAMAGE.FREE_TEXT_LOW);
        this.#lastRoundCorrect = false;
      }

      this.#statusText.setAlpha(0);
      this.#stateMachine.setState(QUIZ_STATES.DAMAGE_ANIM);
    } catch (err) {
      console.error('[QuizBattleScene] Free-text evaluation error:', err);
      this.#prevGoonHp = this.#goonHp;
      this.#prevPlayerHp = this.#playerHp;
      this.#goonHp = Math.max(0, this.#goonHp - DAMAGE.FREE_TEXT_MID_GOON);
      this.#playerHp = Math.max(0, this.#playerHp - DAMAGE.FREE_TEXT_MID_PLAYER);
      this.#lastFeedback = 'Could not evaluate — partial credit.';
      this.#lastRoundCorrect = false;
      this.#statusText.setAlpha(0);
      this.#stateMachine.setState(QUIZ_STATES.DAMAGE_ANIM);
    }
  }

  // =========================================================================
  // Challenge Type Selection
  // =========================================================================

  #selectChallengeType() {
    if (this.#round === 1) {
      // Round 1 is always MC for a fast start
      const mcWeights = {};
      for (const [type, w] of Object.entries(this.#challengeWeights)) {
        if (MC_TYPES.has(type)) mcWeights[type] = w;
      }
      if (Object.keys(mcWeights).length === 0) {
        // Fallback: if goon has no MC weights, use voice
        return 'voice';
      }
      return weightedRandom(mcWeights);
    }
    // Rounds 2-3: draw from full weights
    return weightedRandom(this.#challengeWeights);
  }

  // =========================================================================
  // Challenge Prompt (personality-keyed)
  // =========================================================================

  #getChallengePrompt(challengeType) {
    const prompts = CHALLENGE_PROMPTS[this.#personality]?.[challengeType];
    if (prompts && prompts.length > 0) {
      return pickRandom(prompts);
    }
    // Fallback to clinical
    const fallback = CHALLENGE_PROMPTS.clinical?.[challengeType];
    return fallback ? pickRandom(fallback) : 'Your challenge:';
  }

  // =========================================================================
  // Question / Challenge Generation
  // =========================================================================

  #pickQuestion() {
    const [minDiff, maxDiff] = this.#difficultyRange;
    const eligible = this.#quizQuotes.filter(
      (q) => q.difficulty >= minDiff && q.difficulty <= maxDiff && !this.#seenQuoteIds.has(q.id),
    );
    if (eligible.length === 0) {
      const all = this.#quizQuotes.filter((q) => q.difficulty >= minDiff && q.difficulty <= maxDiff);
      if (all.length === 0) {
        return this.#quizQuotes[Math.floor(Math.random() * this.#quizQuotes.length)];
      }
      return all[Math.floor(Math.random() * all.length)];
    }
    const chosen = eligible[Math.floor(Math.random() * eligible.length)];
    this.#seenQuoteIds.add(chosen.id);
    return chosen;
  }

  #generateVoiceChoices(quote) {
    const correctPhil = this.#quizPhilosophers.find((p) => p.id === quote.philosopher_id);
    const correctName = correctPhil?.name || quote.philosopher_id;

    const sameTradition = this.#quizPhilosophers.filter(
      (p) => p.id !== quote.philosopher_id && p.tradition_id === quote.tradition_id,
    );
    const otherPhils = this.#quizPhilosophers.filter(
      (p) => p.id !== quote.philosopher_id && p.tradition_id !== quote.tradition_id,
    );

    let distractors = shuffle(sameTradition).slice(0, 2);
    if (distractors.length < 3) {
      const remaining = 3 - distractors.length;
      distractors = [...distractors, ...shuffle(otherPhils).slice(0, remaining)];
    }

    const names = [correctName, ...distractors.map((p) => p.name)].map((n) => truncate(n));
    const shuffled = shuffle(names);
    return {
      choices: shuffled,
      correctIndex: shuffled.indexOf(truncate(correctName)),
    };
  }

  #generateTraditionChoices(quote) {
    const correctTrad = this.#quizTraditions.find((t) => t.id === quote.tradition_id);
    const correctName = correctTrad?.name || quote.tradition_id;
    const otherTraditions = this.#quizTraditions.filter((t) => t.id !== quote.tradition_id);
    const distractors = shuffle(otherTraditions).slice(0, 3).map((t) => truncate(t.name));

    const choices = [truncate(correctName), ...distractors];
    const shuffled = shuffle(choices);
    return {
      choices: shuffled,
      correctIndex: shuffled.indexOf(truncate(correctName)),
    };
  }

  #generateObjectionChallenge() {
    // Pick a philosopher and use their core_assumptions as the claim
    const eligible = this.#quizPhilosophers.filter((p) => p.core_assumptions);
    const phil = pickRandom(eligible);
    // Pick a specific assumption sentence for a focused claim
    const sentences = phil.core_assumptions.split('. ').filter((s) => s.length > 20);
    const claim = sentences.length > 0 ? pickRandom(sentences).trim() : phil.core_assumptions;

    return {
      _isObjection: true,
      _philosopherName: phil.name,
      _tradition: phil.tradition_id || '',
      _claim: claim.endsWith('.') ? claim : claim + '.',
      text: `${phil.name} claims:\n\n"${claim.endsWith('.') ? claim : claim + '."'}`,
    };
  }

  #generateReconstructChallenge() {
    const eligible = this.#quizPhilosophers.filter((p) => p.core_assumptions);
    const phil = pickRandom(eligible);

    // Extract the last sentence as the "conclusion" to reconstruct toward (Bug 2 fix)
    const sentences = phil.core_assumptions.split('. ').filter((s) => s.length > 15);
    const conclusion = sentences.length > 0
      ? (sentences[sentences.length - 1].trim().replace(/\.$/, '') + '.')
      : phil.core_assumptions;

    // Pick a key work for context
    const keyWork = phil.key_works?.length > 0 ? phil.key_works[0] : null;
    const workLine = keyWork ? `\n(from ${keyWork})` : '';

    return {
      _isReconstruct: true,
      _philosopherName: phil.name,
      _tradition: phil.tradition_id || '',
      _coreAssumptions: phil.core_assumptions || '',
      _keyWorks: (phil.key_works || []).join(', '),
      text: `${phil.name} concludes:\n\n"${conclusion}"${workLine}\n\nWhat is the argument for this? State the key premises.`,
    };
  }

  #generateDistinguishChallenge() {
    // Pick two philosophers from the same tradition
    const tradGroups = {};
    for (const p of this.#quizPhilosophers) {
      if (!p.core_assumptions) continue;
      const t = p.tradition_id || 'unknown';
      if (!tradGroups[t]) tradGroups[t] = [];
      tradGroups[t].push(p);
    }
    // Find traditions with 2+ philosophers
    const validTraditions = Object.entries(tradGroups).filter(([, ps]) => ps.length >= 2);
    if (validTraditions.length === 0) {
      // Fallback to any two
      const all = this.#quizPhilosophers.filter((p) => p.core_assumptions);
      if (all.length < 2) {
        return {
          _isDistinguish: true, _philosopherAName: 'Unknown', _philosopherBName: 'Unknown',
          _tradition: '', _philosopherAPosition: '', _philosopherBPosition: '',
          text: 'Not enough philosophers available for this challenge.',
        };
      }
      const pair = shuffle(all).slice(0, 2);
      return this.#buildDistinguishQuestion(pair[0], pair[1]);
    }
    const [, phils] = pickRandom(validTraditions);
    const pair = shuffle(phils).slice(0, 2);
    return this.#buildDistinguishQuestion(pair[0], pair[1]);
  }

  #buildDistinguishQuestion(philA, philB) {
    const tradObj = this.#quizTraditions.find((t) => t.id === philA.tradition_id);
    const tradName = tradObj?.name || philA.tradition_id || 'philosophy';
    return {
      _isDistinguish: true,
      _philosopherAName: philA.name,
      _philosopherBName: philB.name,
      _tradition: tradName,
      _philosopherAPosition: philA.core_assumptions || '',
      _philosopherBPosition: philB.core_assumptions || '',
      text: `${philA.name} and ${philB.name}\n(Both: ${tradName})`,
    };
  }

  #generateApplyChallenge() {
    // Show a quote from philosopher A, ask player to respond as philosopher B
    const quote = this.#pickQuestion();
    const sourcePhil = this.#quizPhilosophers.find((p) => p.id === quote.philosopher_id);
    // Pick a target philosopher from a different tradition
    const targetCandidates = this.#quizPhilosophers.filter(
      (p) => p.id !== quote.philosopher_id && p.core_assumptions,
    );
    if (targetCandidates.length === 0) {
      // Fallback: use any other philosopher
      const any = this.#quizPhilosophers.filter((p) => p.id !== quote.philosopher_id);
      const target = pickRandom(any);
      return this.#buildApplyQuestion(quote, sourcePhil, target);
    }
    const target = pickRandom(targetCandidates);
    return this.#buildApplyQuestion(quote, sourcePhil, target);
  }

  #buildApplyQuestion(quote, sourcePhil, targetPhil) {
    const sourceTrad = this.#quizTraditions.find((t) => t.id === (sourcePhil?.tradition_id || quote.tradition_id));
    const targetTrad = this.#quizTraditions.find((t) => t.id === targetPhil.tradition_id);

    return {
      _isApply: true,
      _philosopherAName: sourcePhil?.name || quote.philosopher_id,
      _traditionA: sourceTrad?.name || '',
      _quote: quote.text,
      _philosopherBName: targetPhil.name,
      _traditionB: targetTrad?.name || '',
      _philosopherBPosition: targetPhil.core_assumptions || '',
      text: `${sourcePhil?.name || quote.philosopher_id} says:\n\n"${quote.text}"\n\nHow would ${targetPhil.name} respond?`,
    };
  }

  // =========================================================================
  // Goon Reactions
  // =========================================================================

  #getGoonReaction(isCorrect) {
    const phil = this.#sceneData.philosopher;
    if (isCorrect) {
      const reactions = phil.correct_reactions || [];
      return reactions.length > 0 ? pickRandom(reactions) : 'Hmm. Not bad.';
    }
    const reactions = phil.wrong_reactions || [];
    return reactions.length > 0 ? pickRandom(reactions) : 'As I expected.';
  }

  // =========================================================================
  // Auto-scroll
  // =========================================================================

  #autoScrollDialogue() {
    const visibleHeight = this.#dialogueAreaBottom - this.#dialogueAreaTop;
    const textHeight = this.#dialogueText.height;
    if (textHeight > visibleHeight) {
      this.#dialogueText.y = this.#dialogueAreaBottom - textHeight;
    }
  }

  // =========================================================================
  // State Machine
  // =========================================================================

  #createStateMachine() {
    this.#stateMachine = new StateMachine('quiz-battle', this);

    // --- INTRO ---
    this.#stateMachine.addState({
      name: QUIZ_STATES.INTRO,
      onEnter: () => {
        // Animate monsters appearing
        this.#activeEnemyMonster.playMonsterAppearAnimation(() => {});
        this.#activeEnemyMonster.playMonsterHealthBarAppearAnimation(() => {});
        this.#activePlayerMonster.playMonsterAppearAnimation(() => {});
        this.#activePlayerMonster.playMonsterHealthBarAppearAnimation(() => {});

        const phil = this.#sceneData.philosopher;
        const introLine = phil.intro_lines
          ? pickRandom(phil.intro_lines)
          : `A wild ${phil.name} appears!`;

        this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
          [`${phil.name}: "${introLine}"`, `${MAX_ROUNDS} rounds. Get ready!`],
          () => {
            this.#stateMachine.setState(QUIZ_STATES.ROUND_SELECT);
          },
        );
      },
    });

    // --- ROUND_SELECT ---
    this.#stateMachine.addState({
      name: QUIZ_STATES.ROUND_SELECT,
      onEnter: () => {
        this.#round++;
        this.#roundCounter.setText(`${this.#round}/${MAX_ROUNDS}`);
        this.#currentChallengeType = this.#selectChallengeType();
        this.#stateMachine.setState(QUIZ_STATES.PRESENT_CHALLENGE);
      },
    });

    // --- PRESENT_CHALLENGE ---
    this.#stateMachine.addState({
      name: QUIZ_STATES.PRESENT_CHALLENGE,
      onEnter: () => {
        this._controls.lockInput = true;
        const challengeType = this.#currentChallengeType;
        const prompt = this.#getChallengePrompt(challengeType);

        if (MC_TYPES.has(challengeType)) {
          // MC modes: voice, tradition
          const quote = this.#pickQuestion();
          this.#currentQuestion = quote;

          this.#dialogueText.y = this.#dialogueAreaTop;
          this.#dialogueText.setText(`${prompt}\n\n"${quote.text}"`);
          this.#autoScrollDialogue();

          let choiceData;
          if (challengeType === 'voice') {
            choiceData = this.#generateVoiceChoices(quote);
          } else {
            choiceData = this.#generateTraditionChoices(quote);
          }

          this.#correctIndex = choiceData.correctIndex;
          this.#currentChoices = choiceData.choices;

          // Show choices in BattleMenu's attack sub-menu (Bug 1 fix — choices now on cream panel)
          this.#battleMenu.setAttackNames(choiceData.choices);
          this.#battleMenu.hideMainBattleMenu();
          this.#battleMenu.showMonsterAttackSubMenu();

          this.#questionStartTime = Date.now();
          this._controls.lockInput = false;
          this.#stateMachine.setState(QUIZ_STATES.PLAYER_INPUT);
        } else {
          // Free-text modes
          let question;
          let placeholder = 'Type your answer...';

          if (challengeType === 'objection') {
            question = this.#generateObjectionChallenge();
            placeholder = 'State your objection to this claim...';
          } else if (challengeType === 'reconstruct') {
            question = this.#generateReconstructChallenge();
            placeholder = 'Reconstruct the argument — premises, reasoning, conclusion...';
          } else if (challengeType === 'distinguish') {
            question = this.#generateDistinguishChallenge();
            placeholder = 'Explain how these two positions differ...';
          } else if (challengeType === 'apply') {
            question = this.#generateApplyChallenge();
            placeholder = 'Respond from their perspective...';
          }

          this.#currentQuestion = question;
          this.#dialogueText.y = this.#dialogueAreaTop;
          this.#dialogueText.setText(`${prompt}\n\n${question.text}`);
          this.#autoScrollDialogue();

          this.#battleMenu.updateInfoPaneMessageNoInputRequired('Type your answer below.');
          this.#showFreeTextInput(placeholder);
          this.#stateMachine.setState(QUIZ_STATES.PLAYER_INPUT);
        }
      },
    });

    // --- PLAYER_INPUT ---
    this.#stateMachine.addState({
      name: QUIZ_STATES.PLAYER_INPUT,
      onEnter: () => {
        // Input handled in update()
      },
    });

    // --- EVALUATE (MC modes) ---
    this.#stateMachine.addState({
      name: QUIZ_STATES.EVALUATE,
      onEnter: () => {
        this._controls.lockInput = true;
        const elapsed = Date.now() - this.#questionStartTime;
        const isCorrect = this.#selectedChoice === this.#correctIndex;
        const isFast = elapsed < FAST_THRESHOLD_MS;

        this.#prevGoonHp = this.#goonHp;
        this.#prevPlayerHp = this.#playerHp;
        this.#lastRoundCorrect = isCorrect;

        if (isCorrect) {
          const dmg = isFast ? DAMAGE.MC_CORRECT_FAST : DAMAGE.MC_CORRECT;
          this.#goonHp = Math.max(0, this.#goonHp - dmg);
          this.#lastFeedback = isFast ? 'CORRECT! (Fast bonus!)' : 'CORRECT!';
        } else {
          this.#playerHp = Math.max(0, this.#playerHp - DAMAGE.MC_WRONG_TO_PLAYER);
          const correctAnswer = this.#currentChoices[this.#correctIndex];
          this.#lastFeedback = `WRONG! The answer was: ${correctAnswer}`;
        }

        this.#battleMenu.hideMonsterAttackSubMenu();

        this.time.delayedCall(800, () => {
          this.#stateMachine.setState(QUIZ_STATES.DAMAGE_ANIM);
        });
      },
    });

    // --- DAMAGE_ANIM ---
    this.#stateMachine.addState({
      name: QUIZ_STATES.DAMAGE_ANIM,
      onEnter: () => {
        const goonDmg = this.#prevGoonHp - this.#goonHp;
        const playerDmg = this.#prevPlayerHp - this.#playerHp;

        if (goonDmg > 0) {
          this.#activeEnemyMonster.takeDamage(goonDmg, () => {});
          this.#activeEnemyMonster.playTakeDamageAnimation(() => {});
        }
        if (playerDmg > 0) {
          this.#activePlayerMonster.takeDamage(playerDmg, () => {});
          this.#activePlayerMonster.playTakeDamageAnimation(() => {});
        }
        if (goonDmg >= 20 || playerDmg >= 20) {
          this.cameras.main.shake(300, 0.01);
        }

        this.time.delayedCall(800, () => {
          this.#stateMachine.setState(QUIZ_STATES.GOON_REACT);
        });
      },
    });

    // --- GOON_REACT ---
    this.#stateMachine.addState({
      name: QUIZ_STATES.GOON_REACT,
      onEnter: () => {
        const reaction = this.#getGoonReaction(this.#lastRoundCorrect);
        const phil = this.#sceneData.philosopher;

        // Show long feedback in the scrollable dialogue area
        if (this.#lastFeedback) {
          this.#dialogueText.y = this.#dialogueAreaTop;
          this.#dialogueText.setText(this.#lastFeedback);
          this.#autoScrollDialogue();
        }

        this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
          [`${phil.name}: "${reaction}"`],
          () => {
            this.#dialogueText.setText('');
            this.#stateMachine.setState(QUIZ_STATES.POST_ROUND_CHECK);
          },
        );
        // Unlock input so SPACE can advance the info pane message queue
        this._controls.lockInput = false;
      },
    });

    // --- POST_ROUND_CHECK ---
    this.#stateMachine.addState({
      name: QUIZ_STATES.POST_ROUND_CHECK,
      onEnter: () => {
        if (this.#goonHp <= 0 || this.#playerHp <= 0 || this.#round >= MAX_ROUNDS) {
          this.#stateMachine.setState(QUIZ_STATES.RESOLVE);
          return;
        }
        this.#stateMachine.setState(QUIZ_STATES.ROUND_SELECT);
      },
    });

    // --- RESOLVE ---
    this.#stateMachine.addState({
      name: QUIZ_STATES.RESOLVE,
      onEnter: () => {
        this._controls.lockInput = true;
        const phil = this.#sceneData.philosopher;
        const level = phil.level || 1;

        let result = 'draw';
        let resultText = '';
        let xp = 0;

        if (this.#goonHp <= 0) {
          result = 'win';
          resultText = `VICTORY! ${phil.name} is defeated!\n\n"${phil.defeat_text || 'Well studied!'}"`;
          xp = 15 * level;
        } else if (this.#playerHp <= 0) {
          result = 'loss';
          resultText = `DEFEAT! Your knowledge faltered.\n\n"${phil.victory_text || 'Study harder!'}"`;
          xp = 3 * level;
        } else {
          resultText = 'DRAW! Time is up. Partial knowledge demonstrated.';
          xp = 8 * level;
        }

        // Apply XP
        const xpResult = dataManager.addPlayerXp(xp);
        resultText += `\n\nXP gained: ${xp}`;
        if (xpResult.leveledUp) {
          resultText += ` | LEVEL UP! Level ${xpResult.newLevel}!`;
        }

        // Record result
        dataManager.recordDebateResult(phil.id, result, 0);

        this.#dialogueText.y = this.#dialogueAreaTop;
        this.#dialogueText.setText(resultText);
        this.#autoScrollDialogue();

        this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
          ['Press SPACE to return to the world.'],
          () => {
            this.#stateMachine.setState(QUIZ_STATES.FINISHED);
          },
        );
        this._controls.lockInput = false;
      },
    });

    // --- FINISHED ---
    this.#stateMachine.addState({
      name: QUIZ_STATES.FINISHED,
      onEnter: () => {
        this.#hideFreeTextInput();
        dataManager.saveData();
        dataManager.saveToServer();

        this.cameras.main.fadeOut(600, 0, 0, 0);
        this.cameras.main.once(
          Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
          () => {
            this.scene.start(SCENE_KEYS.WORLD_SCENE);
          },
        );
      },
    });

    // Kick off
    this.#stateMachine.setState(QUIZ_STATES.INTRO);
  }
}
