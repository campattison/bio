/**
 * Access-code UX (v2).
 *
 * The proxy authenticates every /api/llm and /api/save call with an
 * `X-Access-Code` header. This module owns:
 *   - the stored access code (localStorage)
 *   - a plain-DOM modal that asks for a code (title-scene launch, or on 401)
 *   - the last-known budget (from X-Budget-Spent / X-Budget-Cap headers)
 *   - a "budget used up" overlay (on 402)
 *
 * Deliberately framework-free (no Phaser) so it can be driven from llm.js /
 * save-sync.js as well as scenes.
 */

const ACCESS_CODE_KEY = 'ETHICA_ACCESS_CODE';

/** @type {{spent: number|null, cap: number|null}} */
const budget = { spent: null, cap: null };

const FONT = "'Kenney-Future-Narrow', monospace";

/** @returns {string|null} */
export function getAccessCode() {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY);
  } catch {
    return null;
  }
}

/** @param {string} code */
export function setAccessCode(code) {
  try {
    localStorage.setItem(ACCESS_CODE_KEY, code);
  } catch {
    /* localStorage unavailable — code lives only for this session via closure callers */
  }
}

export function clearAccessCode() {
  try {
    localStorage.removeItem(ACCESS_CODE_KEY);
  } catch {
    /* noop */
  }
}

export function hasAccessCode() {
  return !!getAccessCode();
}

// ─── Budget tracking ───

/**
 * Record budget from response headers. Values are dollars (4dp) per spec.
 * @param {number|null} spent
 * @param {number|null} cap
 */
export function setBudget(spent, cap) {
  if (spent !== null && !Number.isNaN(spent)) budget.spent = spent;
  if (cap !== null && !Number.isNaN(cap)) budget.cap = cap;
}

/** @returns {{spent: number|null, cap: number|null, remaining: number|null}} */
export function getBudget() {
  const remaining = budget.cap !== null && budget.spent !== null ? Math.max(0, budget.cap - budget.spent) : null;
  return { spent: budget.spent, cap: budget.cap, remaining };
}

/** Human-readable remaining budget, e.g. "$3.47 of $5.00 left" or "" if unknown. */
export function budgetLabel() {
  const { spent, cap, remaining } = getBudget();
  if (remaining === null || cap === null) return '';
  return `Budget: $${remaining.toFixed(2)} of $${cap.toFixed(2)} left`;
}

// ─── DOM modal ───

let activeModal = null;

function removeActiveModal() {
  if (activeModal && activeModal.parentNode) {
    activeModal.parentNode.removeChild(activeModal);
  }
  activeModal = null;
}

/**
 * Show the access-code modal. Resolves with the entered code (already stored).
 * @param {object} [opts]
 * @param {string} [opts.message] - explanatory line (e.g. invalid-code notice)
 * @returns {Promise<string>}
 */
