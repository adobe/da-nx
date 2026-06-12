/**
 * AO browser client — talks directly from the browser to Agent Orchestrator (AO).
 *
 * This is the browser-native port of da-agent's server-side `chat-adapter.ts`.
 * It removes the Cloudflare Worker from the request path: the browser opens the
 * A2A `message/stream` connection to AO itself and translates AO's JSON-RPC SSE
 * into the Vercel AI SDK UIMessageStream format that the chat UI already reads
 * via `readStream()`.
 *
 *   Before:  browser → da-agent (CF Worker) → AO
 *   Now:     browser ────────────────────────→ AO
 *
 * AO is stateful: it stores conversation history keyed by `contextId`. Only the
 * newest user message is sent per turn — never the full transcript.
 *
 * The library is framework-agnostic and dependency-free (fetch + ReadableStream
 * + TextDecoder are all browser built-ins), so it can be lifted into a shared
 * `@da/ao-client` package later without changes.
 */

const IMS_IDENTITY_URI = 'https://ns.adobe.com/a2a/extensions/adobe/ims-identity/v0';
const CONVERSATION_URI = 'https://ns.adobe.com/a2a/extensions/adobe/dx/conversation-correlation/v0';

const ARTIFACT_TEXT_KIND = 'text';

/**
 * Decode the IMS org id from a JWT payload. Returns undefined when absent.
 * IMS access tokens do not always carry the org; callers should prefer an
 * explicit org id resolved from imslib's profile/organizations APIs.
 */
