import Phaser from '../lib/phaser.js';
import { SCENE_KEYS } from './scene-keys.js';
import { StateMachine } from '../utils/state-machine.js';
import { BaseScene } from './base-scene.js';
import { DIRECTION } from '../common/direction.js';
import { startBattle, streamBattleMove } from '../services/api-client.js';
import { dataManager, DATA_MANAGER_STORE_KEYS } from '../utils/data-manager.js';
import { BattleMenu } from '../battle/ui/menu/battle-menu.js';
import { EnemyBattleMonster } from '../battle/monsters/enemy-battle-monster.js';
import { PlayerBattleMonster } from '../battle/monsters/player-battle-monster.js';
import { Background } from '../battle/background.js';
import { Ball } from '../battle/ball.js';
import { NineSlice } from '../utils/nine-slice.js';
import { calculateMonsterCaptureResults } from '../utils/catch-utils.js';
import {
  BATTLE_ASSET_KEYS,
  CHARACTER_ASSET_KEYS,
  UI_ASSET_KEYS,
  INVENTORY_ASSET_KEYS,
} from '../assets/asset-keys.js';
import { KENNEY_FUTURE_NARROW_FONT_NAME } from '../assets/font-keys.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBATE_STATES = Object.freeze({
  INTRO: 'INTRO',
  PRE_DEBATE_INFO: 'PRE_DEBATE_INFO',
  BRING_OUT_PLAYER: 'BRING_OUT_PLAYER',
  PHILOSOPHER_OPENS: 'PHILOSOPHER_OPENS',
  PLAYER_INPUT: 'PLAYER_INPUT',
  TEXT_INPUT: 'TEXT_INPUT',
  PHILOSOPHER_ALLY_ARGUES: 'PHILOSOPHER_ALLY_ARGUES',
  PHILOSOPHER_RESPONDS: 'PHILOSOPHER_RESPONDS',
  DAMAGE_ANIM: 'DAMAGE_ANIM',
  POST_EXCHANGE_CHECK: 'POST_EXCHANGE_CHECK',
  FLEE_ATTEMPT: 'FLEE_ATTEMPT',
  CAPTURE_ATTEMPT: 'CAPTURE_ATTEMPT',
  CAUGHT_PHILOSOPHER: 'CAUGHT_PHILOSOPHER',
  SWITCH_PHILOSOPHER: 'SWITCH_PHILOSOPHER',
  RECONSTRUCT: 'RECONSTRUCT',
  AGREE: 'AGREE',
  RESOLVE: 'RESOLVE',
  FINISHED: 'FINISHED',
});

const MOVE_TYPES = [
  {
    id: 'counterexample',
    name: 'Counterexample',
    desc: 'Present a case that challenges their claim',
    templates: [
      'Consider this case: [describe scenario]. Your position implies [consequence], but surely that is wrong because [reason].',
      'Your principle fails in cases like [example]. If we accept your view, then we must also accept [absurd result].',
      'Here is a case that your theory cannot handle: [case]. This shows that [conclusion].',
    ],
  },
  {
    id: 'reductio',
    name: 'Reductio',
    desc: 'Accept premise, show absurd conclusion',
    templates: [
      'Let us grant your premise that [premise]. But if this is true, then it follows that [consequence]. Since [consequence] is clearly unacceptable, your premise must be false.',
      'Suppose for the sake of argument that [position] is correct. Then we would have to conclude that [absurd implication], which contradicts [basic principle].',
      'If your argument is sound, then by the same logic we must accept that [parallel case]. But no one would accept that, so something has gone wrong in your reasoning.',
    ],
  },
  {
    id: 'socratic_questioning',
    name: 'Socratic Q.',
    desc: 'Force them to confront internal tension',
    templates: [
      'You say [claim A], but you also hold that [claim B]. How do you reconcile these two commitments?',
      'What exactly do you mean by [key term]? When you say [term], do you mean [interpretation 1] or [interpretation 2]? Either way seems problematic.',
      'How would you respond to someone who accepts your premises but denies your conclusion? What step in the argument are they getting wrong?',
    ],
  },
  {
    id: 'framework_shift',
    name: 'Frmwk Shift',
    desc: 'Critique from a different tradition',
    templates: [
      'From a [tradition] perspective, your position overlooks [key consideration]. A [tradition] thinker would argue that [alternative view].',
      'Your argument assumes [framework assumption]. But if we adopt a [different framework] instead, we see that [alternative conclusion].',
      'The [tradition] tradition would challenge your starting point. Rather than [their approach], we should ask [different question].',
    ],
  },
];

const FREE_FORM_MOVE = {
  id: 'free_form',
  name: 'Free Form',
  desc: 'Write any response you want',
  templates: ['[Write your own argument or response here]'],
};

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Convert philosopher game-data into a monster-shaped object the battle UI can consume.
 * @param {object} philosopher
 * @returns {object}
 */
function philosopherToMonster(philosopher) {
  return {
    id: `phil_${philosopher.id}`,
    monsterId: 900,
    name: philosopher.name,
    assetKey: CHARACTER_ASSET_KEYS.NPC,
    assetFrame: philosopher.npcFrame || 0,
    currentLevel: philosopher.level || 1,
    maxHp: philosopher.hp || 100,
    currentHp: philosopher.hp || 100,
    baseAttack: (philosopher.level || 1) * 3,
    attackIds: [],
    currentAttack: (philosopher.level || 1) * 3,
    baseExp: (philosopher.level || 1) * 10,
    currentExp: 0,
    isPhilosopher: true,
    philosopherId: philosopher.id,
    tradition: philosopher.tradition,
  };
}

/**
 * Build a monster-shaped object for the player (student).
 * @returns {object}
 */
function playerToMonster() {
  const level = dataManager.getPlayerLevel();
  return {
    id: 'student_0',
    monsterId: 999,
    name: 'STUDENT',
    assetKey: BATTLE_ASSET_KEYS.TRAINER_YOUTH_BOY,
    assetFrame: 0,
    currentLevel: level,
    maxHp: 100,
    currentHp: 100,
    baseAttack: 10,
    attackIds: [],
    currentAttack: 10,
    baseExp: 0,
    currentExp: 0,
  };
}

// ---------------------------------------------------------------------------
// JSDoc typedef
// ---------------------------------------------------------------------------

/**
 * @typedef DebateSceneData
 * @type {object}
 * @property {object} philosopher
 * @property {string} philosopher.id
 * @property {string} philosopher.name
 * @property {string} philosopher.tradition
 * @property {number} philosopher.level
 * @property {number} philosopher.hp
 * @property {string} philosopher.thinking_text
 * @property {object} philosopher.signature_attack
 * @property {string} philosopher.defeat_text
 * @property {string} philosopher.victory_text
 * @property {string[]} [philosopher.signature_moves]
 * @property {string} [philosopher.core_assumptions]
 * @property {string} [philosopher.role]
 * @property {number} [npcFrame]
 * @property {number} [npcId]
 * @property {boolean} [isWild]
 */

// ---------------------------------------------------------------------------
// DebateScene
// ---------------------------------------------------------------------------

export class DebateScene extends BaseScene {
  /** @type {StateMachine} */
  #stateMachine;
  /** @type {DebateSceneData} */
  #sceneData;
  /** @type {string} */
  #battleId;
  /** @type {number} */
  #playerHp;
  /** @type {number} */
  #philosopherHp;
  /** @type {number} */
  #maxPlayerHp;
  /** @type {number} */
  #maxPhilosopherHp;
  /** @type {number} */
  #selectedMoveIndex;
  /** @type {string} */
  #selectedMoveType;
  /** @type {string} */
  #playerArgument;
  /** @type {number} */
  #exchanges;
  /** @type {number} */
  #maxExchanges;
  /** @type {BattleMenu} */
  #battleMenu;
  /** @type {EnemyBattleMonster} */
  #activeEnemyMonster;
  /** @type {PlayerBattleMonster} */
  #activePlayerMonster;
  /** @type {Background} */
  #background;
  /** @type {Ball} */
  #ball;
  /** @type {Phaser.GameObjects.Text} */
  #dialogueText;
  /** @type {Phaser.GameObjects.Rectangle} */
  #dialogueBg;
  /** @type {Phaser.GameObjects.Text} */
  #statusText;
  /** @type {Phaser.GameObjects.Text} */
  #exchangeCounter;
  /** @type {HTMLTextAreaElement | null} */
  #textInput;
  /** @type {HTMLButtonElement | null} */
  #submitButton;
  /** @type {HTMLDivElement | null} */
  #templateContainer;
  /** @type {Phaser.Input.Keyboard.Key | undefined} */
  #escKey;
  /** @type {boolean} */
  #pauseMenuVisible;
  /** @type {Phaser.GameObjects.Container | null} */
  #pauseMenu;
  /** @type {number} */
  #pauseMenuSelection;
  /** @type {string} */
  #streamBuffer;
  /** @type {Phaser.Time.TimerEvent | null} */
  #streamTimer;
  /** @type {boolean} */
  #streamComplete;
  /** @type {number} */
  #dialogueAreaTop;
  /** @type {number} */
  #dialogueAreaBottom;
  /** @type {Phaser.GameObjects.Container | null} */
  #bagOverlay;
  /** @type {number} */
  #bagTab;
  /** @type {number} */
  #bagScrollIndex;
  /** @type {NineSlice} */
  #nineSlice;
  /** @type {Phaser.GameObjects.Image | null} */
  #bagCursor;
  /** @type {boolean} */
  #callbackHandled;
  /** @type {object | null} */
  #activeAllyPhilosopher;
  /** @type {object} */
  #studentMonsterData;
  /** @type {object | null} */
  #battleReward;
  /** @type {object|null} */
  #pendingJudgeData;
  /** @type {object|null} */
  #pendingPlayerJudgeData;
  /** @type {object|null} */
  #pendingCounterJudgeData;
  /** @type {number} */
  #prevPhilHp;
  /** @type {number} */
  #prevPlayerHp;
  /** @type {object|null} */
  #pendingSwitchPhilosopher;
  /** @type {object|null} */
  #activeOpening;
  /** @type {HTMLDivElement|null} */
  #judgeOverlay;
  /** @type {Function|null} */
  #judgeOverlayKeyHandler;
  /** @type {object[]|null} */
  #pendingMoveSuggestions;
  /** @type {object[]} */
  #currentMoveOptions;
  /** @type {string|null} Pre-fill text for TEXT_INPUT when using a toolkit item */
  #toolkitPrefill;
  /** @type {Array<{speaker: string, label: string, text: string}>} full battle transcript (cleared per battle) */
  #transcript;
  /** @type {{label: string, text: string}|null} live transcript entry the philosopher stream appends into */
  #transcriptPhilEntry;
  /** @type {HTMLDivElement|null} transcript DOM overlay */
  #transcriptOverlay;
  /** @type {Function|null} transcript overlay key handler (capture-phase) */
  #transcriptKeyHandler;
  /** @type {Element|null} element focused before the transcript opened (restored on close) */
  #transcriptPrevFocus;
  /** @type {Phaser.GameObjects.Text|null} the "TRANSCRIPT [T]" affordance */
  #transcriptButton;
  /** @type {Phaser.Input.Keyboard.Key|undefined} */
  #transcriptKey;
  /** @type {boolean} guard: toolkit/ally "[Press SPACE to continue]" gate is pending — the buffered stream belongs to the not-yet-revealed philosopher response, so the SPACE flush must not consume it */
  #deployGatePending;

  constructor() {
    super({ key: SCENE_KEYS.DEBATE_SCENE });
  }