export function promptForAccessCode(opts = {}) {
  removeActiveModal();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'ethica-access-code-modal';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 3000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(10, 10, 25, 0.88);
      font-family: ${FONT};
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      width: 420px; max-width: 90vw;
      background: #1a1a2e; color: #e0e0e0;
      border: 3px solid #c792ea; border-radius: 10px;
      padding: 28px 26px; text-align: center;
      box-shadow: 0 0 24px rgba(199, 146, 234, 0.4);
    `;

    const title = document.createElement('div');
    title.textContent = 'ENTER ACCESS CODE';
    title.style.cssText = 'color:#c792ea;font-size:20px;font-weight:bold;letter-spacing:2px;margin-bottom:14px;';

    const msg = document.createElement('div');
    msg.textContent = opts.message || 'Ask Cameron for your ETHICA access code to begin.';
    msg.style.cssText = 'font-size:13px;line-height:1.5;margin-bottom:18px;color:#b8b8d0;';

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'access code';
    input.style.cssText = `
      width: 100%; box-sizing: border-box;
      background: rgba(15, 52, 96, 0.95); color: #ffffff;
      border: 2px solid #533483; border-radius: 6px;
      padding: 12px; font-family: ${FONT}; font-size: 15px;
      text-align: center; outline: none; margin-bottom: 16px;
    `;

    const button = document.createElement('button');
    button.textContent = 'CONNECT';
    button.style.cssText = `
      width: 100%; height: 42px;
      background: #533483; color: #ffffff;
      border: 2px solid #c792ea; border-radius: 6px;
      font-family: ${FONT}; font-size: 15px; letter-spacing: 1px;
      cursor: pointer;
    `;

    const submit = () => {
      const code = input.value.trim();
      if (!code) {
        input.style.borderColor = '#f78c6c';
        return;
      }
      setAccessCode(code);
      removeActiveModal();
      resolve(code);
    };

    const focusInput = () => {
      try {
        input.focus();
      } catch {
        /* noop */
      }
    };

    button.addEventListener('click', submit);

    // Keep keystrokes in the DOM input: Phaser's keyboard plugin listens on
    // `window` (see main.js input.keyboard.target) and captures/preventDefaults
    // keys it has bound (arrows, space, ENTER, F, ...). Stopping propagation on
    // the field's own key events means those events never bubble to Phaser, so
    // the character reaches the input instead of being swallowed. Mirrors the
    // debate scene's #showTextInput() handling.
    const stopKey = (e) => e.stopPropagation();
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    input.addEventListener('keyup', stopKey);
    input.addEventListener('keypress', stopKey);
    input.addEventListener('paste', stopKey);

    // Keep focus on the DOM input: Phaser makes the game canvas focusable
    // (tabindex=0) and its window-level pointer listeners pull focus onto the
    // canvas on mousedown. Once the canvas holds focus, keystrokes go to Phaser
    // and the field looks "dead". Stopping pointer events at the overlay keeps
    // Phaser from ever seeing the click, and re-focusing on backdrop clicks
    // keeps the caret in the field. (Root cause of the "typing does nothing" bug.)
    const stopPointer = (e) => e.stopPropagation();
    ['pointerdown', 'touchstart', 'click'].forEach((t) =>
      overlay.addEventListener(t, stopPointer)
    );
    overlay.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      // A mousedown on the backdrop/panel would otherwise blur the field (and
      // hand focus to the canvas). Suppress the default focus change and keep
      // the caret in the input. Clicks on the input/button behave normally.
      if (e.target !== input && e.target !== button) {
        e.preventDefault();
        focusInput();
      }
    });

    panel.appendChild(title);
    panel.appendChild(msg);
    panel.appendChild(input);
    panel.appendChild(button);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    activeModal = overlay;

    // Autofocus, robustly: immediately, after layout, and once more on a timer,
    // since Phaser can grab focus during boot.
    focusInput();
    requestAnimationFrame(focusInput);
    setTimeout(focusInput, 50);
  });
}

/**
 * Ensure a code exists; prompt for one if not. Resolves with the code.
 * @returns {Promise<string>}
 */
export async function ensureAccessCode() {
  const existing = getAccessCode();
  if (existing) return existing;
  return promptForAccessCode();
}

/**
 * Friendly "budget used up" overlay (402). Non-dismissable action other than a
 * reload — the game cannot make model calls until Cameron tops up the code.
 * @param {object} [info] - { spent, cap } from the 402 body
 */
export function showBudgetExhausted(info = {}) {
  removeActiveModal();

  const overlay = document.createElement('div');
  overlay.id = 'ethica-budget-exhausted-modal';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 3000;
    display: flex; align-items: center; justify-content: center;
    background: rgba(10, 10, 25, 0.92);
    font-family: ${FONT};
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    width: 440px; max-width: 90vw;
    background: #1a1a2e; color: #e0e0e0;
    border: 3px solid #f78c6c; border-radius: 10px;
    padding: 30px 26px; text-align: center;
  `;

  const cap = typeof info.cap === 'number' ? `$${info.cap.toFixed(2)}` : 'your limit';
  panel.innerHTML = `
    <div style="color:#f78c6c;font-size:20px;font-weight:bold;letter-spacing:1px;margin-bottom:14px;">BUDGET USED UP</div>
    <div style="font-size:14px;line-height:1.6;color:#d8d8e8;">
      Your battle budget (${cap}) is spent. Ask Cameron for a top-up,
      then reload to keep debating.
    </div>
    <div style="font-size:11px;color:#8888aa;margin-top:18px;">You can still explore the world — only model calls are paused.</div>
  `;

  const dismiss = document.createElement('button');
  dismiss.textContent = 'DISMISS';
  dismiss.style.cssText = `
    margin-top: 20px; width: 160px; height: 38px;
    background: #533483; color: #fff;
    border: 2px solid #f78c6c; border-radius: 6px;
    font-family: ${FONT}; font-size: 14px; cursor: pointer;
  `;
  dismiss.addEventListener('click', removeActiveModal);
  panel.appendChild(dismiss);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  activeModal = overlay;
}
