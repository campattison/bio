import Phaser from '../lib/phaser.js';
import { DIRECTION } from '../common/direction.js';
import { TEXT_SPEED } from '../config.js';
import { TEXT_SPEED_OPTIONS, BATTLE_SCENE_OPTIONS, BATTLE_STYLE_OPTIONS, SOUND_OPTIONS } from '../common/options.js';
import { exhaustiveGuard } from './guard.js';
import { DataUtils } from './data-utils.js';
import { GAME_FLAG } from '../types/typedef.js';
import { syncSave, pullRemote } from './save-sync.js';

const LOCAL_STORAGE_KEY = 'ETHICA_DATA';

/**
 * @typedef PlayerLocation
 * @type {object}
 * @property {string} area
 * @property {boolean} isInterior
 */

/**
 * @typedef MonsterData
 * @type {object}
 * @property {import('../types/typedef.js').Monster[]} inParty
 */

/**
 * @typedef GlobalState
 * @type {object}
 * @property {object} player
 * @property {object} player.position
 * @property {number} player.position.x
 * @property {number} player.position.y
 * @property {PlayerLocation} player.location
 * @property {import('../common/direction.js').Direction} player.direction
 * @property {PlayerLocation} player.location
 * @property {object} options
 * @property {import('../common/options.js').TextSpeedMenuOptions} options.textSpeed
 * @property {import('../common/options.js').BattleSceneMenuOptions} options.battleSceneAnimations
 * @property {import('../common/options.js').BattleStyleMenuOptions} options.battleStyle
 * @property {import('../common/options.js').SoundMenuOptions} options.sound
 * @property {import('../common/options.js').VolumeMenuOptions} options.volume
 * @property {import('../common/options.js').MenuColorOptions} options.menuColor
 * @property {boolean} gameStarted
 * @property {MonsterData} monsters
 * @property {import('../types/typedef.js').Inventory} inventory
 * @property {number[]} itemsPickedUp
 * @property {number[]} viewedEvents
 * @property {import('../types/typedef.js').GameFlag[]} flags
 * @property {string[]} defeatedNpcs
 * @property {object} ethica - ETHICA-specific game state
 * @property {number} ethica.playerXp - Total accumulated XP
 * @property {number} ethica.playerLevel - Player level (1-based)
 * @property {Object.<string, string[]>} ethica.toolkit - Philosophical Toolkit: philosopherId → array of concept strings
 * @property {string[]} ethica.defeatedGymLeaders - Philosopher ids of defeated gym leaders
 * @property {Object.<string, object>} ethica.debateHistory - Per-philosopher debate stats: philosopherId → { wins, losses, draws, bestScore }
 * @property {Array<{philosopherId: string, claim: string, topic: string, agreedAt: number}>} ethica.beliefs - Philosophical positions the player has agreed with
 */

/** @type {GlobalState} */
const initialState = {
  player: {
    position: {
      x: 0,
      y: 0,
    },
    direction: DIRECTION.DOWN,
    location: {
      area: 'main_1',
      isInterior: false,
    },
  },
  options: {
    textSpeed: TEXT_SPEED_OPTIONS.MID,
    battleSceneAnimations: BATTLE_SCENE_OPTIONS.ON,
    battleStyle: BATTLE_STYLE_OPTIONS.SHIFT,
    sound: SOUND_OPTIONS.ON,
    volume: 4,
    menuColor: 0,
  },
  gameStarted: false,
  monsters: {
    inParty: [],
  },
  inventory: [
    {
      item: {
        id: 1,
      },
      quantity: 10,
    },
    {
      item: {
        id: 2,
      },
      quantity: 5,
    },
  ],
  itemsPickedUp: [],
  viewedEvents: [],
  flags: [],
  defeatedNpcs: [],
  ethica: {
    playerXp: 0,
    playerLevel: 1,
    toolkit: {},
    toolkitItems: { counterexample: 0, reductio: 0, socratic_questioning: 0, framework_shift: 0 },
    defeatedGymLeaders: [],
    debateHistory: {},
    beliefs: [],
  },
};