export function decodeImsOrgId(token) {
  if (!token) return undefined;
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    if (decoded.ims_org_id) return decoded.ims_org_id;
    if (typeof decoded.as === 'string' && decoded.as.includes('@')) return decoded.as;
    if (Array.isArray(decoded.other_orgs) && decoded.other_orgs.length > 0) {
      return decoded.other_orgs[0];
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Decode the IMS user id (`user_id` claim) from a JWT payload. */
export function decodeImsUserId(token) {
  if (!token) return undefined;
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return decoded.user_id || decoded.sub || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve identity from a window.adobeIMS (imslib.js) instance.
 * Returns `{ token, orgId, userId }`. Org id is taken from the active profile
 * when available, otherwise decoded from the token as a best-effort fallback.
 */
export async function resolveImsIdentity(adobeIMS) {
  if (!adobeIMS) return {};
  const token = adobeIMS.getAccessToken?.()?.token ?? null;
  let orgId;
  let userId;
  try {
    const profile = await adobeIMS.getProfile?.();
    orgId = profile?.organization ? `${profile.organization}@AdobeOrg` : undefined;
    userId = profile?.userId || profile?.authId;
  } catch {
    /* profile unavailable — fall back to token claims */
  }
  return {
    token,
    orgId: orgId ?? decodeImsOrgId(token),
    userId: userId ?? decodeImsUserId(token),
  };
}

function emit(controller, encoder, event) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

function finalize(controller, encoder, hasText) {
  if (hasText) emit(controller, encoder, { type: 'text-end' });
  emit(controller, encoder, { type: 'finish-message' });
  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
  controller.close();
}

/**
 * Translate one AO SSE `data:` line into Vercel AI SDK events.
 * Returns `{ hasText, done }`. When `done` is true the stream has been closed.
 */
function processAOLine(line, hasText, controller, encoder) {
  const isMeta = line.startsWith('event:') || line.startsWith('id:');
  const raw = line.startsWith('data: ') ? line.slice(6).trim() : line.trim();
  if (isMeta || !raw || raw === '[DONE]') return { hasText, done: false };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { hasText, done: false };
  }

  if (parsed.error) {
    const message = parsed.error.message || JSON.stringify(parsed.error);
    emit(controller, encoder, { type: 'text-delta', delta: `AO error: ${message}` });
    finalize(controller, encoder, true);
    return { hasText: true, done: true };
  }

  const { result } = parsed;
  if (!result) return { hasText, done: false };

  let nextHasText = hasText;

  if (result.kind === 'artifact-update') {
    const parts = result.artifact?.parts ?? [];
    for (const part of parts) {
      if (part.kind === ARTIFACT_TEXT_KIND && part.text) {
        nextHasText = true;
        emit(controller, encoder, { type: 'text-delta', delta: part.text });
      }
    }
    return { hasText: nextHasText, done: false };
  }

  if (result.kind === 'status-update') {
    if (result.final === true) {
      if (result.status?.state === 'failed') {
        const message = result.status?.message
          || result.status?.error
          || 'AO session failed (no details provided).';
        emit(controller, encoder, { type: 'text-delta', delta: String(message) });
        nextHasText = true;
      }
      finalize(controller, encoder, nextHasText);
      return { hasText: nextHasText, done: true };
    }
    return { hasText: nextHasText, done: false };
  }

  if (result.kind === 'task') {
    for (const artifact of result.artifacts ?? []) {
      for (const part of artifact.parts ?? []) {
        if (part.kind === ARTIFACT_TEXT_KIND && part.text) {
          nextHasText = true;
          emit(controller, encoder, { type: 'text-delta', delta: part.text });
        }
      }
    }
    finalize(controller, encoder, nextHasText);
    return { hasText: nextHasText, done: true };
  }

  return { hasText: nextHasText, done: false };
}

function createTranslatingStream(aoBody) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = aoBody.getReader();
  let buffer = '';
  let hasText = false;

  // The AO read loop is driven from start() rather than pull(). Chrome does not
  // reliably re-invoke pull() when a pull resolves without enqueuing anything
  // (which happens for AO's non-text events like status-update/usage-update),
  // so a pull-based reader stalls in the browser. A start() loop reads AO
  // continuously and only enqueues the translated text events. Volume is tiny
  // (chat SSE), so the lack of pull backpressure is irrelevant here.
  return new ReadableStream({
    async start(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            finalize(controller, encoder, hasText);
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const res = processAOLine(line, hasText, controller, encoder);
            hasText = res.hasText;
            if (res.done) return;
          }
        }
      } catch (err) {
        emit(controller, encoder, {
          type: 'error',
          errorText: err instanceof Error ? err.message : String(err),
        });
        controller.close();
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

function randomId(prefix) {
  const rand = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 12);
  return `${prefix}-${rand}`;
}

/**
 * Create an AO client bound to a backend URL and an identity resolver.
 *
 * @param {object} options
 * @param {string} options.backendUrl  AO base URL (e.g. https://ao.adobe.io or localhost:64053)
 * @param {() => (Promise<object>|object)} options.getIdentity  Resolves { token, orgId, userId }.
 *   Typically `() => resolveImsIdentity(window.adobeIMS)`.
 * @param {boolean} [options.sendImsIdentity=true]  Attach the ims-identity A2A
 *   extension when a token is present. Set false against a local AO that runs
 *   with token validation disabled — it cannot validate the token and will drop
 *   the connection. Local dev relies on the x-user-id / x-tenant-id headers.
 */
export function createAOClient({ backendUrl, getIdentity, sendImsIdentity = true }) {
  if (!backendUrl) throw new Error('createAOClient: backendUrl is required');
  const base = backendUrl.replace(/\/+$/, '');

  /**
   * Send the newest user message to AO and stream the reply.
   *
   * @param {object} params
   * @param {string} params.message    Newest user message text.
   * @param {string} params.contextId  Stable conversation id (AO session). Reuse across turns.
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{ ok: boolean, status: number, body: ReadableStream<Uint8Array> }>}
   *   A fetch-Response-like object whose `body` emits Vercel AI SDK SSE events,
   *   consumable directly by the chat UI's `readStream()`.
   */
  async function streamChat({ message, contextId, signal }) {
    const identity = (await getIdentity?.()) ?? {};
    const { token, orgId, userId = 'anonymous' } = identity;

    const messageId = randomId('msg');
    const ctx = contextId || randomId('da-ctx');

    const metadata = {};
    // The ims-identity extension makes AO validate the bearer token against IMS.
    // Only attach it when we have a token AND the caller opted in (prod path).
    // Against a local AO with token validation disabled it cannot validate the
    // token and closes the connection, so we fall back to the x-user-id /
    // x-tenant-id headers below instead.
    if (sendImsIdentity && token && orgId) {
      metadata[IMS_IDENTITY_URI] = { imsOrgId: orgId, imsUserId: userId };
    }
    metadata[CONVERSATION_URI] = { conversationId: ctx, interactionId: messageId };

    const rpc = {
      jsonrpc: '2.0',
      id: randomId('rpc'),
      method: 'message/stream',
      params: {
        message: {
          messageId,
          role: 'user',
          parts: [{ kind: 'text', text: message }],
          contextId: ctx,
          metadata,
        },
        configuration: {
          acceptedOutputModes: ['text', 'text/plain'],
          blocking: false,
        },
      },
    };

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    headers['x-user-id'] = userId;
    if (orgId) {
      headers['x-tenant-id'] = orgId;
      headers['x-gw-ims-org-id'] = orgId;
    }

    const resp = await fetch(`${base}/a2a/rpc`, {
      method: 'POST',
      headers,
      body: JSON.stringify(rpc),
      signal,
    });

    if (!resp.ok || !resp.body) {
      const detail = await resp.text().catch(() => '');
      throw new Error(`AO responded ${resp.status}${detail ? `: ${detail}` : ''}`);
    }

    return { ok: true, status: resp.status, body: createTranslatingStream(resp.body) };
  }

  return { streamChat };
}