  /**
   * TEST HOOK (read-only): snapshot of debate state + the player-visible text
   * objects, used by the E2E suite to assert on what is actually rendered.
   * Not used by game code.
   * @returns {object}
   */
  get testSnapshot() {
    return {
      state: this.#stateMachine ? this.#stateMachine.currentStateName : null,
      dialogue: this.#dialogueText ? this.#dialogueText.text : '',
      status: this.#statusText ? this.#statusText.text : '',
      statusVisible: this.#statusText ? this.#statusText.alpha > 0 : false,
      infoPane: this.#battleMenu ? this.#battleMenu.infoPaneText : '',
      streamBufferLen: this.#streamBuffer ? this.#streamBuffer.length : 0,
      inputLocked: this._controls ? this._controls.isInputLocked : null,
      exchanges: this.#exchanges,
      bagOpen: !!this.#bagOverlay,
      bagTab: this.#bagTab,
      bagIndex: this.#bagScrollIndex,
      bagTabs: this.#bagOverlay
        ? (this.#bagOverlay.getData('tabTexts') || []).map((t) => ({
            label: t.text,
            active: !!t.getData('active'),
          }))
        : [],
      transcript: this.#transcript ? this.#transcript.map((e) => ({ label: e.label, text: e.text })) : [],
    };
  }

  /**
   * @param {DebateSceneData} data
   */
  init(data) {
    super.init(data);
    this.#sceneData = data;
    this.#maxPlayerHp = 100;
    this.#maxPhilosopherHp = data.philosopher?.hp || 100;
    this.#playerHp = this.#maxPlayerHp;
    this.#philosopherHp = this.#maxPhilosopherHp;
    this.#selectedMoveIndex = 0;
    this.#selectedMoveType = '';
    this.#playerArgument = '';
    this.#exchanges = 0;
    this.#maxExchanges = data.philosopher?.role === 'goon' ? 3 : 5;
    this.#textInput = null;
    this.#submitButton = null;
    this.#templateContainer = null;
    this.#streamBuffer = '';
    this.#streamTimer = null;
    this.#streamComplete = false;
    this.#dialogueAreaTop = 0;
    this.#dialogueAreaBottom = 0;
    this.#pauseMenuVisible = false;
    this.#pauseMenu = null;
    this.#pauseMenuSelection = 0;
    this.#bagOverlay = null;
    this.#bagTab = 0;
    this.#bagScrollIndex = 0;
    this.#bagCursor = null;
    this.#callbackHandled = false;
    this.#activeAllyPhilosopher = null;
    this.#pendingSwitchPhilosopher = null;
    this.#activeOpening = null;
    this.#battleReward = null;
    this.#pendingJudgeData = null;
    this.#pendingPlayerJudgeData = null;
    this.#pendingCounterJudgeData = null;
    this.#judgeOverlay = null;
    this.#judgeOverlayKeyHandler = null;
    this.#pendingMoveSuggestions = null;
    this.#currentMoveOptions = MOVE_TYPES;
    this.#toolkitPrefill = null;
    this.#transcript = [];
    this.#transcriptPhilEntry = null;
    this.#transcriptOverlay = null;
    this.#transcriptKeyHandler = null;
    this.#transcriptPrevFocus = null;
    this.#transcriptButton = null;
    this.#deployGatePending = false;
    this.#prevPhilHp = this.#maxPhilosopherHp;
    this.#prevPlayerHp = this.#maxPlayerHp;
    this.#nineSlice = new NineSlice({
      cornerCutSize: 6,
      textureManager: this.sys.textures,
      assetKeys: [UI_ASSET_KEYS.MENU_BACKGROUND],
    });
  }

  create() {
    super.create();
    this._pauseEnabled = false;

    // --- Keyboard ---
    this.#escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    // T toggles the transcript overlay. No key capture: while the argument
    // textarea has focus its stopPropagation keeps Phaser (and this key) from
    // seeing keystrokes, so typing the letter T still works.
    this.#transcriptKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.T, false);

    // --- Background ---
    this.#background = new Background(this);
    this.#background.showForest();

    // --- Enemy (philosopher) monster ---
    const enemyMonsterData = philosopherToMonster(this.#sceneData.philosopher);
    this.#activeEnemyMonster = new EnemyBattleMonster({
      scene: this,
      monsterDetails: enemyMonsterData,
      skipBattleAnimations: false,
    });
    this.#activeEnemyMonster._phaserGameObject.setScale(4);
    this.#activeEnemyMonster._phaserGameObject.setAlpha(0);

    // --- Player monster ---
    this.#studentMonsterData = playerToMonster();
    this.#activePlayerMonster = new PlayerBattleMonster({
      scene: this,
      monsterDetails: this.#studentMonsterData,
      skipBattleAnimations: false,
    });
    this.#activePlayerMonster._phaserGameObject.setAlpha(0);

    // --- Dialogue area (mid-screen, masked, scrollable) ---
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
      .setStrokeStyle(2, 0x533483);

    this.#dialogueText = this.add
      .text(40, this.#dialogueAreaTop, '', {
        fontSize: '16px',
        fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
        color: '#e0e0e0',
        wordWrap: { width: this.scale.width - 80 },
        lineSpacing: 5,
      })
      .setOrigin(0, 0);

    // Geometry mask so text stays within the dialogue box
    const maskGfx = this.make.graphics({ add: false });
    maskGfx.fillRect(20, dialogBoxTop, this.scale.width - 40, dialogBoxHeight);
    this.#dialogueText.setMask(new Phaser.Display.Masks.GeometryMask(this, maskGfx));

    // Mouse-wheel scrolling for the dialogue text
    this.input.on('wheel', (pointer, gos, dx, dy) => {
      const vis = this.#dialogueAreaBottom - this.#dialogueAreaTop;
      const h = this.#dialogueText.height;
      if (h <= vis) return;
      const ny = this.#dialogueText.y + (dy > 0 ? -10 : 10);
      this.#dialogueText.y = Math.max(this.#dialogueAreaBottom - h, Math.min(this.#dialogueAreaTop, ny));
    });

    // Depth ordering: dialogue above background but below bottom panel
    this.#dialogueBg.setDepth(5);
    this.#dialogueText.setDepth(6);

    // --- Exchange counter (top-right) ---
    this.#exchangeCounter = this.add
      .text(this.scale.width - 20, 8, '0/5', {
        fontSize: '20px',
        fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
        color: '#555',
      })
      .setOrigin(1, 0);

    // --- Status text (centered, for thinking / judging indicators) ---
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

    // --- Transcript affordance (top-left, always available during battle) ---
    this.#transcriptButton = this.add
      .text(20, 8, 'TRANSCRIPT [T]', {
        fontSize: '14px',
        fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
        color: '#c792ea',
        backgroundColor: 'rgba(15, 52, 96, 0.85)',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0, 0)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    this.#transcriptButton.on('pointerdown', () => {
      this.#toggleTranscriptOverlay();
    });

    // --- Battle menu (bottom panel) ---
    this.#battleMenu = new BattleMenu(this, this.#activePlayerMonster, false, false, {
      labels: { fight: 'ARGUE', switch: 'RECONSTRUCT', item: 'BAG', flee: 'FLEE' },
      attackTextStyle: { fontSize: '20px' },
      attackColumnX: 480,
      onSwitchSelected: () => {
        this.#callbackHandled = true;
        this.#battleMenu.hideMainBattleMenu();
        this.#stateMachine.setState(DEBATE_STATES.RECONSTRUCT);
      },
      onItemSelected: () => {
        this.#callbackHandled = true;
        this.#showBagOverlay();
      },
      infoLine1: 'Choose your',
      infoLine2: 'move.',
    });
    this.#battleMenu.setAttackNames(MOVE_TYPES.map((m) => m.name));

    // --- Ball (for capture animations) ---
    this.#ball = new Ball({
      scene: this,
      assetKey: BATTLE_ASSET_KEYS.DAMAGED_BALL,
      assetFrame: 0,
      skipBattleAnimations: false,
      scale: 0.1,
    });

    // --- Pause menu & state machine ---
    this.#createPauseMenu();
    this.#createStateMachine();
  }

  update() {
    super.update();

    // --- T: toggle the transcript overlay (read-only; works even while text
    // streams). Skipped while a DOM field has focus (typing a "t") or the
    // pause menu is up. While the overlay is open its capture-phase key
    // handler stops events before Phaser sees them, so closing is handled
    // there, not here.
    if (this.#transcriptKey && Phaser.Input.Keyboard.JustDown(this.#transcriptKey)) {
      const ae = document.activeElement;
      const typing = !!ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT');
      if (!typing && !this.#pauseMenuVisible && !this.#transcriptOverlay) {
        this.#toggleTranscriptOverlay();
        return;
      }
    }

    // --- ESC handling (layered: pause > bag > battle-menu cancel > open pause) ---
    if (this.#escKey && Phaser.Input.Keyboard.JustDown(this.#escKey)) {
      if (this.#pauseMenuVisible) {
        this.#hidePauseMenu();
        return;
      }
      if (this.#judgeOverlay) {
        this.#hideJudgeOverlay();
        this.#stateMachine.setState(DEBATE_STATES.POST_EXCHANGE_CHECK);
        return;
      }
      if (this.#bagOverlay) {
        this.#closeBagOverlay();
        return;
      }
      if (this.#stateMachine.currentStateName === DEBATE_STATES.PLAYER_INPUT) {
        // If attack submenu is showing, CANCEL returns to main menu
        this.#battleMenu.handlePlayerInput('CANCEL');
        return;
      }
      if (this.#stateMachine.currentStateName !== DEBATE_STATES.FINISHED) {
        this.#showPauseMenu();
      }
      return;
    }

    // --- Pause menu navigation ---
    if (this.#pauseMenuVisible) {
      const dir = this._controls.getDirectionKeyJustPressed();
      if (dir === DIRECTION.UP && this.#pauseMenuSelection > 0) {
        this.#pauseMenuSelection--;
        this.#updatePauseMenuSelection();
      } else if (dir === DIRECTION.DOWN && this.#pauseMenuSelection < 3) {
        this.#pauseMenuSelection++;
        this.#updatePauseMenuSelection();
      }
      if (this._controls.wasSpaceKeyPressed()) {
        this.#handlePauseMenuAction();
      }
      return;
    }

    // --- Bag overlay input ---
    if (this.#bagOverlay) {
      this.#handleBagInput();
      return;
    }

    // --- State machine tick ---
    this.#stateMachine.update();
    if (this._controls.isInputLocked) return;

    const currentState = this.#stateMachine.currentStateName;

    // --- PLAYER_INPUT: route directional / action keys to BattleMenu ---
    if (currentState === DEBATE_STATES.PLAYER_INPUT) {
      const dir = this._controls.getDirectionKeyJustPressed();
      if (dir !== DIRECTION.NONE) {
        this.#battleMenu.handlePlayerInput(dir);
      }
      if (this._controls.wasBackKeyPressed()) {
        this.#battleMenu.handlePlayerInput('CANCEL');
        return;
      }
      if (this._controls.wasSpaceKeyPressed()) {
        this.#callbackHandled = false;
        this.#battleMenu.handlePlayerInput('OK');
        if (this.#callbackHandled) return;

        if (this.#battleMenu.selectedAttack !== undefined) {
          this.#selectedMoveIndex = this.#battleMenu.selectedAttack;
          this.#selectedMoveType = this.#currentMoveOptions[this.#selectedMoveIndex].id;
          this.#battleMenu.hideMonsterAttackSubMenu();
          if (this.#activeAllyPhilosopher) {
            this.#stateMachine.setState(DEBATE_STATES.PHILOSOPHER_ALLY_ARGUES);
          } else {
            this.#stateMachine.setState(DEBATE_STATES.TEXT_INPUT);
          }
          return;
        }
        if (this.#battleMenu.isAttemptingToFlee) {
          this.#battleMenu.hideMainBattleMenu();
          this.#stateMachine.setState(DEBATE_STATES.FLEE_ATTEMPT);
          return;
        }
      }
      return;
    }

    // --- SPACE: flush streaming text AND advance queued BattleMenu messages ---
    if (this._controls.wasSpaceKeyPressed()) {
      if (
        currentState === DEBATE_STATES.PHILOSOPHER_OPENS ||
        currentState === DEBATE_STATES.PHILOSOPHER_RESPONDS ||
        currentState === DEBATE_STATES.PHILOSOPHER_ALLY_ARGUES
      ) {
        // While a toolkit/ally "[Press SPACE to continue]" gate is pending, the
        // buffered stream is the philosopher's NOT-YET-REVEALED response. Do not
        // flush it here: this same keypress also advances the gate (OK below),
        // whose callback clears the dialogue — flushing first rendered the
        // response and then instantly erased it (blank-dialogue bug).
        if (this.#streamBuffer.length > 0 && !this.#deployGatePending) {
          this.#flushStreamBuffer();
        }
      }
      // Always route to BattleMenu — needed for AGREE, RESOLVE, DAMAGE_ANIM,
      // CAUGHT_PHILOSOPHER, and any other state that uses
      // updateInfoPaneMessagesAndWaitForInput
      this.#battleMenu.handlePlayerInput('OK');
    }
  }

  /**
   * Build the 17-state debate state machine and kick off the INTRO state.
   */
  #createStateMachine() {
    this.#stateMachine = new StateMachine('debate', this);

    // --- INTRO ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.INTRO,
      onEnter: async () => {
        this._controls.lockInput = true;

        try {
          const result = await startBattle(
            this.#sceneData.philosopher.id,
            this.#sceneData.philosopher,
            'default',
          );
          this.#battleId = result.battleId;
          this.#maxExchanges = result.battle?.maxExchanges ?? this.#maxExchanges;
          this.#stateMachine.setState(DEBATE_STATES.PRE_DEBATE_INFO);
        } catch (err) {
          console.error('[DebateScene:INTRO] startBattle failed:', err);
          this._controls.lockInput = false;
          this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
            [`Error connecting to server: ${err.message}`, 'Press SPACE to exit.'],
            () => {
              this.#stateMachine.setState(DEBATE_STATES.FINISHED);
            },
          );
        }
      },
    });

    // --- PRE_DEBATE_INFO ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.PRE_DEBATE_INFO,
      onEnter: () => {
        this._controls.lockInput = true;
        const phil = this.#sceneData.philosopher;

        this.#activeEnemyMonster.playMonsterAppearAnimation(() => {
          this.#activeEnemyMonster.playMonsterHealthBarAppearAnimation(() => {
            // Health bar visible
          });

          this.#battleMenu.updateInfoPaneMessageNoInputRequired(
            `${phil.name} challenges you!`,
            () => {
              this.time.delayedCall(1500, () => {
                this.#stateMachine.setState(DEBATE_STATES.BRING_OUT_PLAYER);
              });
            },
          );
        });
      },
    });

    // --- BRING_OUT_PLAYER ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.BRING_OUT_PLAYER,
      onEnter: () => {
        this._controls.lockInput = true;

        this.#activePlayerMonster.playMonsterAppearAnimation(() => {
          this.#activePlayerMonster.playMonsterHealthBarAppearAnimation(() => {
            // Health bar visible
          });

          this.#battleMenu.updateInfoPaneMessageNoInputRequired(
            'Prepare your arguments!',
            () => {
              this.time.delayedCall(1500, () => {
                this.#stateMachine.setState(DEBATE_STATES.PHILOSOPHER_OPENS);
              });
            },
          );
        });
      },
    });

    // --- PHILOSOPHER_OPENS ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.PHILOSOPHER_OPENS,
      onEnter: () => {
        this._controls.lockInput = true;
        const phil = this.#sceneData.philosopher;

        // Check for curated opening statements
        if (phil.opening_statements && phil.opening_statements.length > 0) {
          const opening = phil.opening_statements[
            Math.floor(Math.random() * phil.opening_statements.length)
          ];
          this.#activeOpening = opening;

          // Local typewriter — no LLM call
          this.#beginStreamText();
          this.#appendStreamText(`${phil.name}: ${opening.text}`);
          this.#endStream();
          this.#transcriptAdd('phil', phil.name, `(opening) ${opening.text}`);

          // Wait for typewriter buffer to drain, then advance
          const waitForBuffer = this.time.addEvent({
            delay: 100,
            callback: () => {
              if (this.#streamBuffer.length === 0) {
                waitForBuffer.destroy();
                this.time.delayedCall(1000, () => {
                  this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
                });
              }
            },
            loop: true,
          });
          return;
        }

        // No curated opening — fall back to LLM generation
        this.#activeOpening = null;

        this.#statusText
          .setText(phil.thinking_text || `${phil.name} gathers their thoughts...`)
          .setAlpha(1);

        this.#beginStreamText();
        this.#transcriptPhilEntry = null;

        streamBattleMove(
          {
            battleId: this.#battleId,
            philosopherId: phil.id,
            moveType: 'opening',
            argument: 'Begin the debate. Present your core philosophical position.',
          },
          {
            onText: (chunk) => {
              this.#statusText.setAlpha(0);
              this.#appendStreamText(chunk);
              this.#transcriptStreamChunk(phil.name, chunk);
            },
            onJudging: () => {
              // No judging on opening
            },
            onResult: (data) => {
              if (data.battle) {
                this.#prevPhilHp = this.#philosopherHp;
                this.#prevPlayerHp = this.#playerHp;
                this.#playerHp = data.battle.playerHp;
                this.#philosopherHp = data.battle.philosopherHp;
                this.#exchanges = data.battle.exchanges;
                // Sync HP bars (opening should return unchanged HP, but sync defensively)
                const philDelta = this.#prevPhilHp - this.#philosopherHp;
                if (philDelta > 0) {
                  this.#activeEnemyMonster.takeDamage(philDelta);
                }
                this.#activePlayerMonster.updateMonsterHealth(this.#playerHp);
              }
            },
            onBattleEnd: () => {
              // No-op for opening
            },
            onDone: () => {
              this.#statusText.setAlpha(0);
              this.#endStream();
              this.#transcriptPhilEntry = null;
              // Wait for the typewriter buffer to drain
              const waitForBuffer = this.time.addEvent({
                delay: 100,
                callback: () => {
                  if (this.#streamBuffer.length === 0) {
                    waitForBuffer.destroy();
                    this.time.delayedCall(1000, () => {
                      this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
                    });
                  }
                },
                loop: true,
              });
            },
            onError: (err) => {
              this.#statusText.setAlpha(0);
              this.#flushStreamBuffer();
              const phil2 = this.#sceneData.philosopher;
              const fallback = `${phil2.name}: Let us examine this matter carefully. ${
                phil2.core_assumptions
                  ? phil2.core_assumptions.substring(0, 200) + '...'
                  : 'My position is well-founded.'
              }`;
              this.#dialogueText.setText(fallback);
              this.#dialogueText.y = this.#dialogueAreaTop;
              this.#autoScrollDialogue();
              this.time.delayedCall(2000, () => {
                this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
              });
            },
          },
        );
      },
    });

    // --- PLAYER_INPUT ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.PLAYER_INPUT,
      onEnter: () => {
        this._controls.lockInput = false;

        // Build dynamic 4-option list: Free Form + 3 suggestions, or fallback to static + Free Form
        if (this.#pendingMoveSuggestions && this.#pendingMoveSuggestions.length >= 3) {
          this.#currentMoveOptions = [FREE_FORM_MOVE, ...this.#pendingMoveSuggestions.slice(0, 3)];
        } else {
          this.#currentMoveOptions = [...MOVE_TYPES.slice(0, 3), FREE_FORM_MOVE];
        }
        this.#pendingMoveSuggestions = null;
        this.#battleMenu.setAttackNames(this.#currentMoveOptions.map((m) => m.name));

        this.#battleMenu.showMainBattleMenu();
        this.#exchangeCounter.setText(`${this.#exchanges}/${this.#maxExchanges}`);
      },
    });

    // --- TEXT_INPUT ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.TEXT_INPUT,
      onEnter: () => {
        this._controls.lockInput = true;
        this.#battleMenu.hideMainBattleMenu();
        this.#battleMenu.hideMonsterAttackSubMenu();
        this.#battleMenu.updateInfoPaneMessageNoInputRequired(
          `Selected: ${this.#currentMoveOptions[this.#selectedMoveIndex].name}. Type your argument below.`,
        );
        this.#showTextInput();
      },
    });

    // --- PHILOSOPHER_ALLY_ARGUES ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.PHILOSOPHER_ALLY_ARGUES,
      onEnter: () => {
        this._controls.lockInput = true;
        this.#battleMenu.hideMainBattleMenu();
        this.#battleMenu.hideMonsterAttackSubMenu();
        const phil = this.#sceneData.philosopher;
        const allyPhil = this.#activeAllyPhilosopher;

        this.#statusText
          .setText(
            `${allyPhil.name} formulates a ${this.#currentMoveOptions[this.#selectedMoveIndex]?.name || this.#selectedMoveType}...`,
          )
          .setAlpha(1);

        // Clear the panel but do NOT start a reveal timer: the timer is created
        // by the deploy gate's SPACE callback. Starting one here drained the
        // philosopher's streamed response into the panel while the ally's
        // generated argument was still on screen (mangled display) and let the
        // battle advance past the un-pressed gate, stranding a stale info-pane
        // entry whose callback later cleared the dialogue and locked input.
        this.#streamBuffer = '';
        this.#streamComplete = false;
        if (this.#streamTimer && !this.#streamTimer.destroyed) {
          this.#streamTimer.destroy();
          this.#streamTimer = null;
        }
        this.#dialogueText.setText('');
        this.#dialogueText.y = this.#dialogueAreaTop;
        this.#transcriptPhilEntry = null;

        streamBattleMove(
          {
            battleId: this.#battleId,
            philosopherId: phil.id,
            moveType: this.#selectedMoveType,
            argument: `[PHILOSOPHER_ALLY:${allyPhil.philosopherId}]`,
            openingStatement: this.#activeOpening ? `${phil.name}: ${this.#activeOpening.text}` : undefined,
          },
          {
            onMoveSuggestions: (suggestions) => {
              this.#pendingMoveSuggestions = suggestions;
            },
            onToolkitArgument: (generatedArg) => {
              this.#playerArgument = generatedArg;
              const moveName = this.#currentMoveOptions[this.#selectedMoveIndex]?.name?.toUpperCase() || this.#selectedMoveType.toUpperCase();
              this.#transcriptAdd('you', `${allyPhil.name} (your ally)`, `[${moveName}] ${generatedArg}`);
              this.#openDeployGate(
                `[${allyPhil.name}: ${moveName}]\n\n${generatedArg}`,
                phil.thinking_text || `${phil.name} considers the argument...`,
              );
            },
            onJudging: (phase) => {
              if (phase === 'player') {
                this.#statusText.setText('The judge evaluates the argument...').setAlpha(1);
              } else if (phase === 'counter') {
                this.#statusText.setText('The judge evaluates their counter...').setAlpha(1);
              }
            },
            onPlayerJudgeResult: (data) => {
              this.#statusText.setAlpha(0);
              this.#prevPhilHp = this.#philosopherHp;
              this.#philosopherHp = data.battle.philosopherHp;
              this.#pendingPlayerJudgeData = data;
              if (data.judgeScores && data.judgeScores.commentary) {
                this.#transcriptAdd('judge', 'Judge', `(on the argument) ${data.judgeScores.commentary}`);
              }

              // Animate philosopher taking damage
              const philDmg = this.#prevPhilHp - this.#philosopherHp;
              if (philDmg > 0) {
                this.#activeEnemyMonster.takeDamage(philDmg, () => {});
                this.#activeEnemyMonster.playTakeDamageAnimation(() => {});
                if (philDmg >= 15) {
                  this.cameras.main.shake(300, 0.01);
                }
              }
              // Ally/toolkit moves: philosopher streams in parallel,
              // the onToolkitArgument handler manages stream display.
            },
            onText: (chunk) => {
              this.#statusText.setAlpha(0);
              this.#appendStreamText(chunk);
              this.#transcriptStreamChunk(phil.name, chunk);
            },
            onCounterJudgeResult: (data) => {
              this.#pendingCounterJudgeData = data;
              if (data.counterJudgeScores && data.counterJudgeScores.commentary) {
                this.#transcriptAdd('judge', 'Judge', `(on ${phil.name}'s counter) ${data.counterJudgeScores.commentary}`);
              }
            },
            onResult: (data) => {
              this.#statusText.setAlpha(0);
              this.#prevPlayerHp = this.#playerHp;
              this.#playerHp = data.battle.playerHp;
              this.#exchanges = data.battle.exchanges;

              // Build combined judge data for the overlay
              const playerData = this.#pendingPlayerJudgeData || {};
              const counterData = this.#pendingCounterJudgeData || {};
              this.#pendingJudgeData = {
                judgeScores: playerData.judgeScores || {},
                counterJudgeScores: counterData.counterJudgeScores || null,
                damage: {
                  playerDamage: playerData.damage ? playerData.damage.playerDamage : 0,
                  philosopherDamage: counterData.damage ? counterData.damage.philosopherDamage : 0,
                  weightedScore: playerData.damage ? playerData.damage.weightedScore : 5,
                  counterWeightedScore: counterData.damage ? counterData.damage.counterWeightedScore : 0,
                  typeEffective: playerData.damage ? playerData.damage.typeEffective : false,
                  firstExchange: playerData.damage ? playerData.damage.firstExchange : false,
                },
                combo: data.combo,
                shouldSignatureMove: data.shouldSignatureMove,
              };
              this.#pendingPlayerJudgeData = null;
              this.#pendingCounterJudgeData = null;

              // Wait for stream buffer to drain, then go to DAMAGE_ANIM
              const waitForBuffer = this.time.addEvent({
                delay: 100,
                callback: () => {
                  if (this.#streamBuffer.length === 0) {
                    waitForBuffer.destroy();
                    this.time.delayedCall(500, () => {
                      this.#stateMachine.setState(DEBATE_STATES.DAMAGE_ANIM);
                    });
                  }
                },
                loop: true,
              });
            },
            onBattleEnd: (reward) => {
              this.#battleReward = reward;
            },
            onDone: () => {
              this.#statusText.setAlpha(0);
              this.#endStream();
              this.#transcriptPhilEntry = null;
              // Safety: if onResult never fired, surface an explicit,
              // acknowledged error — never a silent revert to the menu.
              this.time.delayedCall(500, () => {
                if (this.#stateMachine.currentStateName === DEBATE_STATES.PHILOSOPHER_ALLY_ARGUES && !this.#pendingJudgeData) {
                  this.#clearDeployGate();
                  this.#flushStreamBuffer();
                  this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
                    ['The exchange did not complete (no result from the debate engine). Press SPACE to continue.'],
                    () => {
                      this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
                    },
                  );
                  this._controls.lockInput = false;
                }
              });
            },
            onError: (err) => {
              this.#statusText.setAlpha(0);
              // Drop any pending deploy gate FIRST so the error message cannot
              // queue invisibly behind a stale "[Press SPACE to continue]".
              this.#clearDeployGate();
              this.#flushStreamBuffer();
              this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
                [`Error: ${err}. Press SPACE to continue.`],
                () => {
                  this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
                },
              );
              this._controls.lockInput = false;
            },
          },
        );
      },
    });

    // --- PHILOSOPHER_RESPONDS ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.PHILOSOPHER_RESPONDS,
      onEnter: () => {
        this._controls.lockInput = true;
        this.#battleMenu.hideMainBattleMenu();
        this.#battleMenu.hideMonsterAttackSubMenu();
        const phil = this.#sceneData.philosopher;

        const isToolkitMove = this.#playerArgument === '[TOOLKIT]';
        const isAllyMove = this.#playerArgument && this.#playerArgument.match(/^\[PHILOSOPHER_ALLY:/i);
        this.#statusText
          .setText(
            isToolkitMove
              ? 'Your toolkit generates an argument...'
              : 'The judge evaluates your argument...',
          )
          .setAlpha(1);

        // Don't beginStreamText yet — wait for player judge result to land first,
        // then the onPlayerJudgeResult handler will start the stream display.
        // Exception: toolkit/ally moves show the generated argument first
        // (their transcript entries are added in onToolkitArgument, once the
        // generated argument exists).
        this.#transcriptPhilEntry = null;
        if (!isToolkitMove && !isAllyMove) {
          const moveLabel =
            this.#currentMoveOptions[this.#selectedMoveIndex]?.name || this.#selectedMoveType || 'Argument';
          this.#transcriptAdd('you', 'You', `[${moveLabel}] ${this.#playerArgument}`);
        }

        streamBattleMove(
          {
            battleId: this.#battleId,
            philosopherId: phil.id,
            moveType: this.#selectedMoveType,
            argument: this.#playerArgument,
            openingStatement: this.#activeOpening ? `${phil.name}: ${this.#activeOpening.text}` : undefined,
          },
          {
            onMoveSuggestions: (suggestions) => {
              this.#pendingMoveSuggestions = suggestions;
            },
            onToolkitArgument: (generatedArg) => {
              const moveName = this.#selectedMoveType.toUpperCase().replace(/_/g, ' ');
              this.#transcriptAdd('you', 'You', `[Toolkit: ${moveName}] ${generatedArg}`);
              this.#openDeployGate(
                `[TOOLKIT: ${moveName}]\n\n${generatedArg}`,
                phil.thinking_text || `${phil.name} considers your words...`,
              );
            },
            onJudging: (phase) => {
              if (phase === 'player') {
                this.#statusText
                  .setText('The judge evaluates your argument...')
                  .setAlpha(1);
              } else if (phase === 'counter') {
                this.#statusText
                  .setText('The judge evaluates their counter...')
                  .setAlpha(1);
              }
            },
            // Phase 1: Player's attack lands — animate philosopher HP drop
            onPlayerJudgeResult: (data) => {
              this.#statusText.setAlpha(0);

              // Store previous philosopher HP, then update
              this.#prevPhilHp = this.#philosopherHp;
              this.#philosopherHp = data.battle.philosopherHp;

              // Store player judge data for the overlay later
              this.#pendingPlayerJudgeData = data;
              if (data.judgeScores && data.judgeScores.commentary) {
                this.#transcriptAdd('judge', 'Judge', `(on your argument) ${data.judgeScores.commentary}`);
              }

              // Animate philosopher taking damage
              const philDmg = this.#prevPhilHp - this.#philosopherHp;
              if (philDmg > 0) {
                this.#activeEnemyMonster.takeDamage(philDmg, () => {});
                this.#activeEnemyMonster.playTakeDamageAnimation(() => {});
                if (philDmg >= 15) {
                  this.cameras.main.shake(300, 0.01);
                }
              }

              // For toolkit/ally moves, the philosopher streams in parallel
              // and the toolkit handler manages stream display.
              // For normal moves, clear dialogue and prepare for philosopher's response.
              if (!isToolkitMove && !isAllyMove) {
                this.time.delayedCall(600, () => {
                  this.#dialogueText.setText('');
                  this.#dialogueText.y = this.#dialogueAreaTop;
                  this.#statusText
                    .setText(phil.thinking_text || `${phil.name} responds...`)
                    .setAlpha(1);
                  this.#beginStreamText();
                });
              }
            },
            onText: (chunk) => {
              this.#statusText.setAlpha(0);
              this.#appendStreamText(chunk);
              this.#transcriptStreamChunk(phil.name, chunk);
            },
            // Phase 2: Philosopher's counter scored — store for DAMAGE_ANIM
            onCounterJudgeResult: (data) => {
              this.#pendingCounterJudgeData = data;
              if (data.counterJudgeScores && data.counterJudgeScores.commentary) {
                this.#transcriptAdd('judge', 'Judge', `(on ${phil.name}'s counter) ${data.counterJudgeScores.commentary}`);
              }
            },
            onResult: (data) => {
              this.#statusText.setAlpha(0);

              // Store previous player HP for counter damage animation
              this.#prevPlayerHp = this.#playerHp;
              this.#playerHp = data.battle.playerHp;
              this.#exchanges = data.battle.exchanges;

              // Build combined judge data for the overlay
              const playerData = this.#pendingPlayerJudgeData || {};
              const counterData = this.#pendingCounterJudgeData || {};
              this.#pendingJudgeData = {
                judgeScores: playerData.judgeScores || {},
                counterJudgeScores: counterData.counterJudgeScores || null,
                damage: {
                  playerDamage: playerData.damage ? playerData.damage.playerDamage : 0,
                  philosopherDamage: counterData.damage ? counterData.damage.philosopherDamage : 0,
                  weightedScore: playerData.damage ? playerData.damage.weightedScore : 5,
                  counterWeightedScore: counterData.damage ? counterData.damage.counterWeightedScore : 0,
                  typeEffective: playerData.damage ? playerData.damage.typeEffective : false,
                  firstExchange: playerData.damage ? playerData.damage.firstExchange : false,
                },
                combo: data.combo,
                shouldSignatureMove: data.shouldSignatureMove,
              };
              this.#pendingPlayerJudgeData = null;
              this.#pendingCounterJudgeData = null;

              // Wait for stream buffer to drain, then go to DAMAGE_ANIM
              // (which now handles philosopher's counter damage to player)
              const waitForBuffer = this.time.addEvent({
                delay: 100,
                callback: () => {
                  if (this.#streamBuffer.length === 0) {
                    waitForBuffer.destroy();
                    this.time.delayedCall(500, () => {
                      this.#stateMachine.setState(DEBATE_STATES.DAMAGE_ANIM);
                    });
                  }
                },
                loop: true,
              });
            },
            onBattleEnd: (reward) => {
              this.#battleReward = reward;
            },
            onDone: () => {
              this.#statusText.setAlpha(0);
              this.#endStream();
              this.#transcriptPhilEntry = null;
              // Safety: if onResult never fired, surface an explicit,
              // acknowledged error — never a silent revert to the menu.
              this.time.delayedCall(500, () => {
                if (this.#stateMachine.currentStateName === DEBATE_STATES.PHILOSOPHER_RESPONDS && !this.#pendingJudgeData) {
                  this.#clearDeployGate();
                  this.#flushStreamBuffer();
                  this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
                    ['The exchange did not complete (no result from the debate engine). Press SPACE to continue.'],
                    () => {
                      this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
                    },
                  );
                  this._controls.lockInput = false;
                }
              });
            },
            onError: (err) => {
              this.#statusText.setAlpha(0);
              // Drop any pending deploy gate FIRST so the error message cannot
              // queue invisibly behind a stale "[Press SPACE to continue]".
              this.#clearDeployGate();
              this.#flushStreamBuffer();
              this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
                [`Error: ${err}. Press SPACE to continue.`],
                () => {
                  this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
                },
              );
              this._controls.lockInput = false;
            },
          },
        );
      },
    });

    // --- DAMAGE_ANIM ---
    // Now handles Phase 2 only: philosopher's counter damage to player.
    // Phase 1 (player's attack → philosopher HP drop) happens in onPlayerJudgeResult.
    this.#stateMachine.addState({
      name: DEBATE_STATES.DAMAGE_ANIM,
      onEnter: () => {
        // Kill any lingering stream timer so buffered text doesn't overwrite judge display
        this.#streamBuffer = '';
        if (this.#streamTimer && !this.#streamTimer.destroyed) {
          this.#streamTimer.destroy();
          this.#streamTimer = null;
        }
        // Belt-and-braces: no deploy gate (or other queued info-pane entry) may
        // survive into a new exchange — a stale entry's callback would fire on a
        // later keypress, clearing the dialogue and locking input mid-menu.
        this.#clearDeployGate();

        this.#exchangeCounter.setText(`${this.#exchanges}/${this.#maxExchanges}`);

        const judgeData = this.#pendingJudgeData;
        this.#pendingJudgeData = null;
        const isReconstruct = judgeData?._isReconstruct || false;
        const isOneShot = judgeData?._oneShot || false;

        // One-shot animation (reconstruct): dramatic HP drop on philosopher
        if (isOneShot) {
          this.#activeEnemyMonster.takeDamage(this.#prevPhilHp, () => {});
          this.#activeEnemyMonster.playTakeDamageAnimation(() => {});
          this.cameras.main.shake(500, 0.02);
        } else if (!isReconstruct) {
          // Standard moves: philosopher damage already animated in onPlayerJudgeResult.
          // Now animate philosopher's counter damage to the player (Phase 2).
          const playerDamage = this.#prevPlayerHp - this.#playerHp;
          if (playerDamage > 0) {
            this.#activePlayerMonster.takeDamage(playerDamage, () => {});
            this.#activePlayerMonster.playTakeDamageAnimation(() => {});
            if (playerDamage >= 15) {
              this.cameras.main.shake(300, 0.01);
            }
          }
        } else {
          // Reconstruct moves: animate both damages here (no two-phase split)
          const philDamage = this.#prevPhilHp - this.#philosopherHp;
          const playerDamage = this.#prevPlayerHp - this.#playerHp;
          if (philDamage > 0) {
            this.#activeEnemyMonster.takeDamage(philDamage, () => {});
            this.#activeEnemyMonster.playTakeDamageAnimation(() => {});
          }
          if (playerDamage > 0) {
            this.#activePlayerMonster.takeDamage(playerDamage, () => {});
            this.#activePlayerMonster.playTakeDamageAnimation(() => {});
          }
          if (philDamage >= 15 || playerDamage >= 15) {
            this.cameras.main.shake(300, 0.01);
          }
        }

        // After animations settle, show judge overlay
        this.time.delayedCall(800, () => {
          if (judgeData) {
            this.#showJudgeOverlay(judgeData, isReconstruct, isOneShot);
          } else {
            // No judge data — fall back directly to next state
            this.#stateMachine.setState(DEBATE_STATES.POST_EXCHANGE_CHECK);
          }
        });
      },
    });

    // --- POST_EXCHANGE_CHECK ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.POST_EXCHANGE_CHECK,
      onEnter: () => {
        if (this.#philosopherHp <= 0) {
          this.#stateMachine.setState(DEBATE_STATES.RESOLVE);
          return;
        }
        if (this.#playerHp <= 0) {
          this.#stateMachine.setState(DEBATE_STATES.RESOLVE);
          return;
        }
        if (this.#exchanges >= this.#maxExchanges) {
          this.#stateMachine.setState(DEBATE_STATES.RESOLVE);
          return;
        }
        this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
      },
    });

    // --- FLEE_ATTEMPT ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.FLEE_ATTEMPT,
      onEnter: () => {
        this._controls.lockInput = true;
        const phil = this.#sceneData.philosopher;
        const fleeChance = Math.max(
          0.1,
          0.7 - phil.level * 0.05 - this.#exchanges * 0.05,
        );
        const succeeded = Math.random() < fleeChance;

        if (succeeded) {
          this.#battleMenu.updateInfoPaneMessageNoInputRequired(
            'You disengage from the debate!',
            () => {
              this.time.delayedCall(1200, () => {
                this.#stateMachine.setState(DEBATE_STATES.FINISHED);
              });
            },
          );
        } else {
          const failMessages = [
            `${phil.name}'s argument holds you captive!`,
            `${phil.name} blocks your retreat with a devastating objection!`,
            `You try to leave, but ${phil.name}'s reasoning draws you back in!`,
            `"We are not done here," says ${phil.name}. Their conviction is too strong.`,
          ];
          const msg =
            failMessages[Math.floor(Math.random() * failMessages.length)];

          const fleeDamage = Math.floor(5 + phil.level * 1.5);
          this.#prevPlayerHp = this.#playerHp;
          this.#playerHp = Math.max(0, this.#playerHp - fleeDamage);

          // Animate player damage
          this.#activePlayerMonster.takeDamage(fleeDamage, () => {});
          this.#activePlayerMonster.playTakeDamageAnimation(() => {});

          this.#battleMenu.updateInfoPaneMessageNoInputRequired(
            `${msg} Lost ${fleeDamage} resolve.`,
            () => {
              if (this.#playerHp <= 0) {
                this.time.delayedCall(500, () => {
                  this.#stateMachine.setState(DEBATE_STATES.RESOLVE);
                });
              } else {
                this.time.delayedCall(2000, () => {
                  this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
                });
              }
            },
          );
        }
      },
    });

    // --- CAPTURE_ATTEMPT ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.CAPTURE_ATTEMPT,
      onEnter: async () => {
        this._controls.lockInput = true;

        await this.#ball.playThrowBallAnimation();
        await this.#activeEnemyMonster.playCatchAnimation();

        const result = calculateMonsterCaptureResults(this.#activeEnemyMonster);
        await this.#ball.playShakeBallAnimation(result.wasCaptured ? 3 : 1);

        if (result.wasCaptured) {
          this.#ball.hide();
          this.#stateMachine.setState(DEBATE_STATES.CAUGHT_PHILOSOPHER);
          return;
        }

        // Capture failed
        await this.#activeEnemyMonster.playCatchAnimationFailed();
        this.#ball.hide();

        // Apply penalty damage
        const penalty = 5;
        this.#prevPlayerHp = this.#playerHp;
        this.#playerHp = Math.max(0, this.#playerHp - penalty);
        this.#activePlayerMonster.takeDamage(penalty, () => {});
        this.#activePlayerMonster.playTakeDamageAnimation(() => {});

        this.#battleMenu.updateInfoPaneMessageNoInputRequired(
          "The philosopher resists! They won't be swayed so easily!",
          () => {
            this.time.delayedCall(2000, () => {
              this.#stateMachine.setState(DEBATE_STATES.POST_EXCHANGE_CHECK);
            });
          },
        );
      },
    });

    // --- CAUGHT_PHILOSOPHER ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.CAUGHT_PHILOSOPHER,
      onEnter: () => {
        this._controls.lockInput = true;
        const phil = this.#sceneData.philosopher;

        // Build philosopher monster object for party
        const philMonster = {
          id: `captured_${phil.id}_${Date.now()}`,
          monsterId: 900,
          name: phil.name,
          assetKey: CHARACTER_ASSET_KEYS.NPC,
          assetFrame: this.#sceneData.npcFrame || 0,
          currentLevel: phil.level || 1,
          maxHp: phil.hp || 100,
          currentHp: this.#philosopherHp,
          baseAttack: (phil.level || 1) * 3,
          attackIds: [],
          currentAttack: (phil.level || 1) * 3,
          baseExp: (phil.level || 1) * 10,
          currentExp: 0,
          isPhilosopher: true,
          philosopherId: phil.id,
          tradition: phil.tradition,
        };

        // Add to party
        const party = dataManager.store.get(DATA_MANAGER_STORE_KEYS.MONSTERS_IN_PARTY);
        party.push(philMonster);
        dataManager.store.set(DATA_MANAGER_STORE_KEYS.MONSTERS_IN_PARTY, party);

        this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
          [
            `${phil.name} has been captured!`,
            `${phil.name} joined your philosophical party!`,
          ],
          () => {
            // Mark NPC as defeated
            if (this.#sceneData.npcId !== undefined) {
              dataManager.addDefeatedNpc(this.#sceneData.npcId);
            }
            this.#stateMachine.setState(DEBATE_STATES.FINISHED);
          },
        );
        this._controls.lockInput = false;
      },
    });

    // --- SWITCH_PHILOSOPHER ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.SWITCH_PHILOSOPHER,
      onEnter: () => {
        this._controls.lockInput = true;
        const switchTarget = this.#pendingSwitchPhilosopher;

        if (switchTarget && switchTarget.isPhilosopher) {
          // Switching to a captured philosopher ally
          this.#activeAllyPhilosopher = switchTarget;

          const philMonster = {
            ...switchTarget,
            currentHp: this.#playerHp,
            maxHp: this.#maxPlayerHp,
          };
          this.#activePlayerMonster.switchMonster(philMonster);
          this.#activePlayerMonster._phaserGameObject.setScale(4);

          this.#battleMenu.updateInfoPaneMessageNoInputRequired(
            `Go, ${switchTarget.name}! Choose ARGUE and a move — they will make the argument.`,
            () => {
              this.time.delayedCall(1500, () => {
                this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
              });
            },
          );
        } else {
          // Switching back to student
          this.#activeAllyPhilosopher = null;

          const studentData = {
            ...this.#studentMonsterData,
            currentHp: this.#playerHp,
            maxHp: this.#maxPlayerHp,
          };
          this.#activePlayerMonster.switchMonster(studentData);
          this.#activePlayerMonster._phaserGameObject.setScale(1);

          this.#battleMenu.updateInfoPaneMessageNoInputRequired(
            'You step back into the debate!',
            () => {
              this.time.delayedCall(1500, () => {
                this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
              });
            },
          );
        }
      },
    });

    // --- RECONSTRUCT ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.RECONSTRUCT,
      onEnter: () => {
        this._controls.lockInput = true;
        this.#battleMenu.hideMainBattleMenu();

        // Use the dialogue text already displayed as context
        const currentDialogue = this.#dialogueText.text;
        const header = 'RECONSTRUCT THIS ARGUMENT:';
        this.#dialogueText.y = this.#dialogueAreaTop;
        this.#dialogueText.setText(`${header}\n\n${currentDialogue}`);
        this.#autoScrollDialogue();

        this.#battleMenu.updateInfoPaneMessageNoInputRequired(
          'Restate the argument, then identify the flaw.',
        );

        // Show text input for reconstruction
        this.#showReconstructInput();
      },
    });

    // --- AGREE ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.AGREE,
      onEnter: () => {
        this._controls.lockInput = true;
        const phil = this.#sceneData.philosopher;

        // Store belief
        dataManager.addBelief(
          phil.id,
          `Accepted ${phil.name}'s position on ${phil.tradition}`,
          phil.tradition,
        );

        // Grant partial XP
        const partialXp = Math.floor(10 + phil.level * 3);
        const xpResult = dataManager.addPlayerXp(partialXp);
        dataManager.recordDebateResult(phil.id, 'draw', 5);

        // Show agree text
        const agreeMessages = [
          `You nod thoughtfully. "${phil.name}, I find myself persuaded by your reasoning."`,
          `"You raise a compelling point," you concede. ${phil.name} inclines their head.`,
          `You acknowledge ${phil.name}'s argument. Sometimes wisdom lies in knowing when to agree.`,
        ];
        const msg =
          agreeMessages[Math.floor(Math.random() * agreeMessages.length)];
        this.#dialogueText.y = this.#dialogueAreaTop;
        this.#dialogueText.setText(msg);
        this.#autoScrollDialogue();
        this.#transcriptAdd('you', 'You', `[Agree] ${msg}`);

        // Show XP in info pane
        let resultText = `Belief recorded. XP gained: ${partialXp}`;
        if (xpResult.leveledUp) {
          resultText += ` | LEVEL UP! You are now Level ${xpResult.newLevel}!`;
        }
        resultText += '\n\n[Press SPACE to continue]';

        this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
          [resultText],
          () => {
            this.#stateMachine.setState(DEBATE_STATES.FINISHED);
          },
        );
        this._controls.lockInput = false;
      },
    });

    // --- RESOLVE ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.RESOLVE,
      onEnter: () => {
        this._controls.lockInput = true;
        const phil = this.#sceneData.philosopher;

        // Determine result
        let debateResult = 'draw';
        let resultText = '';
        if (this.#philosopherHp <= 0) {
          debateResult = 'win';
          resultText = `VICTORY! ${phil.name}'s conviction has been shattered!\n\n"${
            phil.defeat_text || 'You argue well. I must reconsider.'
          }"`;
        } else if (this.#playerHp <= 0) {
          debateResult = 'loss';
          resultText = `DEFEAT! Your resolve has crumbled.\n\n"${
            phil.victory_text || 'Perhaps you should study more carefully.'
          }"`;
        } else {
          resultText =
            'DRAW! The debate reaches its natural conclusion.\n\nBoth sides have argued well. Partial understanding achieved.';
        }

        // Apply XP from battle reward
        if (this.#battleReward) {
          const xpResult = dataManager.addPlayerXp(this.#battleReward.xp);
          resultText += `\n\nXP gained: ${this.#battleReward.xp}`;
          if (xpResult.leveledUp) {
            resultText += ` | LEVEL UP! You are now Level ${xpResult.newLevel}!`;
          }
        }

        // Record debate result
        const avgScore = this.#battleReward?.avgScore || 0;
        dataManager.recordDebateResult(phil.id, debateResult, avgScore);

        // Unlock toolkit concepts from signature moves
        if (phil.signature_moves && phil.signature_moves.length > 0) {
          let conceptsUnlocked = 0;
          if (debateResult === 'win') {
            phil.signature_moves.forEach((move) => {
              if (dataManager.addToolkitConcept(phil.id, move)) {
                conceptsUnlocked++;
              }
            });
          } else if (debateResult === 'draw') {
            for (const move of phil.signature_moves) {
              if (dataManager.addToolkitConcept(phil.id, move)) {
                conceptsUnlocked++;
                break;
              }
            }
          }
          if (conceptsUnlocked > 0) {
            resultText += `\n${conceptsUnlocked} concept${conceptsUnlocked > 1 ? 's' : ''} added to Philosophical Toolkit!`;
          }
        }

        // Track gym leader defeat
        if (debateResult === 'win' && phil.role === 'gym_leader') {
          dataManager.addDefeatedGymLeader(phil.id);
          const gymCount = dataManager.getDefeatedGymLeaders().length;
          resultText += `\nGym Leaders defeated: ${gymCount}/9`;
        }

        this.#dialogueText.y = this.#dialogueAreaTop;
        this.#dialogueText.setText(resultText);
        this.#autoScrollDialogue();

        this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
          ['Press SPACE to return to the world.'],
          () => {
            this.#stateMachine.setState(DEBATE_STATES.FINISHED);
          },
        );
        this._controls.lockInput = false;
      },
    });

    // --- FINISHED ---
    this.#stateMachine.addState({
      name: DEBATE_STATES.FINISHED,
      onEnter: () => {
        this.#hideTextInput();
        this.#hideJudgeOverlay();
        this.#hideTranscriptOverlay();

        // Clean up stream timer
        if (this.#streamTimer && !this.#streamTimer.destroyed) {
          this.#streamTimer.destroy();
          this.#streamTimer = null;
        }

        // Track defeated NPC
        if (
          this.#philosopherHp <= 0 &&
          this.#sceneData.npcId !== undefined
        ) {
          dataManager.addDefeatedNpc(this.#sceneData.npcId);
        }

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
    this.#stateMachine.setState(DEBATE_STATES.INTRO);
  }

  /**
   * Show a deploy-generated argument (toolkit/ally) and gate the philosopher's
   * response behind a SPACE press. While the gate is pending the streamed
   * response accumulates in #streamBuffer untouched — #deployGatePending guards
   * it from the update() SPACE flush (the same keypress that advances the gate
   * used to flush the response into the dialogue and then instantly erase it).
   * The gate callback clears the argument panel and starts the reveal timer
   * WITHOUT resetting the buffer, so a response that finished streaming before
   * the keypress is never lost.
   * @param {string} panelText - the generated-argument panel content
   * @param {string} thinkingText - status line to show while awaiting the reveal
   */
  #openDeployGate(panelText, thinkingText) {
    this.#statusText.setAlpha(0);
    this.#dialogueText.y = this.#dialogueAreaTop;
    this.#dialogueText.setText(panelText);
    this.#autoScrollDialogue();

    // Fresh buffer for the incoming philosopher response (no chunks have
    // arrived yet — the player judge runs before the stream starts).
    this.#streamBuffer = '';
    this.#streamComplete = false;
    if (this.#streamTimer && !this.#streamTimer.destroyed) {
      this.#streamTimer.destroy();
      this.#streamTimer = null;
    }

    this.#deployGatePending = true;
    this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
      ['[Press SPACE to continue]'],
      () => {
        this.#deployGatePending = false;
        this.#dialogueText.setText('');
        this.#dialogueText.y = this.#dialogueAreaTop;
        this.#statusText.setText(thinkingText).setAlpha(1);
        this._controls.lockInput = true;
        this.#startDeployDrainTimer();
      },
    );
    this._controls.lockInput = false;
  }

  /** Start the character-reveal timer WITHOUT resetting the stream buffer. */
  #startDeployDrainTimer() {
    if (this.#streamTimer && !this.#streamTimer.destroyed) {
      this.#streamTimer.destroy();
    }
    this.#streamTimer = this.time.addEvent({
      delay: 18,
      callback: () => {
        if (this.#streamBuffer.length > 0) {
          this.#statusText.setAlpha(0);
          const nextChar = this.#streamBuffer[0];
          this.#streamBuffer = this.#streamBuffer.substring(1);
          this.#dialogueText.setText(this.#dialogueText.text + nextChar);
          this.#autoScrollDialogue();
        } else if (this.#streamComplete && this.#streamTimer) {
          this.#streamTimer.destroy();
          this.#streamTimer = null;
        }
      },
      loop: true,
    });
  }

  /**
   * Abandon a pending deploy gate and any queued info-pane messages so an
   * error (or the next exchange) can never sit invisibly behind a stale
   * "[Press SPACE to continue]" entry whose callback would later clear the
   * dialogue and lock input mid-menu.
   */
  #clearDeployGate() {
    this.#deployGatePending = false;
    this.#battleMenu.resetInfoPaneQueue();
  }

  /** Reset the stream buffer and start the character-reveal timer. */
  #beginStreamText() {
    this.#streamBuffer = '';
    this.#streamComplete = false;
    this.#dialogueText.setText('');
    this.#dialogueText.y = this.#dialogueAreaTop;

    if (this.#streamTimer && !this.#streamTimer.destroyed) {
      this.#streamTimer.destroy();
    }

    this.#streamTimer = this.time.addEvent({
      delay: 18,
      callback: () => {
        if (this.#streamBuffer.length > 0) {
          const nextChar = this.#streamBuffer[0];
          this.#streamBuffer = this.#streamBuffer.substring(1);
          this.#dialogueText.setText(this.#dialogueText.text + nextChar);
        } else if (this.#streamComplete && this.#streamTimer) {
          this.#streamTimer.destroy();
          this.#streamTimer = null;
        }
      },
      loop: true,
    });
  }

  /** Append a chunk of streamed text to the buffer. */
  #appendStreamText(chunk) {
    this.#streamBuffer += chunk;
  }

  /** Mark the stream as complete; the timer stops when the buffer empties. */
  #endStream() {
    this.#streamComplete = true;
  }

  /** Immediately dump all buffered text to the dialogue and destroy the timer. */
  #flushStreamBuffer() {
    if (this.#streamBuffer.length > 0) {
      this.#dialogueText.setText(this.#dialogueText.text + this.#streamBuffer);
      this.#streamBuffer = '';
      this.#autoScrollDialogue();
    }
    if (this.#streamTimer && !this.#streamTimer.destroyed) {
      this.#streamTimer.destroy();
      this.#streamTimer = null;
    }
  }

  /** Scroll dialogue text up so the newest lines remain visible. */
  #autoScrollDialogue() {
    const visibleHeight = this.#dialogueAreaBottom - this.#dialogueAreaTop;
    const textHeight = this.#dialogueText.height;
    if (textHeight > visibleHeight) {
      this.#dialogueText.y = this.#dialogueAreaBottom - textHeight;
    }
  }

  // ─── Transcript (data) ───

  /**
   * Append a completed entry to the battle transcript.
   * @param {'you'|'phil'|'judge'} speaker
   * @param {string} label - display label (You / philosopher name / Judge)
   * @param {string} text
   */
  #transcriptAdd(speaker, label, text) {
    const t = (text || '').trim();
    if (!t) return;
    this.#transcript.push({ speaker, label, text: t });
    if (this.#transcriptOverlay) {
      this.#renderTranscriptEntries(false);
    }
  }

  /**
   * Feed a streamed philosopher chunk into the transcript. The first chunk of
   * a response creates a live entry; later chunks append to it, so the entry
   * keeps its correct position (after the player's argument and the judge's
   * verdict) regardless of when the stream completes.
   * @param {string} label - philosopher display name
   * @param {string} chunk
   */
  #transcriptStreamChunk(label, chunk) {
    if (!chunk) return;
    if (!this.#transcriptPhilEntry) {
      this.#transcriptPhilEntry = { speaker: 'phil', label, text: '' };
      this.#transcript.push(this.#transcriptPhilEntry);
    }
    this.#transcriptPhilEntry.text += chunk;
    if (this.#transcriptOverlay) {
      this.#renderTranscriptEntries(false);
    }
  }

  // ─── Transcript (overlay UI) ───

  #toggleTranscriptOverlay() {
    if (this.#transcriptOverlay) {
      this.#hideTranscriptOverlay();
    } else {
      this.#showTranscriptOverlay();
    }
  }

  /**
   * DOM overlay showing the full battle transcript. Mirrors the access-code
   * modal's approach: plain DOM above the canvas, pointer events stopped at the
   * overlay so Phaser never pulls focus to the canvas, and key events captured
   * at the window (capture phase) so the game's key handling is suspended while
   * the transcript is open and resumes untouched on close.
   */
  #showTranscriptOverlay() {
    if (this.#transcriptOverlay) return;
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    this.#transcriptPrevFocus = document.activeElement;

    const overlay = document.createElement('div');
    overlay.id = 'ethica-transcript-overlay';
    overlay.style.cssText = `
      position: fixed;
      left: ${rect.left + 30}px;
      top: ${rect.top + 20}px;
      width: ${rect.width - 60}px;
      height: ${rect.height - 60}px;
      background: rgba(15, 52, 96, 0.97);
      color: #e0e0e0;
      border: 3px solid #533483;
      border-radius: 10px;
      font-family: '${KENNEY_FUTURE_NARROW_FONT_NAME}', monospace;
      z-index: 1200;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 28px rgba(0, 0, 0, 0.6);
    `;

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:2px solid #533483;';
    const title = document.createElement('div');
    title.textContent = 'DEBATE TRANSCRIPT';
    title.style.cssText = 'color:#c792ea;font-size:16px;font-weight:bold;letter-spacing:2px;';
    const hint = document.createElement('div');
    hint.textContent = '[T] / [ESC] close · scroll to read';
    hint.style.cssText = 'color:#8892a8;font-size:11px;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close transcript');
    closeBtn.style.cssText = `
      background: #533483; color: #fff; border: 1px solid #c792ea; border-radius: 4px;
      width: 26px; height: 26px; cursor: pointer; font-size: 13px; margin-left: 12px;
      font-family: '${KENNEY_FUTURE_NARROW_FONT_NAME}', monospace;
    `;
    closeBtn.addEventListener('click', () => this.#hideTranscriptOverlay());
    header.appendChild(title);
    header.appendChild(hint);
    header.appendChild(closeBtn);

    const scroller = document.createElement('div');
    scroller.id = 'ethica-transcript-scroll';
    scroller.tabIndex = -1;
    scroller.style.cssText = `
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y;
      padding: 12px 18px;
      font-size: 13px;
      line-height: 1.6;
      outline: none;
    `;

    overlay.appendChild(header);
    overlay.appendChild(scroller);

    // Keep Phaser from seeing pointer events (canvas focus-theft — see the
    // access-code modal for the original bug).
    const stopPointer = (e) => e.stopPropagation();
    ['pointerdown', 'touchstart', 'click', 'mousedown'].forEach((t) => overlay.addEventListener(t, stopPointer));

    // Capture-phase key handler: closes on T/Escape, and stops every other key
    // from reaching Phaser's window listeners so battle state cannot advance
    // unseen while the player reads. Non-close keys keep their browser default
    // (arrows/PageUp/PageDown scroll the focused container natively).
    this.#transcriptKeyHandler = (e) => {
      if (e.key === 'Escape' || e.key === 't' || e.key === 'T') {
        e.preventDefault();
        e.stopPropagation();
        this.#hideTranscriptOverlay();
        return;
      }
      e.stopPropagation();
    };
    window.addEventListener('keydown', this.#transcriptKeyHandler, true);

    document.body.appendChild(overlay);
    this.#transcriptOverlay = overlay;
    this.#renderTranscriptEntries(true);

    // Focus the scroll container so arrow/page keys scroll it; preventScroll
    // keeps the auto-scroll-to-bottom position from #renderTranscriptEntries.
    try {
      scroller.focus({ preventScroll: true });
    } catch {
      /* noop */
    }
  }

  /** Close the transcript and hand focus/input back exactly as they were. */
  #hideTranscriptOverlay() {
    if (this.#transcriptKeyHandler) {
      window.removeEventListener('keydown', this.#transcriptKeyHandler, true);
      this.#transcriptKeyHandler = null;
    }
    if (this.#transcriptOverlay) {
      this.#transcriptOverlay.remove();
      this.#transcriptOverlay = null;
    }
    // Restore focus (e.g. back into the argument textarea if the player was
    // mid-draft). If the previous element is gone, leave focus alone — Phaser's
    // window-level keyboard listeners work regardless.
    const prev = this.#transcriptPrevFocus;
    this.#transcriptPrevFocus = null;
    if (prev && prev !== document.body && document.contains(prev) && typeof prev.focus === 'function') {
      try {
        prev.focus();
      } catch {
        /* noop */
      }
    }
  }

  /**
   * (Re)render the transcript entries into the scroll container.
   * @param {boolean} scrollToBottom
   */
  #renderTranscriptEntries(scrollToBottom = false) {
    if (!this.#transcriptOverlay) return;
    const scroller = this.#transcriptOverlay.querySelector('#ethica-transcript-scroll');
    if (!scroller) return;

    // Live updates (entries arriving while open) follow the bottom only when
    // the reader is already there — never yank them out of scroll-back.
    const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 40;

    const STYLES = {
      you: { label: '#82aaff', text: '#e0e0e0', italic: false },
      phil: { label: '#c792ea', text: '#e0e0e0', italic: false },
      judge: { label: '#8892a8', text: '#9aa4b8', italic: true },
    };

    scroller.replaceChildren();
    if (this.#transcript.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'Nothing said yet.';
      empty.style.cssText = 'color:#8892a8;font-style:italic;';
      scroller.appendChild(empty);
      return;
    }

    for (const entry of this.#transcript) {
      const style = STYLES[entry.speaker] || STYLES.phil;
      const row = document.createElement('div');
      row.className = `ethica-transcript-entry ethica-transcript-${entry.speaker}`;
      row.style.cssText = `margin-bottom:12px;${style.italic ? 'font-style:italic;font-size:12px;' : ''}`;
      const label = document.createElement('span');
      label.className = 'ethica-transcript-label';
      label.textContent = entry.label;
      label.style.cssText = `color:${style.label};font-weight:bold;letter-spacing:1px;margin-right:8px;`;
      const body = document.createElement('span');
      // textContent (never innerHTML): entry text is model/player-authored.
      body.textContent = entry.text;
      body.style.cssText = `color:${style.text};`;
      row.appendChild(label);
      row.appendChild(body);
      scroller.appendChild(row);
    }

    if (scrollToBottom || nearBottom) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }

  /** Create the HTML textarea + submit + template buttons over the canvas. */
  #showTextInput() {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();

    // --- Textarea ---
    this.#textInput = document.createElement('textarea');
    this.#textInput.id = 'ethica-debate-input';
    this.#textInput.placeholder = `Type your ${this.#currentMoveOptions[this.#selectedMoveIndex].name} argument... (2000 chars max)`;
    this.#textInput.maxLength = 2000;
    this.#textInput.style.cssText = `
      position: fixed;
      left: ${rect.left + 20}px;
      top: ${rect.top + rect.height - 180}px;
      width: ${rect.width - 40}px;
      height: 100px;
      background: rgba(15, 52, 96, 0.95);
      color: #e0e0e0;
      border: 2px solid #533483;
      border-radius: 8px;
      padding: 12px;
      font-family: '${KENNEY_FUTURE_NARROW_FONT_NAME}', monospace;
      font-size: 13px;
      resize: none;
      outline: none;
      z-index: 1000;
      line-height: 1.5;
    `;

    // --- Submit button ---
    this.#submitButton = document.createElement('button');
    this.#submitButton.textContent = 'SUBMIT ARGUMENT';
    this.#submitButton.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width - 200}px;
      top: ${rect.top + rect.height - 70}px;
      width: 180px;
      height: 40px;
      background: #533483;
      color: #ffffff;
      border: 2px solid #c792ea;
      border-radius: 6px;
      font-family: '${KENNEY_FUTURE_NARROW_FONT_NAME}', monospace;
      font-size: 14px;
      cursor: pointer;
      z-index: 1001;
    `;

    this.#submitButton.addEventListener('click', () => {
      this.#playerArgument = this.#textInput.value.trim();
      if (this.#playerArgument.length > 0) {
        this.#hideTextInput();
        this.#stateMachine.setState(DEBATE_STATES.PHILOSOPHER_RESPONDS);
      }
    });

    // --- Template buttons ---
    const move = this.#currentMoveOptions[this.#selectedMoveIndex];
    this.#templateContainer = document.createElement('div');
    this.#templateContainer.style.cssText = `
      position: fixed;
      left: ${rect.left + 20}px;
      top: ${rect.top + rect.height - 70}px;
      width: ${rect.width - 220}px;
      display: flex;
      gap: 6px;
      z-index: 1001;
    `;

    // Build template list: if curated opening has a hint for this move, prepend it
    const moveHint = this.#activeOpening?.move_hints?.[this.#selectedMoveType];
    const templateList = moveHint
      ? [moveHint, ...move.templates.slice(0, 2)]
      : [...move.templates];

    templateList.forEach((template, i) => {
      const btn = document.createElement('button');
      btn.textContent = moveHint && i === 0 ? 'Hint' : `Template ${moveHint ? i : i + 1}`;
      btn.title = template.substring(0, 80) + '...';
      btn.style.cssText = `
        flex: 1;
        height: 32px;
        background: rgba(15, 52, 96, 0.9);
        color: #c792ea;
        border: 1px solid #533483;
        border-radius: 4px;
        font-family: '${KENNEY_FUTURE_NARROW_FONT_NAME}', monospace;
        font-size: 11px;
        cursor: pointer;
      `;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.#textInput.value = template;
        setTimeout(() => {
          this.#textInput.focus();
          this.#textInput.setSelectionRange(
            this.#textInput.value.length,
            this.#textInput.value.length,
          );
        }, 10);
      });
      this.#templateContainer.appendChild(btn);
    });

    // Prevent Phaser from capturing keyboard input while typing
    const stopPhaserCapture = (e) => e.stopPropagation();
    this.#textInput.addEventListener('keydown', stopPhaserCapture);
    this.#textInput.addEventListener('keyup', stopPhaserCapture);
    this.#textInput.addEventListener('keypress', stopPhaserCapture);

    document.body.appendChild(this.#textInput);
    document.body.appendChild(this.#submitButton);
    document.body.appendChild(this.#templateContainer);

    // If a toolkit item was used, pre-fill the textarea with the canned argument
    if (this.#toolkitPrefill) {
      this.#textInput.value = this.#toolkitPrefill;
      this.#toolkitPrefill = null;
      setTimeout(() => {
        this.#textInput.focus();
        this.#textInput.setSelectionRange(
          this.#textInput.value.length,
          this.#textInput.value.length,
        );
      }, 10);
    }
    this.#textInput.focus();
  }

  /** Remove the HTML text input overlay from the DOM. */
  #hideTextInput() {
    if (this.#textInput) {
      this.#textInput.remove();
      this.#textInput = null;
    }
    if (this.#submitButton) {
      this.#submitButton.remove();
      this.#submitButton = null;
    }
    if (this.#templateContainer) {
      this.#templateContainer.remove();
      this.#templateContainer = null;
    }
  }

  /** Create the HTML textarea for the reconstruct move. */
  #showReconstructInput() {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();

    // --- Textarea ---
    this.#textInput = document.createElement('textarea');
    this.#textInput.id = 'ethica-reconstruct-input';
    this.#textInput.placeholder = 'Restate this argument in your own words, then identify the flaw... (2000 chars max)';
    this.#textInput.maxLength = 2000;
    this.#textInput.style.cssText = `
      position: fixed;
      left: ${rect.left + 20}px;
      top: ${rect.top + rect.height - 180}px;
      width: ${rect.width - 40}px;
      height: 100px;
      background: rgba(15, 52, 96, 0.95);
      color: #e0e0e0;
      border: 2px solid #c792ea;
      border-radius: 8px;
      padding: 12px;
      font-family: '${KENNEY_FUTURE_NARROW_FONT_NAME}', monospace;
      font-size: 13px;
      resize: none;
      outline: none;
      z-index: 1000;
      line-height: 1.5;
    `;

    // --- Submit button ---
    this.#submitButton = document.createElement('button');
    this.#submitButton.textContent = 'SUBMIT RECONSTRUCTION';
    this.#submitButton.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width - 220}px;
      top: ${rect.top + rect.height - 70}px;
      width: 200px;
      height: 40px;
      background: #533483;
      color: #ffffff;
      border: 2px solid #c792ea;
      border-radius: 6px;
      font-family: '${KENNEY_FUTURE_NARROW_FONT_NAME}', monospace;
      font-size: 14px;
      cursor: pointer;
      z-index: 1001;
    `;

    this.#submitButton.addEventListener('click', () => {
      const reconstruction = this.#textInput.value.trim();
      if (reconstruction.length > 0) {
        this.#hideTextInput();
        this.#playerArgument = reconstruction;
        this.#selectedMoveType = 'reconstruct';
        this.#transcriptAdd('you', 'You', `[Reconstruct] ${reconstruction}`);

        // Send reconstruct move to server
        this._controls.lockInput = true;
        const phil = this.#sceneData.philosopher;

        this.#statusText
          .setText('The judge evaluates your reconstruction...')
          .setAlpha(1);

        streamBattleMove(
          {
            battleId: this.#battleId,
            philosopherId: phil.id,
            moveType: 'reconstruct',
            argument: reconstruction,
            openingStatement: this.#activeOpening ? `${phil.name}: ${this.#activeOpening.text}` : undefined,
          },
          {
            onText: () => {},
            onPhilosopherStatement: () => {},
            onReconstructResult: (data) => {
              this.#statusText.setAlpha(0);
              // Show judge commentary in dialogue area
              if (data.judgeScores && data.judgeScores.commentary) {
                this.#dialogueText.y = this.#dialogueAreaTop;
                this.#dialogueText.setText(`JUDGE: ${data.judgeScores.commentary}`);
                this.#autoScrollDialogue();
                this.#transcriptAdd('judge', 'Judge', `(on your reconstruction) ${data.judgeScores.commentary}`);
              }
            },
            onJudging: () => {
              this.#statusText.setText('The judge evaluates your reconstruction...').setAlpha(1);
            },
            onResult: (data) => {
              this.#statusText.setAlpha(0);
              this.#prevPhilHp = this.#philosopherHp;
              this.#prevPlayerHp = this.#playerHp;
              this.#playerHp = data.battle.playerHp;
              this.#philosopherHp = data.battle.philosopherHp;
              this.#exchanges = data.battle.exchanges;
              this.#pendingJudgeData = data;
              // Store oneShot flag for DAMAGE_ANIM
              this.#pendingJudgeData._isReconstruct = true;
              this.#pendingJudgeData._oneShot = data.oneShot || false;
              this.#stateMachine.setState(DEBATE_STATES.DAMAGE_ANIM);
            },
            onBattleEnd: (reward) => {
              this.#battleReward = reward;
            },
            onDone: () => {
              this.#statusText.setAlpha(0);
            },
            onError: (err) => {
              this.#statusText.setAlpha(0);
              this.#battleMenu.updateInfoPaneMessagesAndWaitForInput(
                [`Error: ${err}. Press SPACE to continue.`],
                () => {
                  this.#stateMachine.setState(DEBATE_STATES.PLAYER_INPUT);
                },
              );
              this._controls.lockInput = false;
            },
          },
        );
      }
    });

    // Prevent Phaser from capturing keyboard input while typing
    const stopPhaserCapture = (e) => e.stopPropagation();
    this.#textInput.addEventListener('keydown', stopPhaserCapture);
    this.#textInput.addEventListener('keyup', stopPhaserCapture);
    this.#textInput.addEventListener('keypress', stopPhaserCapture);

    document.body.appendChild(this.#textInput);
    document.body.appendChild(this.#submitButton);
    this.#textInput.focus();
  }

  /**
   * Show an HTML overlay with structured judge feedback (commentary, scores, damage).
   * Replaces the old info-pane approach so players can read and scroll judge output.
   * @param {object} judgeData - The data object from onResult (judgeScores, damage, combo, etc.)
   * @param {boolean} isReconstruct - Whether this was a reconstruct move
   * @param {boolean} isOneShot - Whether this was a one-shot kill
   */
  #showJudgeOverlay(judgeData, isReconstruct = false, isOneShot = false) {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scores = judgeData.judgeScores || {};
    const dmg = judgeData.damage || {};
    const keyItemBonus = isReconstruct ? 0 : dataManager.getKeyItemBonus(this.#selectedMoveType);

    // Build HTML content
    let html = '';

    // Philosopher reaction
    if (scores.philosopher_reaction) {
      html += `<div style="font-style:italic;color:#c792ea;margin-bottom:10px;border-left:3px solid #533483;padding-left:10px;">${scores.philosopher_reaction}</div>`;
    }

    // Judge commentary on player's argument
    if (scores.commentary) {
      html += `<div style="margin-bottom:12px;"><span style="color:#c792ea;font-weight:bold;">JUDGE</span> <span style="color:#82aaff;font-size:11px;">(your argument)</span><span style="color:#c792ea;font-weight:bold;">:</span> ${scores.commentary}</div>`;
    }

    // Counter judge commentary on philosopher's response (when available)
    const counterScores = judgeData.counterJudgeScores;
    if (counterScores && counterScores.commentary) {
      html += `<div style="margin-bottom:12px;"><span style="color:#f78c6c;font-weight:bold;">JUDGE</span> <span style="color:#82aaff;font-size:11px;">(their counter)</span><span style="color:#f78c6c;font-weight:bold;">:</span> ${counterScores.commentary}</div>`;
    }

    // One-shot display
    if (isOneShot) {
      html += `<div style="color:#ffcc00;font-weight:bold;font-size:15px;margin-bottom:10px;">PERFECT RECONSTRUCTION! You saw right through their argument!</div>`;
    } else if (isReconstruct && dmg.weightedScore >= 5) {
      html += `<div style="color:#ffcc00;font-weight:bold;margin-bottom:10px;">STRONG RECONSTRUCTION!</div>`;
    }

    // Score section
    if (!isOneShot) {
      html += '<div style="margin-top:8px;border-top:1px solid #533483;padding-top:8px;">';

      if (isReconstruct) {
        // Reconstruct scores
        html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;">';
        if (scores.accuracy !== undefined) html += `<span>Accuracy: <b>${scores.accuracy}/10</b></span>`;
        if (scores.charity !== undefined) html += `<span>Charity: <b>${scores.charity}/10</b></span>`;
        if (scores.critique !== undefined) html += `<span>Critique: <b>${scores.critique}/10</b></span>`;
        html += '</div>';
      } else {
        // Standard 6-dimension scores
        html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;">';
        const dimNames = {
          logical_validity: 'Logic',
          engagement: 'Engage',
          philosophical_precision: 'Precision',
          rhetorical_clarity: 'Clarity',
          originality: 'Original',
          dialectical_awareness: 'Dialectic',
        };
        for (const [dim, label] of Object.entries(dimNames)) {
          if (scores[dim] !== undefined) {
            html += `<span>${label}: <b>${scores[dim]}</b></span>`;
          }
        }
        html += '</div>';
      }

      // Summary line
      let scoreLine = `<div style="font-size:14px;"><b>Score: ${(dmg.weightedScore + keyItemBonus).toFixed(1)}/10</b>`;
      if (keyItemBonus > 0) scoreLine += ` <span style="color:#ffcc00;">(+${keyItemBonus.toFixed(1)} item)</span>`;
      if (dmg.firstExchange) {
        scoreLine += ` &mdash; You deal <span style="color:#ff6b6b;">${dmg.playerDamage} dmg</span> <span style="color:#ffcc00;">(opening shot!)</span>`;
      } else {
        scoreLine += ` &mdash; You deal <span style="color:#ff6b6b;">${dmg.playerDamage} dmg</span>, take <span style="color:#ff6b6b;">${dmg.philosopherDamage} dmg</span>`;
      }
      if (dmg.typeEffective) scoreLine += ' &mdash; <span style="color:#ffcc00;">SUPER EFFECTIVE!</span>';
      if (judgeData.combo) scoreLine += ` &mdash; <span style="color:#ffcc00;font-weight:bold;">${judgeData.combo.name}! (+${judgeData.combo.bonus})</span>`;
      scoreLine += '</div>';
      html += scoreLine;
      html += '</div>';
    }

    // Create overlay div
    const overlay = document.createElement('div');
    overlay.id = 'ethica-judge-overlay';
    overlay.style.cssText = `
      position: fixed;
      left: ${rect.left + 20}px;
      top: ${rect.top + 30}px;
      width: ${rect.width - 40}px;
      max-height: ${rect.height - 80}px;
      background: rgba(15, 52, 96, 0.95);
      color: #e0e0e0;
      border: 2px solid #533483;
      border-radius: 8px;
      padding: 16px 20px;
      font-family: '${KENNEY_FUTURE_NARROW_FONT_NAME}', monospace;
      font-size: 14px;
      line-height: 1.6;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    `;
    overlay.innerHTML = html;

    // Continue button
    const btn = document.createElement('button');
    btn.textContent = 'CONTINUE';
    btn.style.cssText = `
      display: block;
      margin: 14px auto 0 auto;
      width: 180px;
      height: 40px;
      background: #533483;
      color: #ffffff;
      border: 2px solid #c792ea;
      border-radius: 6px;
      font-family: '${KENNEY_FUTURE_NARROW_FONT_NAME}', monospace;
      font-size: 14px;
      cursor: pointer;
    `;
    btn.addEventListener('click', () => {
      this.#hideJudgeOverlay();
      this.#stateMachine.setState(DEBATE_STATES.POST_EXCHANGE_CHECK);
    });
    overlay.appendChild(btn);

    // Keyboard dismiss (SPACE or Enter)
    this.#judgeOverlayKeyHandler = (e) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.#hideJudgeOverlay();
        this.#stateMachine.setState(DEBATE_STATES.POST_EXCHANGE_CHECK);
      }
    };
    document.addEventListener('keydown', this.#judgeOverlayKeyHandler);

    document.body.appendChild(overlay);
    this.#judgeOverlay = overlay;
  }

  /** Remove the judge overlay from the DOM and clean up listeners. */
  #hideJudgeOverlay() {
    if (this.#judgeOverlay) {
      this.#judgeOverlay.remove();
      this.#judgeOverlay = null;
    }
    if (this.#judgeOverlayKeyHandler) {
      document.removeEventListener('keydown', this.#judgeOverlayKeyHandler);
      this.#judgeOverlayKeyHandler = null;
    }
  }

  /** Open the bag overlay with 5 tabs. */
  #showBagOverlay() {
    this.#battleMenu.hideMainBattleMenu();
    this.#bagTab = 0;
    this.#bagScrollIndex = 0;

    const { width, height } = this.scale;
    this.#bagOverlay = this.add.container(0, 0);
    this.#bagOverlay.setDepth(500);

    // Dark overlay
    const overlay = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x000000,
      0.6,
    );
    this.#bagOverlay.add(overlay);

    // Background image
    const bg = this.add
      .image(0, 0, INVENTORY_ASSET_KEYS.INVENTORY_BACKGROUND)
      .setOrigin(0)
      .setAlpha(0.9);
    this.#bagOverlay.add(bg);

    // Bag icon
    const bagImg = this.add
      .image(40, 120, INVENTORY_ASSET_KEYS.INVENTORY_BAG)
      .setOrigin(0)
      .setScale(0.5);
    this.#bagOverlay.add(bagImg);

    // Main panel (NineSlice)
    const mainPanel = this.#nineSlice
      .createNineSliceContainer(this, 700, 360, UI_ASSET_KEYS.MENU_BACKGROUND)
      .setPosition(300, 20);
    const panelBg = this.add
      .rectangle(4, 4, 692, 352, 0xffff88)
      .setOrigin(0)
      .setAlpha(0.6);
    mainPanel.add(panelBg);
    this.#bagOverlay.add(mainPanel);
    this.#bagOverlay.setData('mainPanel', mainPanel);

    // Title panel (NineSlice)
    const titlePanel = this.#nineSlice
      .createNineSliceContainer(this, 240, 64, UI_ASSET_KEYS.MENU_BACKGROUND)
      .setPosition(64, 20);
    const titleBg = this.add
      .rectangle(4, 4, 232, 56, 0xffff88)
      .setOrigin(0)
      .setAlpha(0.6);
    titlePanel.add(titleBg);
    this.#bagOverlay.add(titlePanel);
    this.#bagOverlay.setData('titlePanel', titlePanel);

    // Description text
    const descText = this.add.text(25, 420, '', {
      fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
      color: '#ffffff',
      fontSize: '25px',
      wordWrap: { width: width - 40 },
    });
    this.#bagOverlay.add(descText);
    this.#bagOverlay.setData('descText', descText);

    // One-line key hint (Cameron's playtest note: the tabs were invisible —
    // players only found them by accident). Sits just under the main panel.
    const tabHint = this.add
      .text(994, 386, '◄ ► switch tabs', {
        fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
        color: '#ffffff',
        fontSize: '16px',
      })
      .setOrigin(1, 0)
      .setAlpha(0.9);
    this.#bagOverlay.add(tabHint);

    // Cursor
    this.#bagCursor = this.add
      .image(30, 30, UI_ASSET_KEYS.CURSOR)
      .setScale(3);
    mainPanel.add(this.#bagCursor);

    this.#renderBagContents();
  }

  /** Render the contents of the currently selected bag tab. */
  #renderBagContents() {
    /** @type {Phaser.GameObjects.Container} */
    const mainPanel = this.#bagOverlay.getData('mainPanel');
    /** @type {Phaser.GameObjects.Container} */
    const titlePanel = this.#bagOverlay.getData('titlePanel');
    /** @type {Phaser.GameObjects.Text} */
    const descText = this.#bagOverlay.getData('descText');

    // Remove old content (keep first 11: 9 NineSlice pieces + bg rect + cursor)
    while (mainPanel.list.length > 11) {
      const child = mainPanel.list[11];
      child.destroy();
      mainPanel.remove(child);
    }
    while (titlePanel.list.length > 10) {
      const child = titlePanel.list[10];
      child.destroy();
      titlePanel.remove(child);
    }

    const ITEM_STYLE = {
      fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
      color: '#000000',
      fontSize: '30px',
    };
    const ITEM_X = 50;
    // Content starts below the tab header bar rendered above the items.
    const ITEM_Y = 60;
    const ITEM_SPACE = 50;
    // The selection cursor centers on a row: row text top + 16 (was 30 when
    // rows started at y=14).
    const CURSOR_BASE_Y = ITEM_Y + 16;

    const tabNames = ['Toolkit', 'Items', 'Beliefs', 'Key Items', 'Party', 'Agree'];
    const titleText = this.add
      .text(116, 28, tabNames[this.#bagTab], ITEM_STYLE)
      .setOrigin(0.5);
    titlePanel.add(titleText);

    // --- Tab header bar: every tab visible, active one highlighted, with
    // ◄ ► edge arrows (dimmed when no further tab in that direction) ---
    const TAB_BAR_Y = 10;
    const leftArrow = this.add
      .text(18, TAB_BAR_Y, '◄', {
        fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
        color: '#000000',
        fontSize: '20px',
      })
      .setAlpha(this.#bagTab > 0 ? 0.9 : 0.25);
    const rightArrow = this.add
      .text(674, TAB_BAR_Y, '►', {
        fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
        color: '#000000',
        fontSize: '20px',
      })
      .setOrigin(1, 0)
      .setAlpha(this.#bagTab < tabNames.length - 1 ? 0.9 : 0.25);
    mainPanel.add([leftArrow, rightArrow]);

    const TAB_SLOT_LEFT = 44;
    const TAB_SLOT_WIDTH = (660 - TAB_SLOT_LEFT) / tabNames.length;
    /** @type {Phaser.GameObjects.Text[]} */
    const tabTexts = [];
    tabNames.forEach((name, i) => {
      const isActive = i === this.#bagTab;
      const centerX = TAB_SLOT_LEFT + (i + 0.5) * TAB_SLOT_WIDTH;
      const tabText = this.add
        .text(centerX, TAB_BAR_Y, name, {
          fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
          color: isActive ? '#000000' : '#8a8a66',
          fontSize: isActive ? '19px' : '17px',
        })
        .setOrigin(0.5, 0);
      tabText.setData('active', isActive);
      mainPanel.add(tabText);
      tabTexts.push(tabText);
      if (isActive) {
        const underline = this.add
          .rectangle(centerX, TAB_BAR_Y + 26, tabText.width + 10, 3, 0x000000, 0.85)
          .setOrigin(0.5, 0);
        mainPanel.add(underline);
      }
    });
    this.#bagOverlay.setData('tabTexts', tabTexts);

    // Separator under the tab bar
    const tabSeparator = this.add.rectangle(14, 44, 672, 2, 0x000000, 0.22).setOrigin(0);
    mainPanel.add(tabSeparator);

    // Ensure cursor is in the main panel
    if (this.#bagCursor && !mainPanel.list.includes(this.#bagCursor)) {
      mainPanel.add(this.#bagCursor);
    }

    if (this.#bagTab === 0) {
      // --- TOOLKIT tab ---
      const toolkitItems = dataManager.getToolkitItems();
      const moveNames = {
        counterexample: 'Counterexample',
        reductio: 'Reductio',
        socratic_questioning: 'Socratic Q.',
        framework_shift: 'Framework Shift',
      };
      const moveDescs = {
        counterexample: 'Auto-generates a counterexample argument for you.',
        reductio: 'Auto-generates a reductio ad absurdum for you.',
        socratic_questioning: 'Auto-generates a Socratic question for you.',
        framework_shift: 'Auto-generates a framework shift argument for you.',
      };
      const entries = Object.entries(toolkitItems);

      entries.forEach(([moveType, count], i) => {
        const y = ITEM_Y + i * ITEM_SPACE;
        const color = count > 0 ? '#000000' : '#999999';
        const nameText = this.add.text(
          ITEM_X,
          y,
          moveNames[moveType] || moveType,
          { ...ITEM_STYLE, color },
        );
        const qSign = this.add.text(520, y + 2, 'x', {
          color,
          fontSize: '30px',
          fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
        });
        const qNum = this.add.text(550, y, `${count}`, {
          ...ITEM_STYLE,
          color,
        });
        mainPanel.add([nameText, qSign, qNum]);
      });

      // Cancel
      const cancelText = this.add.text(
        ITEM_X,
        ITEM_Y + entries.length * ITEM_SPACE,
        'Cancel',
        ITEM_STYLE,
      );
      mainPanel.add(cancelText);

      const cursorY = CURSOR_BASE_Y + this.#bagScrollIndex * ITEM_SPACE;
      this.#bagCursor.setPosition(30, cursorY).setVisible(true);

      const moveKeys = Object.keys(toolkitItems);
      if (this.#bagScrollIndex < moveKeys.length) {
        const key = moveKeys[this.#bagScrollIndex];
        const count = toolkitItems[key];
        descText.setText(
          count > 0 ? moveDescs[key] : `${moveNames[key]} - none remaining.`,
        );
      } else {
        descText.setText('Close your bag, and go back to debating!');
      }
    } else if (this.#bagTab === 1) {
      // --- ITEMS tab ---
      const inventory = dataManager.getInventory(this);
      if (!inventory || inventory.length === 0) {
        const empty = this.add.text(
          ITEM_X,
          ITEM_Y,
          'No items in your bag.',
          ITEM_STYLE,
        );
        mainPanel.add(empty);
        this.#bagCursor.setVisible(false);
        descText.setText('');
      } else {
        inventory.forEach((invEntry, i) => {
          const y = ITEM_Y + i * ITEM_SPACE;
          // Gray out capture items if philosopher HP > 50%
          const isCaptureItem = invEntry.item.category === 'CAPTURE';
          const tooHealthy =
            isCaptureItem &&
            this.#philosopherHp > this.#maxPhilosopherHp * 0.5;
          const color = tooHealthy ? '#999999' : '#000000';

          const nameText = this.add.text(ITEM_X, y, invEntry.item.name, {
            ...ITEM_STYLE,
            color,
          });
          const qSign = this.add.text(520, y + 2, 'x', {
            color,
            fontSize: '30px',
            fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
          });
          const qNum = this.add.text(550, y, `${invEntry.quantity}`, {
            ...ITEM_STYLE,
            color,
          });
          mainPanel.add([nameText, qSign, qNum]);
        });

        // Cancel
        const cancelText = this.add.text(
          ITEM_X,
          ITEM_Y + inventory.length * ITEM_SPACE,
          'Cancel',
          ITEM_STYLE,
        );
        mainPanel.add(cancelText);

        const cursorY = CURSOR_BASE_Y + this.#bagScrollIndex * ITEM_SPACE;
        this.#bagCursor.setPosition(30, cursorY).setVisible(true);

        if (this.#bagScrollIndex < inventory.length) {
          const item = inventory[this.#bagScrollIndex];
          descText.setText(item.item.description || item.item.name);
        } else {
          descText.setText('Close your bag, and go back to debating!');
        }
      }
    } else if (this.#bagTab === 2) {
      // --- BELIEFS tab ---
      const beliefs = dataManager.getBeliefs();
      if (beliefs.length === 0) {
        const empty = this.add.text(
          ITEM_X,
          ITEM_Y,
          'No beliefs recorded yet.',
          ITEM_STYLE,
        );
        const empty2 = this.add.text(
          ITEM_X,
          ITEM_Y + ITEM_SPACE,
          'Agree with philosophers',
          ITEM_STYLE,
        );
        const empty3 = this.add.text(
          ITEM_X,
          ITEM_Y + ITEM_SPACE * 2,
          'to record beliefs.',
          ITEM_STYLE,
        );
        mainPanel.add([empty, empty2, empty3]);
        this.#bagCursor.setVisible(false);
        descText.setText('');
      } else {
        beliefs.forEach((belief, i) => {
          const y = ITEM_Y + i * ITEM_SPACE;
          const txt = this.add.text(
            ITEM_X,
            y,
            belief.philosopherId,
            ITEM_STYLE,
          );
          mainPanel.add(txt);
        });

        const cancelText = this.add.text(
          ITEM_X,
          ITEM_Y + beliefs.length * ITEM_SPACE,
          'Cancel',
          ITEM_STYLE,
        );
        mainPanel.add(cancelText);

        const cursorY = CURSOR_BASE_Y + this.#bagScrollIndex * ITEM_SPACE;
        this.#bagCursor.setPosition(30, cursorY).setVisible(true);

        if (this.#bagScrollIndex < beliefs.length) {
          const b = beliefs[this.#bagScrollIndex];
          descText.setText(`${b.philosopherId}: "${b.claim}"`);
        } else {
          descText.setText('Close your bag, and go back to debating!');
        }
      }
    } else if (this.#bagTab === 3) {
      // --- KEY ITEMS tab ---
      const keyItems = dataManager.getUnlockedKeyItems
        ? dataManager.getUnlockedKeyItems()
        : [];
      if (keyItems.length === 0) {
        const empty = this.add.text(
          ITEM_X,
          ITEM_Y,
          'No key items yet.',
          ITEM_STYLE,
        );
        const empty2 = this.add.text(
          ITEM_X,
          ITEM_Y + ITEM_SPACE,
          'Defeat gym leaders to',
          ITEM_STYLE,
        );
        const empty3 = this.add.text(
          ITEM_X,
          ITEM_Y + ITEM_SPACE * 2,
          'earn key items.',
          ITEM_STYLE,
        );
        mainPanel.add([empty, empty2, empty3]);
        this.#bagCursor.setVisible(false);
        descText.setText('');
      } else {
        keyItems.forEach((item, i) => {
          const y = ITEM_Y + i * ITEM_SPACE;
          const txt = this.add.text(ITEM_X, y, item.name, ITEM_STYLE);
          mainPanel.add(txt);
        });
        const cancelText = this.add.text(
          ITEM_X,
          ITEM_Y + keyItems.length * ITEM_SPACE,
          'Cancel',
          ITEM_STYLE,
        );
        mainPanel.add(cancelText);

        const cursorY = CURSOR_BASE_Y + this.#bagScrollIndex * ITEM_SPACE;
        this.#bagCursor.setPosition(30, cursorY).setVisible(true);

        if (this.#bagScrollIndex < keyItems.length) {
          descText.setText(keyItems[this.#bagScrollIndex].description);
        } else {
          descText.setText('Close your bag, and go back to debating!');
        }
      }
    } else if (this.#bagTab === 4) {
      // --- PARTY tab ---
      const party = dataManager.store.get(DATA_MANAGER_STORE_KEYS.MONSTERS_IN_PARTY);
      const philosophers = party.filter((m) => m.isPhilosopher === true);

      // "STUDENT (You)" option to switch back
      const studentOpt = this.add.text(
        ITEM_X,
        ITEM_Y,
        'STUDENT (You)',
        ITEM_STYLE,
      );
      mainPanel.add(studentOpt);

      philosophers.forEach((phil, i) => {
        const y = ITEM_Y + (i + 1) * ITEM_SPACE;
        const txt = this.add.text(ITEM_X, y, phil.name, ITEM_STYLE);
        mainPanel.add(txt);
      });

      // Cancel
      const cancelText = this.add.text(
        ITEM_X,
        ITEM_Y + (philosophers.length + 1) * ITEM_SPACE,
        'Cancel',
        ITEM_STYLE,
      );
      mainPanel.add(cancelText);

      const cursorY = CURSOR_BASE_Y + this.#bagScrollIndex * ITEM_SPACE;
      this.#bagCursor.setPosition(30, cursorY).setVisible(true);

      if (this.#bagScrollIndex === 0) {
        descText.setText('Switch back to your student self.');
      } else if (this.#bagScrollIndex <= philosophers.length) {
        const p = philosophers[this.#bagScrollIndex - 1];
        descText.setText(
          `${p.name} - ${p.tradition || 'Philosopher'} (Lv.${p.currentLevel})`,
        );
      } else {
        descText.setText('Close your bag, and go back to debating!');
      }
    } else if (this.#bagTab === 5) {
      // --- AGREE tab ---
      const agreeText = this.add.text(
        ITEM_X,
        ITEM_Y,
        'I agree with this',
        ITEM_STYLE,
      );
      mainPanel.add(agreeText);

      // Cancel
      const cancelText = this.add.text(
        ITEM_X,
        ITEM_Y + ITEM_SPACE,
        'Cancel',
        ITEM_STYLE,
      );
      mainPanel.add(cancelText);

      const cursorY = CURSOR_BASE_Y + this.#bagScrollIndex * ITEM_SPACE;
      this.#bagCursor.setPosition(30, cursorY).setVisible(true);

      if (this.#bagScrollIndex === 0) {
        descText.setText(
          'Accept the philosopher\'s position. Ends the debate, grants partial XP.',
        );
      } else {
        descText.setText('Close your bag, and go back to debating!');
      }
    }
  }

  /** Handle directional/action input while the bag overlay is open. */
  #handleBagInput() {
    if (this._controls.wasBackKeyPressed()) {
      this.#closeBagOverlay();
      return;
    }

    const dir = this._controls.getDirectionKeyJustPressed();

    // Tab switching
    if (dir === DIRECTION.LEFT && this.#bagTab > 0) {
      this.#bagTab--;
      this.#bagScrollIndex = 0;
      this.#renderBagContents();
      return;
    }
    if (dir === DIRECTION.RIGHT && this.#bagTab < 5) {
      this.#bagTab++;
      this.#bagScrollIndex = 0;
      this.#renderBagContents();
      return;
    }

    // Item navigation
    const itemCount = this.#getBagItemCount();
    if (dir === DIRECTION.DOWN) {
      this.#bagScrollIndex++;
      if (this.#bagScrollIndex > itemCount) {
        this.#bagScrollIndex = 0;
      }
      this.#renderBagContents();
      return;
    }
    if (dir === DIRECTION.UP) {
      this.#bagScrollIndex--;
      if (this.#bagScrollIndex < 0) {
        this.#bagScrollIndex = itemCount;
      }
      this.#renderBagContents();
      return;
    }

    // Selection
    if (this._controls.wasSpaceKeyPressed()) {
      // Cancel option is always the last item
      if (this.#bagScrollIndex >= itemCount) {
        this.#closeBagOverlay();
        return;
      }

      if (this.#bagTab === 0) {
        // Toolkit tab
        const toolkitItems = dataManager.getToolkitItems();
        const moveTypes = Object.keys(toolkitItems);
        const selectedMove = moveTypes[this.#bagScrollIndex];
        if (selectedMove && toolkitItems[selectedMove] > 0) {
          this.#useToolkitItem(selectedMove);
        }
      } else if (this.#bagTab === 1) {
        // Items tab
        const inventory = dataManager.getInventory(this);
        if (inventory && this.#bagScrollIndex < inventory.length) {
          const invEntry = inventory[this.#bagScrollIndex];
          const isCaptureItem = invEntry.item.category === 'CAPTURE';

          if (isCaptureItem) {
            if (this.#philosopherHp <= this.#maxPhilosopherHp * 0.5) {
              // Consume capture item and attempt capture
              dataManager.updateInventory(
                inventory
                  .map((it) =>
                    it.item.id === invEntry.item.id
                      ? { ...it, quantity: it.quantity - 1 }
                      : it,
                  )
                  .filter((it) => it.quantity > 0),
              );
              this.#closeBagOverlay(false);
              this.#stateMachine.setState(DEBATE_STATES.CAPTURE_ATTEMPT);
            } else {
              this.#closeBagOverlay(false);
              this.#battleMenu.updateInfoPaneMessageNoInputRequired(
                'The philosopher is too healthy to capture!',
                () => {
                  this.time.delayedCall(1500, () => {
                    this.#battleMenu.showMainBattleMenu();
                  });
                },
              );
            }
          } else {
            // Heal item — parse heal amount from effect string (e.g. "HEAL_30")
            const healMatch = invEntry.item.effect?.match(/HEAL_(\d+)/);
            const healAmount = healMatch ? parseInt(healMatch[1], 10) : 20;
            this.#playerHp = Math.min(
              this.#maxPlayerHp,
              this.#playerHp + healAmount,
            );
            this.#prevPlayerHp = this.#playerHp;
            this.#prevPhilHp = this.#philosopherHp;
            dataManager.updateInventory(
              inventory
                .map((it) =>
                  it.item.id === invEntry.item.id
                    ? { ...it, quantity: it.quantity - 1 }
                    : it,
                )
                .filter((it) => it.quantity > 0),
            );
            this.#activePlayerMonster.updateMonsterHealth(this.#playerHp);
            this.#closeBagOverlay();
            this.#battleMenu.updateInfoPaneMessageNoInputRequired(
              `Used ${invEntry.item.name}! Recovered ${healAmount} resolve.`,
            );
          }
        }
      } else if (this.#bagTab === 4) {
        // Party tab
        const party = dataManager.store.get(
          DATA_MANAGER_STORE_KEYS.MONSTERS_IN_PARTY,
        );
        const philosophers = party.filter((m) => m.isPhilosopher === true);

        if (this.#bagScrollIndex === 0) {
          // Switch back to student
          this.#pendingSwitchPhilosopher = null;
        } else if (this.#bagScrollIndex <= philosophers.length) {
          this.#pendingSwitchPhilosopher =
            philosophers[this.#bagScrollIndex - 1];
        }
        this.#closeBagOverlay(false);
        this.#stateMachine.setState(DEBATE_STATES.SWITCH_PHILOSOPHER);
      }
      // Beliefs and Key Items tabs are view-only
      else if (this.#bagTab === 5) {
        // Agree tab — accept philosopher's position
        this.#closeBagOverlay(false);
        this.#stateMachine.setState(DEBATE_STATES.AGREE);
      }
    }
  }

  /**
   * Get the number of selectable items in the current bag tab (excluding Cancel).
   * @returns {number}
   */
  #getBagItemCount() {
    if (this.#bagTab === 0) {
      return Object.keys(dataManager.getToolkitItems()).length;
    } else if (this.#bagTab === 1) {
      const inv = dataManager.getInventory(this);
      return inv ? inv.length : 0;
    } else if (this.#bagTab === 2) {
      return Math.max(0, dataManager.getBeliefs().length);
    } else if (this.#bagTab === 3) {
      const keyItems = dataManager.getUnlockedKeyItems
        ? dataManager.getUnlockedKeyItems()
        : [];
      return keyItems.length;
    } else if (this.#bagTab === 4) {
      // Party tab: student + captured philosophers
      const party = dataManager.store.get(
        DATA_MANAGER_STORE_KEYS.MONSTERS_IN_PARTY,
      );
      const philosophers = party.filter((m) => m.isPhilosopher === true);
      return philosophers.length + 1; // +1 for STUDENT option
    } else if (this.#bagTab === 5) {
      // Agree tab: just the "I agree" option
      return 1;
    } else {
      return 0;
    }
  }

  /**
   * Use a toolkit consumable: close bag, trigger LLM-generated argument
   * via the [TOOLKIT] sentinel path on the server.
   * @param {string} moveType
   */
  #useToolkitItem(moveType) {
    const used = dataManager.useToolkitItem(moveType);
    if (!used) return;

    this.#closeBagOverlay(false);
    this.#selectedMoveType = moveType;
    this.#selectedMoveIndex = MOVE_TYPES.findIndex((m) => m.id === moveType);

    // Trigger the LLM generation path — server detects '[TOOLKIT]' and
    // generates a full argument via Claude
    this.#playerArgument = '[TOOLKIT]';
    this.#stateMachine.setState(DEBATE_STATES.PHILOSOPHER_RESPONDS);
  }

  /** Close the bag overlay. Shows the battle menu unless suppressed. */
  #closeBagOverlay(showMenu = true) {
    if (this.#bagOverlay) {
      this.#bagOverlay.destroy(true);
      this.#bagOverlay = null;
      this.#bagCursor = null;
    }
    if (showMenu) {
      this.#battleMenu.showMainBattleMenu();
    }
  }

  /** Create the ESC pause menu (RESUME / SAVE / EXIT TO TITLE). */
  #createPauseMenu() {
    const { width, height } = this.scale;
    this.#pauseMenu = this.add.container(0, 0);
    this.#pauseMenu.setDepth(1000);

    // Dark overlay
    const overlay = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x000000,
      0.6,
    );
    this.#pauseMenu.add(overlay);

    // Panel
    const panelW = 280;
    const panelH = 255;
    const panel = this.add
      .rectangle(width / 2, height / 2, panelW, panelH, 0x16213e, 0.95)
      .setStrokeStyle(2, 0x533483);
    this.#pauseMenu.add(panel);

    // Title
    const title = this.add
      .text(width / 2, height / 2 - 95, 'PAUSED', {
        fontSize: '22px',
        fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
        color: '#c792ea',
      })
      .setOrigin(0.5);
    this.#pauseMenu.add(title);

    // Options
    const options = ['RESUME', 'BAG', 'SAVE', 'EXIT TO TITLE'];
    const optionTexts = [];
    options.forEach((label, i) => {
      const y = height / 2 - 45 + i * 45;
      const bg = this.add
        .rectangle(width / 2, y, 220, 36, 0x0f3460, 0.8)
        .setStrokeStyle(1, 0x533483);
      bg.setData('index', i);

      const txt = this.add
        .text(width / 2, y, label, {
          fontSize: '16px',
          fontFamily: KENNEY_FUTURE_NARROW_FONT_NAME,
          color: '#e0e0e0',
        })
        .setOrigin(0.5);

      optionTexts.push({ bg, txt });
      this.#pauseMenu.add([bg, txt]);
    });

    this.#pauseMenu.setData('optionTexts', optionTexts);
    this.#pauseMenu.setVisible(false);
  }

  /** Show the pause menu overlay. */
  #showPauseMenu() {
    this.#pauseMenuVisible = true;
    this.#pauseMenuSelection = 0;
    this.#pauseMenu.setVisible(true);
    this.#updatePauseMenuSelection();
  }

  /** Hide the pause menu overlay. */
  #hidePauseMenu() {
    this.#pauseMenuVisible = false;
    this.#pauseMenu.setVisible(false);
  }

  /** Highlight the currently selected pause menu option. */
  #updatePauseMenuSelection() {
    const optionTexts = this.#pauseMenu.getData('optionTexts');
    if (!optionTexts) return;
    optionTexts.forEach(({ bg, txt }, i) => {
      if (i === this.#pauseMenuSelection) {
        bg.setFillStyle(0x533483, 0.9);
        bg.setStrokeStyle(2, 0xc792ea);
        txt.setColor('#ffffff');
      } else {
        bg.setFillStyle(0x0f3460, 0.8);
        bg.setStrokeStyle(1, 0x533483);
        txt.setColor('#e0e0e0');
      }
    });
  }

  /** Execute the selected pause menu action. */
  #handlePauseMenuAction() {
    switch (this.#pauseMenuSelection) {
      case 0: // RESUME
        this.#hidePauseMenu();
        break;
      case 1: // BAG
        this.#hidePauseMenu();
        this.#showBagOverlay();
        break;
      case 2: // SAVE
        dataManager.saveData();
        dataManager.saveToServer();
        this.#battleMenu.updateInfoPaneMessageNoInputRequired('Game saved.');
        this.#hidePauseMenu();
        break;
      case 3: // EXIT TO TITLE
        dataManager.saveData();
        dataManager.saveToServer();
        this.#hideTextInput();
        this.#hideJudgeOverlay();
        if (this.#streamTimer && !this.#streamTimer.destroyed) {
          this.#streamTimer.destroy();
          this.#streamTimer = null;
        }
        this.cameras.main.fadeOut(600, 0, 0, 0);
        this.cameras.main.once(
          Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
          () => {
            this.scene.start(SCENE_KEYS.TITLE_SCENE);
          },
        );
        break;
    }
  }

  /** Clean up HTML elements and timers on scene shutdown. */
  shutdown() {
    this.#hideTextInput();
    this.#hideJudgeOverlay();
    if (this.#streamTimer && !this.#streamTimer.destroyed) {
      this.#streamTimer.destroy();
      this.#streamTimer = null;
    }
  }
}