export const DATA_MANAGER_STORE_KEYS = Object.freeze({
  PLAYER_POSITION: 'PLAYER_POSITION',
  PLAYER_DIRECTION: 'PLAYER_DIRECTION',
  PLAYER_LOCATION: 'PLAYER_LOCATION',
  OPTIONS_TEXT_SPEED: 'OPTIONS_TEXT_SPEED',
  OPTIONS_BATTLE_SCENE_ANIMATIONS: 'OPTIONS_BATTLE_SCENE_ANIMATIONS',
  OPTIONS_BATTLE_STYLE: 'OPTIONS_BATTLE_STYLE',
  OPTIONS_SOUND: 'OPTIONS_SOUND',
  OPTIONS_VOLUME: 'OPTIONS_VOLUME',
  OPTIONS_MENU_COLOR: 'OPTIONS_MENU_COLOR',
  GAME_STARTED: 'GAME_STARTED',
  MONSTERS_IN_PARTY: 'MONSTERS_IN_PARTY',
  INVENTORY: 'INVENTORY',
  ITEMS_PICKED_UP: 'ITEMS_PICKED_UP',
  VIEWED_EVENTS: 'VIEWED_EVENTS',
  FLAGS: 'FLAGS',
  DEFEATED_NPCS: 'DEFEATED_NPCS',
  ETHICA_PLAYER_XP: 'ETHICA_PLAYER_XP',
  ETHICA_PLAYER_LEVEL: 'ETHICA_PLAYER_LEVEL',
  ETHICA_TOOLKIT: 'ETHICA_TOOLKIT',
  ETHICA_DEFEATED_GYM_LEADERS: 'ETHICA_DEFEATED_GYM_LEADERS',
  ETHICA_DEBATE_HISTORY: 'ETHICA_DEBATE_HISTORY',
  ETHICA_BELIEFS: 'ETHICA_BELIEFS',
  ETHICA_TOOLKIT_ITEMS: 'ETHICA_TOOLKIT_ITEMS',
});

class DataManager extends Phaser.Events.EventEmitter {
  /** @type {Phaser.Data.DataManager} */
  #store;

  constructor() {
    super();
    this.#store = new Phaser.Data.DataManager(this);
    // initialize state with initial values
    this.#updateDataManger(initialState);
  }

  /** @type {Phaser.Data.DataManager} */
  get store() {
    return this.#store;
  }

