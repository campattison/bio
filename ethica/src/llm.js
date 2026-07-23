/**
 * LLM transport (v2) — replaces server/src/services/cli-bridge.js.
 *
 * Builds restricted Anthropic Messages API bodies and POSTs them to the proxy
 * at `${window.ETHICA_API_BASE ?? ''}/api/llm` with an `X-Access-Code` header.
 * The proxy validates, forwards to Anthropic with the server-held key, and
 * meters spend. This module never sees the Anthropic key.
 *
 *   - Philosopher voice + free dialogue: streaming (claude-opus-4-8),
 *     content_block_delta text deltas → onToken callback.
 *   - Judges / suggester / toolkit / quiz: non-streaming (claude-sonnet-5)
 *     with structured outputs (output_config.format json_schema). The single
 *     text block is JSON.parse'd; on parse/schema failure we THROW (fail loud) —
 *     there is no silent 5/5/5 fallback in the transport layer.
 */

import {
  getAccessCode,
  clearAccessCode,
  promptForAccessCode,
  setBudget,
  showBudgetExhausted,
} from './utils/access-code.js';

export const MODELS = Object.freeze({
  PHILOSOPHER: 'claude-opus-4-8',
  DIALOGUE: 'claude-opus-4-8',
  JUDGE: 'claude-sonnet-5',
  SUGGESTER: 'claude-sonnet-5',
  TOOLKIT: 'claude-sonnet-5',
});

/** Error thrown when the code's budget is exhausted (HTTP 402). */
export class BudgetExhaustedError extends Error {
  constructor(info = {}) {
    super('budget_exhausted');
    this.name = 'BudgetExhaustedError';
    this.info = info;
  }
}

/** Error thrown when structured output cannot be parsed / is schema-invalid. */
export class LLMParseError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'LLMParseError';
    this.raw = raw;
  }
}

/**
 * Enforce numeric score ranges on a parsed structured result.
 *
 * Anthropic structured outputs (output_config.format json_schema) do NOT support
 * numeric constraints (minimum/maximum/multipleOf) or array constraints
 * (minItems/maxItems) — sending them 400s. The schemas therefore carry types
 * only, and ranges are enforced HERE, after JSON.parse:
 *   - integer fields (score dimensions)  → clamped to [1, 10]
 *   - number fields  (weighted scores)   → clamped to [0, 10]
 * A field that is present but not a finite number THROWS (fail loud — no silent
 * coercion to 0). Absent/null fields are left untouched so caller-side fallbacks
 * (e.g. the recall judge computing weighted_score when the model omits it) still
 * work. Mutates `obj` in place and returns it.
 * @param {object} obj - parsed structured result
 * @param {object} schema - the (constraint-free) JSON schema used for the call
 * @returns {object}
 */
export function enforceScoreRanges(obj, schema) {
  if (!obj || typeof obj !== 'object' || !schema || !schema.properties) return obj;
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (!spec || !(key in obj)) continue;
    const type = Array.isArray(spec.type) ? spec.type[0] : spec.type;
    if (type !== 'integer' && type !== 'number') continue;
    const v = obj[key];
    if (v == null) continue; // absent/null: leave for caller-side fallback
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new LLMParseError(
        `Structured output field "${key}" must be a number, got ${JSON.stringify(v)}`,
        obj,
      );
    }
    obj[key] = type === 'integer' ? Math.min(10, Math.max(1, Math.round(v))) : Math.min(10, Math.max(0, v));
  }
  return obj;
}

function apiBase() {
  return (typeof window !== 'undefined' && window.ETHICA_API_BASE) || '';
}

/**
 * Merge in cross-origin proxy headers. When the API base points at an ngrok
 * tunnel, `ngrok-skip-browser-warning` suppresses ngrok's HTML interstitial so
 * fetch receives the real JSON/SSE response instead of the warning page. No-op
 * for same-origin (local) play, so behaviour there is unchanged.
 * @param {object} [extra]
 */
function proxyHeaders(extra = {}) {
  const headers = { ...extra };
  if (/\bngrok\b|ngrok-free\.app|ngrok\.app|ngrok\.io/i.test(apiBase())) {
    headers['ngrok-skip-browser-warning'] = '1';
  }
  return headers;
}

/** Read X-Budget-Spent / X-Budget-Cap headers into the shared budget cache. */
function captureBudget(res) {
  const spent = res.headers.get('X-Budget-Spent');
  const cap = res.headers.get('X-Budget-Cap');
  setBudget(spent !== null ? parseFloat(spent) : null, cap !== null ? parseFloat(cap) : null);
}

