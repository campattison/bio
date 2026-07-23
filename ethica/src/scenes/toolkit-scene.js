import Phaser from '../lib/phaser.js';
import { SCENE_KEYS } from './scene-keys.js';
import { BaseScene } from './base-scene.js';
import { DIRECTION } from '../common/direction.js';
import { dataManager } from '../utils/data-manager.js';
import { DataUtils } from '../utils/data-utils.js';
import { budgetLabel } from '../utils/access-code.js';
import { getProgression } from '../pack-loader.js';

/**
 * Philosophical Toolkit Scene — the ETHICA Pokedex.
 * Shows philosophical concepts collected from each philosopher, organized by tradition.
 * Launched from the world menu.
 */
export class ToolkitScene extends BaseScene {
  /** @type {string} */
  #previousSceneName;
  /** @type {object[]} */
  #philosophers;
  /** @type {object[]} */
  #traditions;
  /** @type {number} */
  #selectedIndex;
  /** @type {number} */
  #scrollOffset;
  /** @type {number} */
  #maxVisible;
  /** @type {Phaser.GameObjects.Text} */
  #titleText;
  /** @type {Phaser.GameObjects.Text} */
  #listText;
  /** @type {Phaser.GameObjects.Text} */
  #detailText;
  /** @type {Phaser.GameObjects.Text} */
  #statsText;
  /** @type {Phaser.GameObjects.Graphics} */
  #listBg;
  /** @type {Phaser.GameObjects.Graphics} */
  #detailBg;
  /** @type {string} */
  #mode; // 'list' or 'detail'

  constructor() {
    super({ key: SCENE_KEYS.TOOLKIT_SCENE });
  }

  init(data) {
    super.init(data);
    this.#previousSceneName = data?.previousSceneName || SCENE_KEYS.WORLD_SCENE;
    this.#selectedIndex = 0;
    this.#scrollOffset = 0;
    this.#maxVisible = 14;
    this.#mode = 'list';
  }

