import Phaser from '../lib/phaser.js';
import { SCENE_KEYS } from './scene-keys.js';
import { BaseScene } from './base-scene.js';
import { DIRECTION } from '../common/direction.js';
import { dataManager } from '../utils/data-manager.js';
import { DataUtils } from '../utils/data-utils.js';

/**
 * Debate Arena Scene — rematch any philosopher you've previously defeated.
 * Shows a scrollable list of defeated philosophers, lets the player select one,
 * then launches the debate scene.
 */
export class ArenaScene extends BaseScene {
  /** @type {string} */
  #previousSceneName;
  /** @type {object[]} */
  #availablePhilosophers;
  /** @type {number} */
  #selectedIndex;
  /** @type {number} */
  #scrollOffset;
  /** @type {number} */
  #maxVisible;
  /** @type {Phaser.GameObjects.Text} */
  #listText;
  /** @type {Phaser.GameObjects.Text} */
  #detailText;
  /** @type {Phaser.GameObjects.Text} */
  #titleText;

  constructor() {
    super({ key: SCENE_KEYS.ARENA_SCENE });
  }

  init(data) {
    super.init(data);
    this.#previousSceneName = data?.previousSceneName || SCENE_KEYS.WORLD_SCENE;
    this.#selectedIndex = 0;
    this.#scrollOffset = 0;
    this.#maxVisible = 12;
  }

