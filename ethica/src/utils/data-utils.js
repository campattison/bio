import Phaser from '../lib/phaser.js';
import { DATA_ASSET_KEYS } from '../assets/asset-keys.js';
import * as packLoader from '../pack-loader.js';

export class DataUtils {
  /**
   * Utility function for retrieving an Attack object from the attacks.json data file.
   * @param {Phaser.Scene} scene the Phaser 3 Scene to get cached JSON file from
   * @param {number} attackId the id of the attack to retrieve from the attacks.json file
   * @returns {import('../types/typedef.js').Attack | undefined}
   */
  static getMonsterAttack(scene, attackId) {
    /** @type {import('../types/typedef.js').Attack[]} */
    const data = scene.cache.json.get(DATA_ASSET_KEYS.ATTACKS);
    return data.find((attack) => attack.id === attackId);
  }

  /**
   * Utility function for retrieving the Animation objects from the animations.json data file.
   * @param {Phaser.Scene} scene the Phaser 3 Scene to get cached JSON file from
   * @returns {import('../types/typedef.js').Animation[]}
   */
  static getAnimations(scene) {
    /** @type {import('../types/typedef.js').Animation[]} */
    const data = scene.cache.json.get(DATA_ASSET_KEYS.ANIMATIONS);
    return data;
  }

  /**
   * Utility function for retrieving an Item object from the items.json data file.
   * @param {Phaser.Scene} scene the Phaser 3 Scene to get cached JSON file from
   * @param {number} itemId the id of the item to retrieve from the items.json file
   * @returns {import('../types/typedef.js').Item | undefined}
   */
  static getItem(scene, itemId) {
    /** @type {import('../types/typedef.js').Item[]} */
    const data = scene.cache.json.get(DATA_ASSET_KEYS.ITEMS);
    return data.find((item) => item.id === itemId);
  }

  /**
   * Utility function for retrieving an array Item objects from the items.json data file.
   * @param {Phaser.Scene} scene the Phaser 3 Scene to get cached JSON file from
   * @param {number[]} itemIds the array of the item ids to retrieve from the items.json file
   * @returns {import('../types/typedef.js').Item[] | undefined}
   */
  static getItems(scene, itemIds) {
    /** @type {import('../types/typedef.js').Item[]} */
    const data = scene.cache.json.get(DATA_ASSET_KEYS.ITEMS);
    return data.filter((item) => {
      return itemIds.some((id) => id === item.id);
    });
  }

  /**
   * Utility function for retrieving a Monster object from the monsters.json data file.
   * @param {Phaser.Scene} scene the Phaser 3 Scene to get cached JSON file from
   * @param {number} id the monster id to retrieve from the monsters.json file
   * @returns {import('../types/typedef.js').Monster}
   */
  static getMonsterById(scene, id) {
    /** @type {import('../types/typedef.js').Monster[]} */
    const data = scene.cache.json.get(DATA_ASSET_KEYS.MONSTERS);
    const monster = data.find((monster) => monster.id === id.toString(10));
    // we use JSON.parse and JSON.stringify to create a deep copy of the monster data to not mutate the cache
    return monster ? JSON.parse(JSON.stringify(monster)) : undefined;
  }

  /**
   * @param {Phaser.Scene} scene the Phaser 3 Scene to get cached JSON file from
   * @param {number} areaId the area id to pull monster encounter details for
   * @returns {number[][]}
   */
  static getEncounterAreaDetails(scene, areaId) {
    /** @type {import('../types/typedef.js').EncounterData} */
    const data = scene.cache.json.get(DATA_ASSET_KEYS.ENCOUNTERS);
    return data[areaId];
  }

  /**
   * @param {Phaser.Scene} scene the Phaser 3 Scene to get cached JSON file from
   * @param {number} npcId
   * @returns {import('../types/typedef.js').NpcDetails}
   */
  static getNpcData(scene, npcId) {
    /** @type {import('../types/typedef.js').NpcData} */
    const data = scene.cache.json.get(DATA_ASSET_KEYS.NPCS);
    return data[npcId];
  }

  /**
   * @param {Phaser.Scene} scene the Phaser 3 Scene to get cached JSON file from
   * @param {number} eventId the event id to retrieve from the events.json file
   * @returns {import('../types/typedef.js').EventDetails}
   */
  static getEventData(scene, eventId) {
    /** @type {import('../types/typedef.js').EventData} */
    const data = scene.cache.json.get(DATA_ASSET_KEYS.EVENTS);
    return data[eventId];
  }

  /**
   * @param {Phaser.Scene} scene the Phaser 3 Scene to get cached JSON file from
   * @param {number} signId the sign id to retrieve from the signs.json file
   * @returns {import('../types/typedef.js').SignDetails}
   */
  static getSignData(scene, signId) {
    /** @type {import('../types/typedef.js').SignData} */
    const data = scene.cache.json.get(DATA_ASSET_KEYS.SIGNS);
    return data[signId];
  }

  /**
   * Get philosopher data by id from philosophers.json.
   * @param {Phaser.Scene} scene
   * @param {string} philosopherId
   * @returns {object | undefined}
   */
  static getPhilosopherById(scene, philosopherId) {
    const fromPack = packLoader.getPhilosopherById(philosopherId);
    if (fromPack) return fromPack;
    const data = scene.cache.json.get(DATA_ASSET_KEYS.PHILOSOPHERS);
    if (!data || !data.philosophers) return undefined;
    return data.philosophers.find((p) => p.id === philosopherId);
  }

  /**
   * Get all philosopher data. Sourced from the active pack, with a Phaser-cache
   * fallback for the (transient) window before the pack registers its data.
   * @param {Phaser.Scene} scene
   * @returns {object[]}
   */
  static getAllPhilosophers(scene) {
    const fromPack = packLoader.getPhilosophers();
    if (fromPack && fromPack.length) return fromPack;
    const data = scene.cache.json.get(DATA_ASSET_KEYS.PHILOSOPHERS);
    return data?.philosophers || [];
  }

  /**
   * Get the full quiz content data (traditions, philosophers, quotes).
   * @param {Phaser.Scene} scene
   * @returns {{ traditions: object[], philosophers: object[], quotes: object[] }}
   */
  static getQuizContent(scene) {
    return packLoader.getQuizContent() || scene.cache.json.get(DATA_ASSET_KEYS.QUIZ_CONTENT);
  }

  /**
   * Get quiz quotes filtered by difficulty range.
   * @param {Phaser.Scene} scene
   * @param {number} minDifficulty
   * @param {number} maxDifficulty
   * @returns {object[]}
   */
  static getQuizQuotesByDifficulty(scene, minDifficulty, maxDifficulty) {
    const data = DataUtils.getQuizContent(scene);
    if (!data?.quotes) return [];
    return data.quotes.filter((q) => q.difficulty >= minDifficulty && q.difficulty <= maxDifficulty);
  }

  /**
   * Get all unique traditions from quiz content.
   * @param {Phaser.Scene} scene
   * @returns {object[]}
   */
  static getQuizTraditions(scene) {
    const data = DataUtils.getQuizContent(scene);
    return data?.traditions || [];
  }

  /**
   * Get all quiz philosophers.
   * @param {Phaser.Scene} scene
   * @returns {object[]}
   */
  static getQuizPhilosophers(scene) {
    const data = DataUtils.getQuizContent(scene);
    return data?.philosophers || [];
  }
}
