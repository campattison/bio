import Phaser from '../lib/phaser.js';
import { SCENE_KEYS } from './scene-keys.js';
import { Controls } from '../utils/controls.js';
import { DIRECTION } from '../common/direction.js';
import { dataManager } from '../utils/data-manager.js';

/** @typedef {{ previousSceneName: string }} PauseMenuSceneData */

const MENU_OPTIONS = ['RESUME', 'SAVE', 'EXIT TO TITLE'];

export class PauseMenuScene extends Phaser.Scene {
  /** @type {Controls} */
  #controls;
  /** @type {string} */
  #previousSceneName;
  /** @type {number} */
  #selection;
  /** @type {{ bg: Phaser.GameObjects.Rectangle, txt: Phaser.GameObjects.Text }[]} */
  #optionTexts;
  /** @type {Phaser.GameObjects.Text | null} */
  #savedFlash;
  /** @type {Phaser.Time.TimerEvent | null} */
  #savedTimer;

  constructor() {
    super({ key: SCENE_KEYS.PAUSE_MENU_SCENE });
  }

  /**
   * @param {PauseMenuSceneData} data
   */
  init(data) {
    this.#previousSceneName = data.previousSceneName;
    this.#selection = 0;
    this.#optionTexts = [];
    this.#savedFlash = null;
    this.#savedTimer = null;
  }

  create() {
    this.#controls = new Controls(this);

    const { width, height } = this.scale;

    // Dark overlay
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);

    // Panel
    const panelW = 280;
    const panelH = 220;
    this.add
      .rectangle(width / 2, height / 2, panelW, panelH, 0x16213e, 0.95)
      .setStrokeStyle(2, 0x533483);

    // Title
    this.add
      .text(width / 2, height / 2 - 75, 'PAUSED', {
        fontSize: '22px',
        fontFamily: 'monospace',
        color: '#c792ea',
      })
      .setOrigin(0.5);

    // Menu options
    const startY = height / 2 - 25;
    const spacing = 45;
    MENU_OPTIONS.forEach((label, i) => {
      const y = startY + i * spacing;
      const bg = this.add
        .rectangle(width / 2, y, 200, 34, 0x16213e, 0.8)
        .setStrokeStyle(1, 0x533483);
      const txt = this.add
        .text(width / 2, y, label, {
          fontSize: '16px',
          fontFamily: 'monospace',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);

      this.#optionTexts.push({ bg, txt });
    });

    // "Saved!" flash text (hidden by default)
    this.#savedFlash = this.add
      .text(width / 2, height / 2 + 95, 'Saved!', {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#82aaff',
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.#updateSelection();
  }

  update() {
    if (!this.#controls) return;

    // ESC to resume
    if (this.#controls.wasEscKeyPressed()) {
      this.#resume();
      return;
    }

    // Navigation
    const dir = this.#controls.getDirectionKeyJustPressed();
    if (dir === DIRECTION.UP && this.#selection > 0) {
      this.#selection--;
      this.#updateSelection();
    } else if (dir === DIRECTION.DOWN && this.#selection < MENU_OPTIONS.length - 1) {
      this.#selection++;
      this.#updateSelection();
    }

    // Confirm
    if (this.#controls.wasSpaceKeyPressed()) {
      this.#handleAction();
    }
  }

  #updateSelection() {
    this.#optionTexts.forEach(({ bg, txt }, i) => {
      if (i === this.#selection) {
        bg.setFillStyle(0x533483, 0.9);
        bg.setStrokeStyle(2, 0xc792ea);
        txt.setColor('#ffffff');
      } else {
        bg.setFillStyle(0x16213e, 0.8);
        bg.setStrokeStyle(1, 0x533483);
        txt.setColor('#aaaaaa');
      }
    });
  }

  #handleAction() {
    switch (this.#selection) {
      case 0: // RESUME
        this.#resume();
        break;
      case 1: // SAVE
        dataManager.saveData();
        dataManager.saveToServer();
        this.#savedFlash?.setVisible(true);
        if (this.#savedTimer) {
          this.#savedTimer.destroy();
        }
        this.#savedTimer = this.time.delayedCall(1500, () => {
          this.#savedFlash?.setVisible(false);
        });
        break;
      case 2: // EXIT TO TITLE
        dataManager.saveData();
        dataManager.saveToServer();
        if (this.#savedTimer) {
          this.#savedTimer.destroy();
          this.#savedTimer = null;
        }
        this.scene.stop(this.#previousSceneName);
        this.scene.stop(SCENE_KEYS.PAUSE_MENU_SCENE);
        this.scene.start(SCENE_KEYS.TITLE_SCENE);
        break;
    }
  }

  #resume() {
    if (this.#savedTimer) {
      this.#savedTimer.destroy();
      this.#savedTimer = null;
    }
    this.scene.stop(SCENE_KEYS.PAUSE_MENU_SCENE);
    this.scene.resume(this.#previousSceneName);
  }
}
