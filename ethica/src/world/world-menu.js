import { Menu } from '../common/menu/menu.js';

/**
 * @typedef {keyof typeof MENU_OPTIONS} MenuOptions
 */

/** @enum {MenuOptions} */
export const MENU_OPTIONS = Object.freeze({
  TOOLKIT: 'TOOLKIT',
  MONSTERDEX: 'MONSTERDEX',
  MONSTERS: 'MONSTERS',
  BAG: 'BAG',
  SAVE: 'SAVE',
  OPTIONS: 'OPTIONS',
  EXIT: 'EXIT',
});

export class WorldMenu extends Menu {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    super(scene, [MENU_OPTIONS.TOOLKIT, MENU_OPTIONS.BAG, MENU_OPTIONS.SAVE, MENU_OPTIONS.EXIT]);
  }
}