  /**
   * @returns {void}
   */
  loadData() {
    // attempt to load data from browser storage and populate the data manager
    if (typeof Storage === 'undefined') {
      console.warn(
        `[${DataManager.name}:loadData] localStorage is not supported, will not be able to save and load data.`
      );
      return;
    }

    const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedData === null) {
      // No localStorage — try server file in background
      this.loadFromServer().then((serverData) => {
        if (serverData && serverData.player && serverData.player.position && serverData.options) {
          console.log(`[${DataManager.name}:loadData] restored from server save file`);
          this.#updateDataManger(serverData);
        }
      });
      return;
    }
    try {
      /** @type {GlobalState} */
      const parsedData = JSON.parse(savedData);
      this.#updateDataManger(parsedData);
    } catch (error) {
      console.warn(
        `[${DataManager.name}:loadData] encountered an error while attempting to load and parse saved data.`
      );
    }
  }

  /**
   * @returns {void}
   */
  saveData() {
    // attempt to storage data in browser storage from data manager
    if (typeof Storage === 'undefined') {
      console.warn(
        `[${DataManager.name}:saveData] localStorage is not supported, will not be able to save and load data.`
      );
      return;
    }
    const dataToSave = this.#dataManagerDataToGlobalStateObject();
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
  }

  /**
   * Sync game state to the proxy (v2 /api/save, PUT + access code) for
   * durability. localStorage remains the in-session source of truth; this is
   * fire-and-forget and graceful when the proxy is offline.
   */
  saveToServer() {
    const dataToSave = this.#dataManagerDataToGlobalStateObject();
    syncSave(dataToSave).catch((err) => {
      console.warn(`[${DataManager.name}:saveToServer] proxy save failed:`, err.message);
    });
  }

  /**
   * Load game state from the proxy save document. Returns the data or null.
   * @returns {Promise<GlobalState | null>}
   */
  async loadFromServer() {
    return pullRemote();
  }

  /**
   * @returns {void}
   */
  startNewGame() {
    // get existing data before resetting all of the data, so we can persist options data
    const existingData = { ...this.#dataManagerDataToGlobalStateObject() };
    existingData.player.position = { ...initialState.player.position };
    existingData.player.location = { ...initialState.player.location };
    existingData.player.direction = initialState.player.direction;
    existingData.player.location = { ...initialState.player.location };
    existingData.gameStarted = initialState.gameStarted;
    existingData.monsters = {
      inParty: [...initialState.monsters.inParty],
    };
    existingData.inventory = initialState.inventory;
    existingData.itemsPickedUp = [...initialState.itemsPickedUp];
    existingData.viewedEvents = [...initialState.viewedEvents];
    existingData.flags = [...initialState.flags];
    existingData.defeatedNpcs = [...initialState.defeatedNpcs];
    existingData.ethica = { ...initialState.ethica, toolkit: {}, toolkitItems: { counterexample: 0, reductio: 0, socratic_questioning: 0, framework_shift: 0 }, defeatedGymLeaders: [], debateHistory: {}, beliefs: [] };

    this.#store.reset();
    this.#updateDataManger(existingData);
    this.saveData();
  }

  /**
   * @returns {number}
   */
  getAnimatedTextSpeed() {
    /** @type {import('../common/options.js').TextSpeedMenuOptions | undefined} */
    const chosenTextSpeed = this.#store.get(DATA_MANAGER_STORE_KEYS.OPTIONS_TEXT_SPEED);
    if (chosenTextSpeed === undefined) {
      return TEXT_SPEED.MEDIUM;
    }

    switch (chosenTextSpeed) {
      case TEXT_SPEED_OPTIONS.FAST:
        return TEXT_SPEED.FAST;
      case TEXT_SPEED_OPTIONS.MID:
        return TEXT_SPEED.MEDIUM;
      case TEXT_SPEED_OPTIONS.SLOW:
        return TEXT_SPEED.SLOW;
      default:
        exhaustiveGuard(chosenTextSpeed);
    }
  }

  /**
   * @param {Phaser.Scene} scene
   * @returns {import('../types/typedef.js').InventoryItem[]}
   */
  getInventory(scene) {
    /** @type {import('../types/typedef.js').InventoryItem[]} */
    const items = [];
    /** @type {import('../types/typedef.js').Inventory} */
    const inventory = this.#store.get(DATA_MANAGER_STORE_KEYS.INVENTORY);
    inventory.forEach((baseItem) => {
      const item = DataUtils.getItem(scene, baseItem.item.id);
      items.push({
        item: item,
        quantity: baseItem.quantity,
      });
    });
    return items;
  }

  /**
   * @param {import('../types/typedef.js').InventoryItem[]} items
   * @returns {void}
   */
  updateInventory(items) {
    /** @type {import('../types/typedef.js').BaseInventoryItem[]} */
    const inventory = items.map((item) => {
      return {
        item: {
          id: item.item.id,
        },
        quantity: item.quantity,
      };
    });
    this.#store.set(DATA_MANAGER_STORE_KEYS.INVENTORY, inventory);
  }

  /**
   * @param {import('../types/typedef.js').Item} item
   * @param {number} quantity
   * @returns {void}
   */
  addItem(item, quantity) {
    /** @type {import('../types/typedef.js').Inventory} */
    const inventory = this.#store.get(DATA_MANAGER_STORE_KEYS.INVENTORY);
    const existingItem = inventory.find((inventoryItem) => {
      return inventoryItem.item.id === item.id;
    });
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      inventory.push({
        item,
        quantity,
      });
    }
    this.#store.set(DATA_MANAGER_STORE_KEYS.INVENTORY, inventory);
  }

  /**
   * @param {number} itemId
   * @returns {void}
   */
  addItemPickedUp(itemId) {
    /** @type {number[]} */
    const itemsPickedUp = this.#store.get(DATA_MANAGER_STORE_KEYS.ITEMS_PICKED_UP) || [];
    itemsPickedUp.push(itemId);
    this.#store.set(DATA_MANAGER_STORE_KEYS.ITEMS_PICKED_UP, itemsPickedUp);
  }

  /**
   * @returns {boolean}
   */
  isPartyFull() {
    const partySize = this.#store.get(DATA_MANAGER_STORE_KEYS.MONSTERS_IN_PARTY).length;
    return partySize === 6;
  }

  /**
   * Adds the provided eventId to the viewed events in the data manager so player does
   * not see the event again.
   * @param {number} eventId
   * @returns {void}
   */
  viewedEvent(eventId) {
    /** @type {Set<number>} */
    const viewedEvents = new Set(this.#store.get(DATA_MANAGER_STORE_KEYS.VIEWED_EVENTS) || []);
    viewedEvents.add(eventId);
    this.#store.set(DATA_MANAGER_STORE_KEYS.VIEWED_EVENTS, Array.from(viewedEvents));
  }

  /**
   * @returns {Set<string>}
   */
  getFlags() {
    return new Set(this.#store.get(DATA_MANAGER_STORE_KEYS.FLAGS) || []);
  }

  /**
   * @param {GAME_FLAG} flag
   * @returns {void}
   */
  addFlag(flag) {
    /** @type {Set<string>} */
    const existingFlags = new Set(this.#store.get(DATA_MANAGER_STORE_KEYS.FLAGS) || []);
    existingFlags.add(flag);
    this.#store.set(DATA_MANAGER_STORE_KEYS.FLAGS, Array.from(existingFlags));
  }

  /**
   * @param {GAME_FLAG} flag
   * @returns {void}
   */
  removeFlag(flag) {
    /** @type {Set<string>} */
    const existingFlags = new Set(this.#store.get(DATA_MANAGER_STORE_KEYS.FLAGS) || []);
    existingFlags.delete(flag);
    this.#store.set(DATA_MANAGER_STORE_KEYS.FLAGS, Array.from(existingFlags));
  }

  /**
   * Adds the provided npcId to the defeated npc set in the data manager so player does
   * not battle that npc again.
   * @param {number} npcId
   * @returns {void}
   */
  addDefeatedNpc(npcId) {
    /** @type {Set<number>} */
    const defeatedNpcs = this.#store.get(DATA_MANAGER_STORE_KEYS.DEFEATED_NPCS);
    defeatedNpcs.add(npcId);
  }

  /**
   * @returns {Set<number>}
   */
  getDefeatedNpcs() {
    return this.#store.get(DATA_MANAGER_STORE_KEYS.DEFEATED_NPCS);
  }

  // ─── ETHICA Key Items ────────────────────────────────────

  /**
   * Philosophical key items — unlocked by defeating gym leaders.
   * Each provides a gameplay bonus displayed in debates.
   */
  static KEY_ITEMS = Object.freeze([
    {
      id: 'phronesis_compass',
      name: 'Phronesis Compass',
      description: 'Guides you toward the practical wisdom in any argument. +5% score on Counterexample moves.',
      requiredGymLeaders: 2,
      bonus: { moveType: 'counterexample', scoreBoost: 0.5 },
    },
    {
      id: 'genealogical_lens',
      name: 'Genealogical Lens',
      description: 'Reveals the hidden origins of moral concepts. +5% score on Framework Shift moves.',
      requiredGymLeaders: 4,
      bonus: { moveType: 'framework_shift', scoreBoost: 0.5 },
    },
    {
      id: 'veil_of_ignorance',
      name: 'Veil of Ignorance',
      description: 'Strips away bias and reveals impartial truth. +5% score on Socratic Questioning moves.',
      requiredGymLeaders: 6,
      bonus: { moveType: 'socratic_questioning', scoreBoost: 0.5 },
    },
    {
      id: 'reflective_equilibrium',
      name: 'Reflective Equilibrium',
      description: 'Harmonizes principles and judgments into devastating arguments. +5% score on Reductio moves.',
      requiredGymLeaders: 8,
      bonus: { moveType: 'reductio', scoreBoost: 0.5 },
    },
  ]);

  /**
   * Get key items the player has unlocked based on gym leader defeats.
   * @returns {Array<{id: string, name: string, description: string, bonus: object}>}
   */
  getUnlockedKeyItems() {
    const gymCount = this.getDefeatedGymLeaders().length;
    return DataManager.KEY_ITEMS.filter((item) => gymCount >= item.requiredGymLeaders);
  }

  /**
   * Get the score bonus for a given move type from unlocked key items.
   * @param {string} moveType
   * @returns {number} bonus to add to weighted score
   */
  getKeyItemBonus(moveType) {
    return this.getUnlockedKeyItems()
      .filter((item) => item.bonus.moveType === moveType)
      .reduce((sum, item) => sum + item.bonus.scoreBoost, 0);
  }

  // ─── ETHICA-specific methods ─────────────────────────────

  /**
   * XP thresholds per level (cubic growth: level^3 * 10).
   * @param {number} level
   * @returns {number} total XP needed to reach this level
   */
  static xpForLevel(level) {
    return Math.pow(level, 3) * 10;
  }

  /** @returns {number} */
  getPlayerXp() {
    return this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_PLAYER_XP) || 0;
  }

  /** @returns {number} */
  getPlayerLevel() {
    return this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_PLAYER_LEVEL) || 1;
  }

  /**
   * Add XP from a debate. Handles level-ups automatically.
   * @param {number} xp
   * @returns {{ newXp: number, newLevel: number, leveledUp: boolean }}
   */
  addPlayerXp(xp) {
    let currentXp = this.getPlayerXp() + xp;
    let currentLevel = this.getPlayerLevel();
    let leveledUp = false;

    while (currentLevel < 50 && currentXp >= DataManager.xpForLevel(currentLevel + 1)) {
      currentLevel++;
      leveledUp = true;
    }

    this.#store.set(DATA_MANAGER_STORE_KEYS.ETHICA_PLAYER_XP, currentXp);
    this.#store.set(DATA_MANAGER_STORE_KEYS.ETHICA_PLAYER_LEVEL, currentLevel);
    return { newXp: currentXp, newLevel: currentLevel, leveledUp };
  }

  /**
   * Get the Philosophical Toolkit — concepts collected per philosopher.
   * @returns {Object.<string, string[]>}
   */
  getToolkit() {
    return this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_TOOLKIT) || {};
  }

  /**
   * Add a concept to a philosopher's toolkit entry.
   * @param {string} philosopherId
   * @param {string} concept
   * @returns {boolean} true if concept was new
   */
  addToolkitConcept(philosopherId, concept) {
    const toolkit = this.getToolkit();
    if (!toolkit[philosopherId]) {
      toolkit[philosopherId] = [];
    }
    if (toolkit[philosopherId].includes(concept)) {
      return false;
    }
    toolkit[philosopherId].push(concept);
    this.#store.set(DATA_MANAGER_STORE_KEYS.ETHICA_TOOLKIT, toolkit);
    return true;
  }

  /**
   * Get the number of unique concepts collected.
   * @returns {number}
   */
  getToolkitConceptCount() {
    const toolkit = this.getToolkit();
    return Object.values(toolkit).reduce((sum, concepts) => sum + concepts.length, 0);
  }

  /**
   * @returns {string[]} Array of defeated gym leader philosopher ids
   */
  getDefeatedGymLeaders() {
    return this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_DEFEATED_GYM_LEADERS) || [];
  }

  /**
   * Record a gym leader defeat.
   * @param {string} philosopherId
   */
  addDefeatedGymLeader(philosopherId) {
    const leaders = this.getDefeatedGymLeaders();
    if (!leaders.includes(philosopherId)) {
      leaders.push(philosopherId);
      this.#store.set(DATA_MANAGER_STORE_KEYS.ETHICA_DEFEATED_GYM_LEADERS, leaders);
    }
  }

  /**
   * @returns {Object.<string, {wins: number, losses: number, draws: number, bestScore: number}>}
   */
  getDebateHistory() {
    return this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_DEBATE_HISTORY) || {};
  }

  /**
   * Record a debate result.
   * @param {string} philosopherId
   * @param {'win'|'loss'|'draw'} result
   * @param {number} score - Average weighted score (0-10)
   */
  recordDebateResult(philosopherId, result, score) {
    const history = this.getDebateHistory();
    if (!history[philosopherId]) {
      history[philosopherId] = { wins: 0, losses: 0, draws: 0, bestScore: 0 };
    }
    if (result === 'win') history[philosopherId].wins++;
    else if (result === 'loss') history[philosopherId].losses++;
    else history[philosopherId].draws++;
    if (score > history[philosopherId].bestScore) {
      history[philosopherId].bestScore = score;
    }
    this.#store.set(DATA_MANAGER_STORE_KEYS.ETHICA_DEBATE_HISTORY, history);
  }

  // ─── ETHICA Beliefs ───────────────────────────────────

  /**
   * Get all philosophical beliefs the player has agreed with.
   * @returns {Array<{philosopherId: string, claim: string, topic: string, agreedAt: number}>}
   */
  getBeliefs() {
    return this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_BELIEFS) || [];
  }

  /**
   * Add a new belief (philosophical position the player agreed with).
   * @param {string} philosopherId
   * @param {string} claim
   * @param {string} topic
   */
  addBelief(philosopherId, claim, topic) {
    const beliefs = this.getBeliefs();
    beliefs.push({
      philosopherId,
      claim,
      topic,
      agreedAt: Date.now(),
    });
    this.#store.set(DATA_MANAGER_STORE_KEYS.ETHICA_BELIEFS, beliefs);
  }

  /**
   * Get beliefs filtered by topic.
   * @param {string} topic
   * @returns {Array<{philosopherId: string, claim: string, topic: string, agreedAt: number}>}
   */
  getBeliefsByTopic(topic) {
    return this.getBeliefs().filter((b) => b.topic === topic);
  }

  /**
   * Get toolkit item counts (consumable debate items).
   * @returns {{counterexample: number, reductio: number, socratic_questioning: number, framework_shift: number}}
   */
  getToolkitItems() {
    return this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_TOOLKIT_ITEMS) ||
      { counterexample: 0, reductio: 0, socratic_questioning: 0, framework_shift: 0 };
  }

  /**
   * Add toolkit items.
   * @param {string} moveType
   * @param {number} count
   */
  addToolkitItems(moveType, count) {
    const items = this.getToolkitItems();
    items[moveType] = (items[moveType] || 0) + count;
    this.#store.set(DATA_MANAGER_STORE_KEYS.ETHICA_TOOLKIT_ITEMS, items);
  }

  /**
   * Use one toolkit item. Returns true if used, false if none left.
   * @param {string} moveType
   * @returns {boolean}
   */
  useToolkitItem(moveType) {
    const items = this.getToolkitItems();
    if (!items[moveType] || items[moveType] <= 0) return false;
    items[moveType]--;
    this.#store.set(DATA_MANAGER_STORE_KEYS.ETHICA_TOOLKIT_ITEMS, items);
    return true;
  }

  /**
   * @param {GlobalState} data
   * @returns {void}
   */
  #updateDataManger(data) {
    this.#store.set({
      [DATA_MANAGER_STORE_KEYS.PLAYER_POSITION]: data.player.position,
      [DATA_MANAGER_STORE_KEYS.PLAYER_DIRECTION]: data.player.direction,
      [DATA_MANAGER_STORE_KEYS.PLAYER_LOCATION]: data.player.location || { ...initialState.player.location },
      [DATA_MANAGER_STORE_KEYS.OPTIONS_TEXT_SPEED]: data.options.textSpeed,
      [DATA_MANAGER_STORE_KEYS.OPTIONS_BATTLE_SCENE_ANIMATIONS]: data.options.battleSceneAnimations,
      [DATA_MANAGER_STORE_KEYS.OPTIONS_BATTLE_STYLE]: data.options.battleStyle,
      [DATA_MANAGER_STORE_KEYS.OPTIONS_SOUND]: data.options.sound,
      [DATA_MANAGER_STORE_KEYS.OPTIONS_VOLUME]: data.options.volume,
      [DATA_MANAGER_STORE_KEYS.OPTIONS_MENU_COLOR]: data.options.menuColor,
      [DATA_MANAGER_STORE_KEYS.GAME_STARTED]: data.gameStarted,
      [DATA_MANAGER_STORE_KEYS.MONSTERS_IN_PARTY]: data.monsters.inParty,
      [DATA_MANAGER_STORE_KEYS.INVENTORY]: data.inventory,
      [DATA_MANAGER_STORE_KEYS.ITEMS_PICKED_UP]: data.itemsPickedUp || [...initialState.itemsPickedUp],
      [DATA_MANAGER_STORE_KEYS.VIEWED_EVENTS]: data.viewedEvents || [...initialState.viewedEvents],
      [DATA_MANAGER_STORE_KEYS.FLAGS]: data.flags || [...initialState.flags],
      [DATA_MANAGER_STORE_KEYS.DEFEATED_NPCS]: new Set(data.defeatedNpcs || []),
      [DATA_MANAGER_STORE_KEYS.ETHICA_PLAYER_XP]: data.ethica?.playerXp || 0,
      [DATA_MANAGER_STORE_KEYS.ETHICA_PLAYER_LEVEL]: data.ethica?.playerLevel || 1,
      [DATA_MANAGER_STORE_KEYS.ETHICA_TOOLKIT]: data.ethica?.toolkit || {},
      [DATA_MANAGER_STORE_KEYS.ETHICA_DEFEATED_GYM_LEADERS]: data.ethica?.defeatedGymLeaders || [],
      [DATA_MANAGER_STORE_KEYS.ETHICA_DEBATE_HISTORY]: data.ethica?.debateHistory || {},
      [DATA_MANAGER_STORE_KEYS.ETHICA_BELIEFS]: data.ethica?.beliefs || [],
      [DATA_MANAGER_STORE_KEYS.ETHICA_TOOLKIT_ITEMS]: data.ethica?.toolkitItems || { counterexample: 0, reductio: 0, socratic_questioning: 0, framework_shift: 0 },
    });
  }

  /**
   * @returns {GlobalState}
   */
  #dataManagerDataToGlobalStateObject() {
    return {
      player: {
        position: {
          x: this.#store.get(DATA_MANAGER_STORE_KEYS.PLAYER_POSITION).x,
          y: this.#store.get(DATA_MANAGER_STORE_KEYS.PLAYER_POSITION).y,
        },
        direction: this.#store.get(DATA_MANAGER_STORE_KEYS.PLAYER_DIRECTION),
        location: { ...this.#store.get(DATA_MANAGER_STORE_KEYS.PLAYER_LOCATION) },
      },
      options: {
        textSpeed: this.#store.get(DATA_MANAGER_STORE_KEYS.OPTIONS_TEXT_SPEED),
        battleSceneAnimations: this.#store.get(DATA_MANAGER_STORE_KEYS.OPTIONS_BATTLE_SCENE_ANIMATIONS),
        battleStyle: this.#store.get(DATA_MANAGER_STORE_KEYS.OPTIONS_BATTLE_STYLE),
        sound: this.#store.get(DATA_MANAGER_STORE_KEYS.OPTIONS_SOUND),
        volume: this.#store.get(DATA_MANAGER_STORE_KEYS.OPTIONS_VOLUME),
        menuColor: this.#store.get(DATA_MANAGER_STORE_KEYS.OPTIONS_MENU_COLOR),
      },
      gameStarted: this.#store.get(DATA_MANAGER_STORE_KEYS.GAME_STARTED),
      monsters: {
        inParty: [...this.#store.get(DATA_MANAGER_STORE_KEYS.MONSTERS_IN_PARTY)],
      },
      inventory: this.#store.get(DATA_MANAGER_STORE_KEYS.INVENTORY),
      itemsPickedUp: [...(this.#store.get(DATA_MANAGER_STORE_KEYS.ITEMS_PICKED_UP) || [])],
      viewedEvents: [...(this.#store.get(DATA_MANAGER_STORE_KEYS.VIEWED_EVENTS) || [])],
      flags: [...(this.#store.get(DATA_MANAGER_STORE_KEYS.FLAGS) || [])],
      defeatedNpcs: Array.from(this.#store.get(DATA_MANAGER_STORE_KEYS.DEFEATED_NPCS) || new Set()),
      ethica: {
        playerXp: this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_PLAYER_XP) || 0,
        playerLevel: this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_PLAYER_LEVEL) || 1,
        toolkit: this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_TOOLKIT) || {},
        defeatedGymLeaders: [...(this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_DEFEATED_GYM_LEADERS) || [])],
        debateHistory: { ...(this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_DEBATE_HISTORY) || {}) },
        beliefs: [...(this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_BELIEFS) || [])],
        toolkitItems: { ...(this.#store.get(DATA_MANAGER_STORE_KEYS.ETHICA_TOOLKIT_ITEMS) || { counterexample: 0, reductio: 0, socratic_questioning: 0, framework_shift: 0 }) },
      },
    };
  }
}

export const dataManager = new DataManager();