  create() {
    super.create();

    const { width, height } = this.scale;

    // Build list of rematchable philosophers — any with at least 1 debate
    const debateHistory = dataManager.getDebateHistory();
    const allPhilosophers = DataUtils.getAllPhilosophers(this);

    this.#availablePhilosophers = allPhilosophers.filter((p) => {
      const history = debateHistory[p.id];
      return history && (history.wins > 0 || history.losses > 0 || history.draws > 0);
    });

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e).setOrigin(0.5);

    // Title bar
    this.add.rectangle(width / 2, 24, width, 48, 0x16213e).setOrigin(0.5);
    this.#titleText = this.add
      .text(20, 12, 'DEBATE ARENA', {
        fontSize: '18px',
        fontFamily: 'Kenney-Future-Narrow, monospace',
        color: '#ff5370',
      })
      .setOrigin(0, 0);

    this.add
      .text(width - 20, 12, `${this.#availablePhilosophers.length} philosopher${this.#availablePhilosophers.length !== 1 ? 's' : ''} available`, {
        fontSize: '12px',
        fontFamily: 'Kenney-Future-Narrow, monospace',
        color: '#aaa',
      })
      .setOrigin(1, 0);

    if (this.#availablePhilosophers.length === 0) {
      this.add
        .text(width / 2, height / 2, 'No philosophers available for rematch yet.\nDefeat philosophers in the world to unlock them here.', {
          fontSize: '16px',
          fontFamily: 'Kenney-Future-Narrow, monospace',
          color: '#888',
          align: 'center',
        })
        .setOrigin(0.5);

      this.add
        .text(width / 2, height - 30, 'Press BACK to return', {
          fontSize: '12px',
          fontFamily: 'Kenney-Future-Narrow, monospace',
          color: '#666',
        })
        .setOrigin(0.5);
    } else {
      // Left panel — philosopher list
      const listBg = this.add.graphics();
      listBg.fillStyle(0x0f3460, 0.6);
      listBg.fillRect(10, 52, 340, height - 62);
      listBg.lineStyle(2, 0xff5370);
      listBg.strokeRect(10, 52, 340, height - 62);

      this.#listText = this.add
        .text(20, 58, '', {
          fontSize: '14px',
          fontFamily: 'Kenney-Future-Narrow, monospace',
          color: '#e0e0e0',
          lineSpacing: 8,
        })
        .setOrigin(0, 0);

      // Right panel — detail view
      const detailBg = this.add.graphics();
      detailBg.fillStyle(0x0f3460, 0.6);
      detailBg.fillRect(360, 52, width - 370, height - 62);
      detailBg.lineStyle(2, 0xff5370);
      detailBg.strokeRect(360, 52, width - 370, height - 62);

      this.#detailText = this.add
        .text(370, 58, '', {
          fontSize: '13px',
          fontFamily: 'Kenney-Future-Narrow, monospace',
          color: '#e0e0e0',
          wordWrap: { width: width - 400 },
          lineSpacing: 5,
        })
        .setOrigin(0, 0);

      this.#renderList();
      this.#renderDetail();
    }

    // Instructions
    this.add
      .text(width / 2, height - 8, 'UP/DOWN: Navigate | SPACE: Challenge | BACK: Return', {
        fontSize: '11px',
        fontFamily: 'Kenney-Future-Narrow, monospace',
        color: '#666',
      })
      .setOrigin(0.5, 1);
  }

  update() {
    super.update();
    if (this._controls.isInputLocked) return;

    if (this._controls.wasBackKeyPressed()) {
      this.scene.stop(SCENE_KEYS.ARENA_SCENE);
      this.scene.resume(this.#previousSceneName);
      return;
    }

    if (this.#availablePhilosophers.length === 0) return;

    const dir = this._controls.getDirectionKeyJustPressed();

    if (dir === DIRECTION.UP && this.#selectedIndex > 0) {
      this.#selectedIndex--;
      if (this.#selectedIndex < this.#scrollOffset) {
        this.#scrollOffset = this.#selectedIndex;
      }
      this.#renderList();
      this.#renderDetail();
    } else if (dir === DIRECTION.DOWN && this.#selectedIndex < this.#availablePhilosophers.length - 1) {
      this.#selectedIndex++;
      if (this.#selectedIndex >= this.#scrollOffset + this.#maxVisible) {
        this.#scrollOffset = this.#selectedIndex - this.#maxVisible + 1;
      }
      this.#renderList();
      this.#renderDetail();
    }

    if (this._controls.wasSpaceKeyPressed()) {
      this.#startRematch();
    }
  }

  #renderList() {
    const debateHistory = dataManager.getDebateHistory();
    const gymLeaders = dataManager.getDefeatedGymLeaders();
    const lines = [];

    for (let i = this.#scrollOffset; i < Math.min(this.#availablePhilosophers.length, this.#scrollOffset + this.#maxVisible); i++) {
      const phil = this.#availablePhilosophers[i];
      const history = debateHistory[phil.id] || { wins: 0, losses: 0, draws: 0 };
      const prefix = i === this.#selectedIndex ? '> ' : '  ';
      const isGym = gymLeaders.includes(phil.id);
      const gymTag = isGym ? ' *GYM*' : '';
      const record = `W${history.wins}/L${history.losses}/D${history.draws}`;

      lines.push(`${prefix}${phil.name} (Lv.${phil.level}) ${record}${gymTag}`);
    }

    this.#listText.setText(lines.join('\n'));
  }

  #renderDetail() {
    const phil = this.#availablePhilosophers[this.#selectedIndex];
    if (!phil) {
      this.#detailText.setText('');
      return;
    }

    const debateHistory = dataManager.getDebateHistory();
    const history = debateHistory[phil.id] || { wins: 0, losses: 0, draws: 0, bestScore: 0 };
    const toolkit = dataManager.getToolkit();
    const concepts = toolkit[phil.id] || [];

    let text = `${phil.name}\n`;
    text += `Level ${phil.level} | ${phil.tradition.replace('_', ' ')}\n`;
    text += `HP: ${phil.hp} Conviction\n\n`;

    text += `YOUR RECORD:\n`;
    text += `  Wins: ${history.wins} | Losses: ${history.losses} | Draws: ${history.draws}\n`;
    text += `  Best Score: ${history.bestScore.toFixed(1)}/10\n\n`;

    text += `CONCEPTS: ${concepts.length}/${phil.signature_moves?.length || 0}\n`;
    if (phil.signature_moves) {
      phil.signature_moves.forEach((move, i) => {
        text += concepts.includes(move) ? `  ${i + 1}. ${move}\n` : `  ${i + 1}. ???\n`;
      });
    }

    text += `\nSIGNATURE: ${phil.signature_attack?.name || 'Unknown'}\n`;
    text += `\n"${phil.thinking_text || ''}"`;

    this.#detailText.setText(text);
  }

  #startRematch() {
    const phil = this.#availablePhilosophers[this.#selectedIndex];
    if (!phil) return;

    const debateData = {
      philosopher: phil,
      // No npcId — arena rematches don't affect NPC defeat state
    };

    this.scene.stop(SCENE_KEYS.ARENA_SCENE);
    this.scene.stop(this.#previousSceneName);
    this.scene.start(SCENE_KEYS.DEBATE_SCENE, debateData);
  }
}
