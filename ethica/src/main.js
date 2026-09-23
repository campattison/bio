import Phaser from './lib/phaser.js';
import { SCENE_KEYS } from './scenes/scene-keys.js';
import { PreloadScene } from './scenes/preload-scene.js';
import { BattleScene } from './scenes/battle-scene.js';
import { DebateScene } from './scenes/debate-scene.js';
import { WorldScene } from './scenes/world-scene.js';
import { TitleScene } from './scenes/title-scene.js';
import { OptionsScene } from './scenes/options-scene.js';
import { TestScene } from './scenes/test-scene.js';
import { MonsterPartyScene } from './scenes/monster-party-scene.js';
import { MonsterDetailsScene } from './scenes/monster-details-scene.js';
import { InventoryScene } from './scenes/inventory-scene.js';
import { CutsceneScene } from './scenes/cutscene-scene.js';
import { DialogScene } from './scenes/dialog-scene.js';
import { ToolkitScene } from './scenes/toolkit-scene.js';
import { ArenaScene } from './scenes/arena-scene.js';
import { QuizBattleScene } from './scenes/quiz-battle-scene.js';
import { PauseMenuScene } from './scenes/pause-menu-scene.js';
import { loadPack } from './pack-loader.js';

// Configure API endpoint. In v2 the proxy serves this client AND the /api/*
// endpoints from the same origin, so default to same-origin. Set
// window.ETHICA_API_BASE before this script loads to target a remote proxy.
if (window.ETHICA_API_BASE === undefined) {
  window.ETHICA_API_BASE = '';
}

/**
 * Boot the game. The active content pack manifest is loaded first so the
 * preload scene can drive its data + zone loads from the manifest and the
 * battle engine can read its config synchronously. A manifest failure is
 * logged loudly (the pack owns the game's content, so there is no silent
 * degradation to hide behind).
 */
async function boot() {
  try {
    await loadPack();
  } catch (err) {
    console.error('[pack-loader] failed to load active pack — content will not load:', err);
  }

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    pixelArt: false,
    scale: {
      parent: 'game-container',
      width: 1024,
      height: 576,
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: {
      keyboard: {
        target: window,
      },
    },
    backgroundColor: '#000000',
  });

  game.scene.add(SCENE_KEYS.PRELOAD_SCENE, PreloadScene);
  game.scene.add(SCENE_KEYS.WORLD_SCENE, WorldScene);
  game.scene.add(SCENE_KEYS.BATTLE_SCENE, BattleScene);
  game.scene.add(SCENE_KEYS.DEBATE_SCENE, DebateScene);
  game.scene.add(SCENE_KEYS.TITLE_SCENE, TitleScene);
  game.scene.add(SCENE_KEYS.OPTIONS_SCENE, OptionsScene);
  game.scene.add(SCENE_KEYS.TEST_SCENE, TestScene);
  game.scene.add(SCENE_KEYS.MONSTER_PARTY_SCENE, MonsterPartyScene);
  game.scene.add(SCENE_KEYS.MONSTER_DETAILS_SCENE, MonsterDetailsScene);
  game.scene.add(SCENE_KEYS.INVENTORY_SCENE, InventoryScene);
  game.scene.add(SCENE_KEYS.CUTSCENE_SCENE, CutsceneScene);
  game.scene.add(SCENE_KEYS.DIALOG_SCENE, DialogScene);
  game.scene.add(SCENE_KEYS.TOOLKIT_SCENE, ToolkitScene);
  game.scene.add(SCENE_KEYS.ARENA_SCENE, ArenaScene);
  game.scene.add(SCENE_KEYS.QUIZ_BATTLE_SCENE, QuizBattleScene);
  game.scene.add(SCENE_KEYS.PAUSE_MENU_SCENE, PauseMenuScene);
  game.scene.start(SCENE_KEYS.PRELOAD_SCENE);

  // Expose for debugging/testing
  window.ETHICA_GAME = game;
}

boot();