/**
 * POST a body to /api/llm with auth + budget handling. Retries once after a 401
 * (prompting for a fresh code). Returns the raw Response for the caller to read
 * (SSE stream or JSON). Throws BudgetExhaustedError on 402.
 * @param {object} body - restricted Anthropic Messages API request
 * @returns {Promise<Response>}
 */
async function sendRequest(body) {
  let code = getAccessCode();
  if (!code) {
    code = await promptForAccessCode();
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${apiBase()}/api/llm`, {
      method: 'POST',
      headers: proxyHeaders({
        'Content-Type': 'application/json',
        'X-Access-Code': code,
      }),
      body: JSON.stringify(body),
    });

    captureBudget(res);

    if (res.status === 401) {
      clearAccessCode();
      code = await promptForAccessCode({ message: 'That code was not accepted. Try again.' });
      continue;
    }

    if (res.status === 402) {
      let info = {};
      try {
        info = await res.json();
      } catch {
        /* ignore */
      }
      showBudgetExhausted(info);
      throw new BudgetExhaustedError(info);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 300)}`);
    }

    return res;
  }

  throw new Error('invalid_code');
}

/**
 * Stream a philosopher/dialogue message. Fires onToken for each text delta.
 * @param {object} params
 * @param {Array} params.system - system blocks (with optional cache_control)
 * @param {Array} params.messages - Anthropic messages array
 * @param {string} [params.model=MODELS.PHILOSOPHER]
 * @param {number} [params.maxTokens=1024]
 * @param {function} [params.onToken] - called with each text delta string
 * @returns {Promise<{text: string, usage: object|null}>}
 */
export async function streamMessage({ system, messages, model = MODELS.PHILOSOPHER, maxTokens = 1024, onToken }) {
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
    stream: true,
  };

  const res = await sendRequest(body);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let usage = null;

  const handleEvent = (raw) => {
    // Each SSE event is one or more lines; we only care about `data:` lines.
    for (const line of raw.split('\n')) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let obj;
      try {
        obj = JSON.parse(payload);
      } catch {
        continue;
      }
      switch (obj.type) {
        case 'content_block_delta':
          if (obj.delta && (obj.delta.type === 'text_delta' || typeof obj.delta.text === 'string')) {
            const chunk = obj.delta.text || '';
            if (chunk) {
              text += chunk;
              if (onToken) onToken(chunk);
            }
          }
          break;
        case 'message_delta':
          if (obj.usage) usage = { ...(usage || {}), ...obj.usage };
          break;
        case 'message_start':
          if (obj.message && obj.message.usage) usage = { ...(usage || {}), ...obj.message.usage };
          break;
        default:
          break;
      }
    }
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE events are separated by a blank line (\n\n).
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      handleEvent(event);
    }
  }
  if (buffer.trim()) handleEvent(buffer);

  return { text: text.trim(), usage };
}

/**
 * Non-streaming structured request. Returns the parsed JSON object from the
 * single text content block. THROWS (LLMParseError) if the output cannot be
 * parsed — no silent fallback.
 * @param {object} params
 * @param {Array} params.system - system blocks
 * @param {Array} params.messages - Anthropic messages array
 * @param {object} params.schema - JSON schema for output_config.format
 * @param {string} [params.schemaName='result']
 * @param {string} [params.model=MODELS.JUDGE]
 * @param {number} [params.maxTokens=1024]
 * @returns {Promise<object>}
 */
export async function structuredMessage({
  system,
  messages,
  schema,
  schemaName = 'result',
  model = MODELS.JUDGE,
  maxTokens = 1024,
}) {
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
    stream: false,
    output_config: {
      format: {
        type: 'json_schema',
        schema,
      },
    },
  };
  // NOTE: Anthropic's output_config.format accepts only `type` and `schema`.
  // A `name` key is rejected: "output_config.format.name: Extra inputs are not
  // permitted" (HTTP 400). `schemaName` is retained in the signature for call-site
  // documentation but is deliberately NOT sent on the wire.
  void schemaName;

  const res = await sendRequest(body);

  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new LLMParseError(`Proxy returned non-JSON response: ${e.message}`, null);
  }

  // Anthropic Messages response shape: { content: [{ type:'text', text }], usage }
  const block = Array.isArray(json.content) ? json.content.find((b) => b.type === 'text') : null;
  const rawText = block ? block.text : typeof json === 'object' && json.text ? json.text : null;

  if (rawText == null) {
    throw new LLMParseError('Structured response had no text content block', json);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new LLMParseError(`Failed to parse structured output as JSON: ${e.message}`, rawText);
  }
  // Clamp/validate numeric scores here — the schema can no longer constrain them
  // on the wire (Anthropic rejects minimum/maximum). Throws on non-numeric junk.
  return enforceScoreRanges(parsed, schema);
}