  create() {
    super.create();

    const { width, height } = this.scale;
    const allPhilosophers = DataUtils.getAllPhilosophers(this);
    const traditions = this.cache.json.get('PHILOSOPHERS').traditions;
    this.#traditions = traditions;

    // Sort philosophers by tradition, then by name
    const traditionOrder = traditions.map((t) => t.id);
    this.#philosophers = [...allPhilosophers].sort((a, b) => {
      const tA = traditionOrder.indexOf(a.tradition);
      const tB = traditionOrder.indexOf(b.tradition);
      if (tA !== tB) return tA - tB;
      return a.name.localeCompare(b.name);
    });

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e).setOrigin(0.5);

    // Title bar
    this.add.rectangle(width / 2, 24, width, 48, 0x16213e).setOrigin(0.5);
    const toolkit = dataManager.getToolkit();
    const conceptCount = dataManager.getToolkitConceptCount();
    const totalConcepts = this.#philosophers.reduce(
      (sum, p) => sum + (p.signature_moves ? p.signature_moves.length : 0),
      0
    );
    const gymLeaders = dataManager.getDefeatedGymLeaders();

    this.#titleText = this.add
      .text(20, 12, `PHILOSOPHICAL TOOLKIT`, {
        fontSize: '18px',
        fontFamily: 'Kenney-Future-Narrow, monospace',
        color: '#c792ea',
      })
      .setOrigin(0, 0);

    // Stats in title bar
    const keyItems = dataManager.getUnlockedKeyItems();
    const progression = getProgression();
    // Fall back to the historical literals if the pack has not loaded.
    const gymTotal = progression.gymLeaderCount ?? 9;
    const itemTotal = progression.keyItemCount ?? dataManager.constructor.KEY_ITEMS.length;
    this.#statsText = this.add
      .text(width - 20, 12, `Concepts: ${conceptCount}/${totalConcepts} | Gym: ${gymLeaders.length}/${gymTotal} | Items: ${keyItems.length}/${itemTotal} | Lv.${dataManager.getPlayerLevel()}`, {
        fontSize: '12px',
        fontFamily: 'Kenney-Future-Narrow, monospace',
        color: '#aaa',
      })
      .setOrigin(1, 0);

    // v2: remaining battle budget (populated after the first model call of the
    // session; blank until then).
    this.add
      .text(width - 20, height - 18, budgetLabel(), {
        fontSize: '11px',
        fontFamily: 'Kenney-Future-Narrow, monospace',
        color: '#6da87d',
      })
      .setOrigin(1, 1);

    // Left panel — philosopher list
    this.#listBg = this.add.graphics();
    this.#listBg.fillStyle(0x0f3460, 0.6);
    this.#listBg.fillRect(10, 52, 300, height - 62);
    this.#listBg.lineStyle(2, 0x533483);
    this.#listBg.strokeRect(10, 52, 300, height - 62);

    this.#listText = this.add
      .text(20, 58, '', {
        fontSize: '14px',
        fontFamily: 'Kenney-Future-Narrow, monospace',
        color: '#e0e0e0',
        lineSpacing: 6,
      })
      .setOrigin(0, 0);

    // Right panel — detail view
    this.#detailBg = this.add.graphics();
    this.#detailBg.fillStyle(0x0f3460, 0.6);
    this.#detailBg.fillRect(320, 52, width - 330, height - 62);
    this.#detailBg.lineStyle(2, 0x533483);
    this.#detailBg.strokeRect(320, 52, width - 330, height - 62);

    this.#detailText = this.add
      .text(330, 58, '', {
        fontSize: '13px',
        fontFamily: 'Kenney-Future-Narrow, monospace',
        color: '#e0e0e0',
        wordWrap: { width: width - 360 },
        lineSpacing: 5,
      })
      .setOrigin(0, 0);

    // Instructions
    this.add
      .text(width / 2, height - 8, 'UP/DOWN: Navigate | SPACE: View | BACK: Return', {
        fontSize: '11px',
        fontFamily: 'Kenney-Future-Narrow, monospace',
        color: '#666',
      })
      .setOrigin(0.5, 1);

    this.#renderList();
    this.#renderDetail();
  }

  update() {
    super.update();
    if (this._controls.isInputLocked) return;

    const dir = this._controls.getDirectionKeyJustPressed();

    if (dir === DIRECTION.UP) {
      if (this.#selectedIndex > 0) {
        this.#selectedIndex--;
        if (this.#selectedIndex < this.#scrollOffset) {
          this.#scrollOffset = this.#selectedIndex;
        }
        this.#renderList();
        this.#renderDetail();
      }
    } else if (dir === DIRECTION.DOWN) {
      if (this.#selectedIndex < this.#philosophers.length - 1) {
        this.#selectedIndex++;
        if (this.#selectedIndex >= this.#scrollOffset + this.#maxVisible) {
          this.#scrollOffset = this.#selectedIndex - this.#maxVisible + 1;
        }
        this.#renderList();
        this.#renderDetail();
      }
    }

    if (this._controls.wasBackKeyPressed()) {
      this.scene.stop(SCENE_KEYS.TOOLKIT_SCENE);
      this.scene.resume(this.#previousSceneName);
    }
  }

  #renderList() {
    const toolkit = dataManager.getToolkit();
    const debateHistory = dataManager.getDebateHistory();
    const gymLeaders = dataManager.getDefeatedGymLeaders();
    let currentTradition = '';
    let lines = [];

    for (let i = this.#scrollOffset; i < Math.min(this.#philosophers.length, this.#scrollOffset + this.#maxVisible); i++) {
      const phil = this.#philosophers[i];

      // Tradition header
      if (phil.tradition !== currentTradition) {
        currentTradition = phil.tradition;
        const trad = this.#traditions.find((t) => t.id === currentTradition);
        lines.push(`--- ${trad ? trad.name : currentTradition} ---`);
      }

      // Philosopher entry
      const concepts = toolkit[phil.id] || [];
      const totalMoves = phil.signature_moves ? phil.signature_moves.length : 0;
      const history = debateHistory[phil.id];
      const isGymLeader = phil.role === 'gym_leader';
      const gymDefeated = gymLeaders.includes(phil.id);

      let prefix = i === this.#selectedIndex ? '> ' : '  ';
      let suffix = '';
      if (totalMoves > 0) suffix += ` [${concepts.length}/${totalMoves}]`;
      if (isGymLeader) suffix += gymDefeated ? ' *GYM*' : ' (gym)';
      if (history) suffix += ` W${history.wins}`;

      lines.push(`${prefix}${phil.name}${suffix}`);
    }

    this.#listText.setText(lines.join('\n'));
  }

  #renderDetail() {
    const phil = this.#philosophers[this.#selectedIndex];
    if (!phil) {
      this.#detailText.setText('');
      return;
    }

    const toolkit = dataManager.getToolkit();
    const concepts = toolkit[phil.id] || [];
    const debateHistory = dataManager.getDebateHistory();
    const history = debateHistory[phil.id];
    const gymLeaders = dataManager.getDefeatedGymLeaders();
    const trad = this.#traditions.find((t) => t.id === phil.tradition);

    let text = `${phil.name} (Lv.${phil.level})\n`;
    text += `Tradition: ${trad ? trad.name : phil.tradition}\n`;
    text += `Era: ${phil.era} (${phil.active_period})\n`;
    text += `Zone: ${phil.zone} | Role: ${phil.role}\n`;

    if (phil.role === 'gym_leader') {
      text += gymLeaders.includes(phil.id) ? 'GYM BADGE: EARNED\n' : 'GYM BADGE: Not yet earned\n';
    }

    text += '\n';

    // Debate record
    if (history) {
      text += `DEBATE RECORD: ${history.wins}W / ${history.losses}L / ${history.draws}D\n`;
      text += `Best Score: ${history.bestScore.toFixed(1)}/10\n\n`;
    } else {
      text += 'DEBATE RECORD: No debates yet\n\n';
    }

    // Key works
    if (phil.key_works && phil.key_works.length > 0) {
      text += `KEY WORKS: ${phil.key_works.join(', ')}\n\n`;
    }

    // Concepts (signature moves)
    text += 'CONCEPTS LEARNED:\n';
    if (phil.signature_moves && phil.signature_moves.length > 0) {
      phil.signature_moves.forEach((move, i) => {
        if (concepts.includes(move)) {
          text += `  ${i + 1}. ${move}\n`;
        } else {
          text += `  ${i + 1}. ???\n`;
        }
      });
    } else {
      text += '  (none available)\n';
    }

    // Signature attack
    if (phil.signature_attack) {
      text += `\nSIGNATURE MOVE: ${phil.signature_attack.name}`;
      if (concepts.length >= (phil.signature_moves?.length || 0)) {
        text += `\n  ${phil.signature_attack.description}`;
      }
    }

    // Key items section (only on first philosopher viewed)
    if (this.#selectedIndex === 0) {
      const allKeyItems = dataManager.constructor.KEY_ITEMS;
      const gymCount = gymLeaders.length;
      text += '\n\nKEY ITEMS:\n';
      allKeyItems.forEach((item) => {
        if (gymCount >= item.requiredGymLeaders) {
          text += `  [OWNED] ${item.name} - ${item.description}\n`;
        } else {
          text += `  [LOCKED] ${item.name} (${item.requiredGymLeaders} gym leaders needed)\n`;
        }
      });
    }

    this.#detailText.setText(text);
  }
}
