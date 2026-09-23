/**
 * First-visit controls card (title scene).
 *
 * Cameron's playtest note: new players land on the title screen and wonder why
 * nothing works — the arrow keys and space bar are all that matter. This module
 * owns a compact DOM card listing the real key bindings, auto-shown once per
 * browser (localStorage flag) and re-openable from a small "? Controls"
 * affordance on the title scene.
 *
 * Deliberately framework-free (no Phaser), mirroring access-code.js:
 *   - pointer events are stopped at the overlay so Phaser's window-level
 *     listeners never pull focus onto the game canvas (see the access-code
 *     modal for the original focus-theft bug);
 *   - keys are intercepted with a capture-phase window listener (like the
 *     debate transcript overlay) so SPACE/ENTER dismiss the card without the
 *     same keypress reaching Phaser and, e.g., starting a new game underneath;
 *   - nothing grabs keyboard focus, so game input resumes untouched on close.
 *
 * Bindings listed here are verified against the actual handlers:
 *   Arrows  — utils/controls.js cursor keys (world movement + menu navigation)
 *   Space   — world interaction / dialog advance / menu confirm
 *   Shift   — held: run (world-scene -> player.moveCharacter isRunning);
 *             pressed: back/cancel (wasBackKeyPressed in menus and the bag)
 *   Enter   — world-scene field menu (Toolkit / Philosophers / Bag / Save / Exit)
 *   Esc     — base-scene global pause menu
 *   F       — base-scene fullscreen toggle
 *   T       — debate-scene transcript overlay (during debates)
 */

const CONTROLS_SEEN_KEY = 'ETHICA_CONTROLS_SEEN';

const FONT = "'Kenney-Future-Narrow', monospace";

/** The real key bindings, one row per key. Keep in sync with the handlers
 * documented above — list nothing that is not actually bound. */
const BINDINGS = [
  { key: '◄ ► ▲ ▼', desc: 'Move · navigate menus' },
  { key: 'SPACE', desc: 'Interact · advance text · confirm' },
  { key: 'SHIFT', desc: 'Hold to run · press to go back / close' },
  { key: 'ENTER', desc: 'Open the field menu (in the world)' },
  { key: 'ESC', desc: 'Pause menu' },
  { key: 'T', desc: 'Debate transcript (during debates)' },
  { key: 'F', desc: 'Toggle fullscreen' },
];

/** @returns {boolean} */
export function hasSeenControlsHelp() {
  try {
    return localStorage.getItem(CONTROLS_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markControlsHelpSeen() {
  try {
    localStorage.setItem(CONTROLS_SEEN_KEY, '1');
  } catch {
    /* localStorage unavailable — the card simply shows again next visit */
  }
}

/** @type {HTMLDivElement|null} */
let activeCard = null;
/** @type {((e: KeyboardEvent) => void)|null} */
let activeKeyHandler = null;

/** @returns {boolean} */
export function isControlsHelpOpen() {
  return !!activeCard;
}

/** Close the card (if open) and restore key handling exactly as it was. */
export function closeControlsHelp() {
  if (activeKeyHandler) {
    window.removeEventListener('keydown', activeKeyHandler, true);
    activeKeyHandler = null;
  }
  if (activeCard && activeCard.parentNode) {
    activeCard.parentNode.removeChild(activeCard);
  }
  activeCard = null;
}

/**
 * Show the controls card. Resolves when the player dismisses it
 * (Space / Enter / Esc / any click). Marks the first-visit flag on dismissal.
 * @returns {Promise<void>}
 */
export function showControlsHelp() {
  closeControlsHelp();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'ethica-controls-help';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 2500;
      display: flex; align-items: center; justify-content: center;
      background: rgba(10, 10, 25, 0.82);
      font-family: ${FONT};
      cursor: pointer;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      width: 430px; max-width: 90vw;
      background: #1a1a2e; color: #e0e0e0;
      border: 3px solid #c792ea; border-radius: 10px;
      padding: 22px 26px 18px;
      box-shadow: 0 0 24px rgba(199, 146, 234, 0.4);
    `;

    const title = document.createElement('div');
    title.textContent = 'CONTROLS';
    title.style.cssText =
      'color:#c792ea;font-size:20px;font-weight:bold;letter-spacing:2px;text-align:center;margin-bottom:14px;';
    panel.appendChild(title);

    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:7px;';
    BINDINGS.forEach((b) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;';
      const keycap = document.createElement('span');
      keycap.textContent = b.key;
      keycap.style.cssText = `
        flex: 0 0 96px; text-align: center;
        background: rgba(15, 52, 96, 0.95); color: #ffffff;
        border: 2px solid #533483; border-radius: 5px;
        padding: 3px 4px; font-size: 12px; letter-spacing: 1px;
      `;
      const desc = document.createElement('span');
      desc.textContent = b.desc;
      desc.style.cssText = 'font-size:13px;color:#b8b8d0;line-height:1.35;';
      row.appendChild(keycap);
      row.appendChild(desc);
      rows.appendChild(row);
    });
    panel.appendChild(rows);

    const hint = document.createElement('div');
    hint.textContent = 'SPACE / ENTER / click to close · reopen via "? CONTROLS" below';
    hint.style.cssText =
      'margin-top:14px;text-align:center;font-size:11px;color:#8888aa;border-top:1px solid #533483;padding-top:10px;';
    panel.appendChild(hint);

    overlay.appendChild(panel);

    const dismiss = () => {
      closeControlsHelp();
      markControlsHelpSeen();
      resolve();
    };

    // Keep Phaser from seeing pointer events (canvas focus-theft — see the
    // access-code modal). Any click, backdrop or panel, dismisses the card.
    ['pointerdown', 'touchstart', 'mousedown'].forEach((t) =>
      overlay.addEventListener(t, (e) => {
        e.stopPropagation();
        e.preventDefault();
      })
    );
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });

    // Capture-phase key handler: SPACE/ENTER/ESC dismiss; every key is stopped
    // so the same press never reaches Phaser's window listeners (a leaked SPACE
    // would start a new game beneath the card). Removed on close — game input
    // resumes untouched, nothing holds keyboard focus.
    activeKeyHandler = (e) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape' || e.key === 'Spacebar') {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
        return;
      }
      e.stopPropagation();
    };
    window.addEventListener('keydown', activeKeyHandler, true);

    document.body.appendChild(overlay);
    activeCard = overlay;
  });
}

/**
 * Auto-show on first visit only. Resolves true if the card was shown (and has
 * now been dismissed), false if the player had already seen it.
 * @returns {Promise<boolean>}
 */
export async function maybeShowControlsHelp() {
  if (hasSeenControlsHelp()) return false;
  await showControlsHelp();
  return true;
}
