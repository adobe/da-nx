# nx-chat-ao

An AO-only (Agent Orchestrator) chat block — a separate element from `nx-chat`
(see [`chat-ui-component.md`](./chat-ui-component.md) for the da-agent client),
not a variant of it. Built clean against AO's real wire protocol rather than
ported from da-agent's client, since the two backends' interaction models
(episodes, questions, permission requests) differ enough that sharing a
controller would mean branching throughout instead of a clean implementation
per backend. Which client loads for a given org/site is decided by
`loadChat()` in `nx2/utils/chat.js` (the `ew.coworker` flag, or the
`?nx-chat-ao=true` dev override).

## Session warming

`AoChatController.warmSession()` (`ao-controller.js`) kicks the current
episode's backend session awake as soon as the user starts typing, so the
orchestrator's cold start happens during typing instead of after Send.

- **Existing episodes only.** Warming a brand-new (no `episodeId` yet)
  session would create a real, persisted episode immediately — leaving an
  empty orphaned one behind if the user never actually sends anything.
- **At most once per episode.** `_warmedEpisodeId` naturally goes stale (and
  lets a fresh warm through) the moment `_episodeId` changes.
- **Opens the WebSocket too**, after the REST warm call — AO's own guidance
  is to sequence them, and connecting early means `sendMessage`'s later
  `_ensureSocket()` call just reuses an already-open (or already-connecting)
  socket instead of starting from scratch.
- **Sends ATTACH after connecting.** AUTH alone doesn't get `SESSION_READY`
  moving — AO only prepares the session (and replies with `SESSION_READY`)
  once it sees the connection's first op (`SESSION_INIT`/`USER_INPUT`/
  `RESUME`/`ATTACH`). `ATTACH` is the one built for exactly this: "join this
  episode, don't submit a turn."
- **Failures stay silent.** If the backend session isn't actually live yet,
  AO replies with an `ERROR` frame instead of `SESSION_READY`. `_handleServerEvent`
  only surfaces `ERROR_CONNECTION`/`ERROR_SESSION` to the user while
  `_thinking` is true, so a failed *warm* attempt never shows up — `sendMessage`
  just connects (and attaches) fresh when the user actually sends.

`_ensureSocket()` coalesces concurrent callers (warming opening the socket
early, `sendMessage` needing it moments later) onto the same in-flight
connection attempt via `_connecting` — without this, a second call while the
first is still connecting would open a competing WebSocket.

**Not yet implemented:** warming a brand-new session. Extending past existing
episodes needs a way to avoid leaving an orphaned empty episode behind.

## Connection recovery

A closed WebSocket during a turn used to be treated as fatal — an immediate
"Error: connection closed" and `_done()`. That was wrong: AO's episode
session is durable server-side and can still be actively working (e.g.
mid-retry on a tool call) when the socket drops for an unrelated reason —
confirmed by a real case where the socket closed while AO was retrying a
`da__da_update_source` call (a `tool_call_end` with `success: false` and
`result: "...not executed — retrying."`, immediately followed by a fresh
`tool_call_detected` for the same tool, same turn), and the turn went on to
finish successfully server-side — visible only after a reload pulled the
real answer from REST history, since the live client had already given up
and stopped listening.

`_recoverFromClose()` now reattaches (`_ensureSocket()` + `ATTACH`) once
instead of declaring the turn dead, and otherwise does nothing — `_thinking`
stays true, so the UI keeps showing progress while waiting for the turn's
remaining events over the reattached socket. Only a failed *reattach* (not
the original close) surfaces an error. A genuinely dead session still ends
the turn correctly: it surfaces via the normal `ERROR_CONNECTION`/
`ERROR_SESSION` handling once reattached. This does one recovery attempt,
not retry-with-backoff — a repeatedly-flapping connection reattaches on every
close with no delay; full backoff (with delay/attempt-limits) is a capability
nx-chat already has and nx-chat-ao deliberately hasn't built yet.

## Episode switching

`switchEpisode`/`startNewEpisode` (`ao-controller.js`) are blocked by
`_blockedByActiveTurn`, which is true only while `_thinking` **and** there's
no pending question. A pending question means the turn is merely suspended
(not actively streaming) — AO persists it durably, so it's safe to abandon
and pick back up later; `_loadEpisode` re-hydrates it via
`fetchEpisodeContext`. Only genuinely in-flight generation should block
switching away.

`_loadEpisode` clears messages and sets `_loadingEpisode = true` synchronously
*before* fetching, so switching feels instant rather than leaving stale
messages on screen for however long the fetch takes.

**`_refreshEpisodeList` never overwrites a known list with an empty one.**
`fetchEpisodes` (`utils/episodes.js`) collapses every failure mode — a
non-ok response, a thrown error — into a plain `[]`, indistinguishable from
"you genuinely have zero episodes." But `_refreshEpisodeList` only ever runs
right after `SESSION_READY` reports a new episode id, meaning at least one
episode (the one that was just created) must exist — so an empty result
there can only mean the fetch itself failed. Without the guard, one transient
failure (a network blip, a token-refresh race) at exactly that moment would
wipe the *entire* session picker, not just fail to add the new episode —
confirmed as a real bug report (2026-08-25): starting a second new session
made the first one disappear from the picker entirely, not just show
untitled or out of order.

**`EPISODE_TITLE_UPDATED` upserts instead of only patching.** It used to only
`.map()` an existing entry, so if the episode wasn't already in `_episodes`
yet — `_refreshEpisodeList`'s fetch for it hadn't resolved, or failed — the
title had nothing to match and was silently dropped; the picker only ever
picked it up after a full reload re-fetched everything from scratch. Now, if
the episode isn't found, a new `{ id, title }` entry is inserted at the front
(matching `fetchEpisodes`' most-recent-first order) instead of no-op'ing, so
the picker reflects the title live regardless of whether the other fetch
path ever succeeded. A missing/falsy title with no existing entry is still a
genuine no-op — there's nothing useful to insert (bare id, no label).

## Question flow

AO pauses a turn by sending a `USER_QUESTION`/`question` event (see the
[AO wire-protocol note](#ao-wire-protocol-notes) below on the event-name
discrepancy) — this is the only shape AO sends for a "should I proceed?"
pause today; no separate permission-request concept has shown up in practice
for this client.

**Responding to a resumed question — cold vs. warm connection.** `_respondToQuestion`
checks whether the socket was already open *before* sending:

- **Already open** (mid-session): send `QUESTION_RESPONSE` directly.
- **Not open** (e.g. the episode was restored from REST and has no live
  socket): a bare `QUESTION_RESPONSE` is rejected by AO as an invalid first
  op on a fresh connection. Wrap it in the generic `RESUME` op instead —
  `{ type: 'RESUME', turn_id, data: { type: 'question-response', answers, declined } }`
  — which AO accepts as a first op and dispatches by `data.type`.

**Rendering `context`/`question` text.** AO's question/context payloads
sometimes carry literal backslash-n sequences instead of real newlines, which
`parseMarkdown` would otherwise render as visible `\n` text rather than
paragraph breaks. `question-card.js` runs both fields through
`unescapeLiteralNewlines` (`utils/markdown.js`) before `renderMarkdown` — not
folded into `renderMarkdown` itself, since it's a quirk of these specific AO
fields, not a general markdown-rendering concern (regular assistant text
doesn't need it). For the same reason, the `context`/`question` containers
are `<div>`s, not `<p>`s — markdown output can itself contain block elements
(paragraphs, lists), which can't validly nest inside a `<p>`.

**"Other" is a real, grouped radio/checkbox** (`question-card.js`), not a
separate free-standing text field — this is what makes Tab/Arrow-keys/
Space/Enter work identically for every option in the group, with no custom
keyboard-nav code. The one thing the radio's own `@change` handler must
**not** do is jump focus into its paired text field: arrow-key movement in a
native radiogroup always both moves *and* selects, so auto-focusing the text
field on selection meant arrowing onto "Other" (even just passing through)
yanked focus out of the group entirely, trapping keyboard users there.
Reaching the text field to actually type is one more Tab press, the same as
moving between any two distinct native controls — and only *typing* in it
(never merely focusing/tabbing through) marks it as the chosen answer, so
passing through on the way to Submit never clobbers a previously-picked fixed
option.

**Keyboard shortcuts:**
- **Enter** on a fixed option mirrors Space (a native no-op on radio/checkbox)
  and also submits once that answer satisfies every required question.
- **Enter** on "Other" does the same, but moves focus into the text field
  first when there's nothing typed yet to submit.
- **Escape** mirrors clicking Skip, from anywhere in the card.

**Not yet implemented / open TODOs:** screen-reader verification, multi-question
layout testing under real content, focus-ring polish, component test coverage.

## Plan approval

AO suspends a turn with `plan_approval_request` (`data: { turn_id, plan_file_path,
plan_content }`) when the agent wants sign-off on a plan before acting on it.
Unlike the question flow, this renders **inline in the message log**
(`.chat-messages-container`), not as a card floating over the input — a plan
is read-heavy prose the user is meant to actually read, so it fits better as
part of the conversation than as a popup competing for space with the
textarea. `chat-ao.js`'s `renderPlanApprovalCard` shows it in place of the
"Thinking..." indicator, with the plan content run through `renderMarkdown`,
a feedback text input, and Approve/Reject buttons.

**Responding always uses `RESUME`, with no cold/warm distinction.** Plan
approval has no dedicated response frame of its own — the server dispatches
by `data.type` inside the generic `RESUME` op:

```json
{ "type": "RESUME", "turn_id": "...", "data": { "type": "plan-response", "decision": "approve"|"reject", "feedback": "...", "edited_plan_content": null } }
```

This is simpler than the question flow: `RESUME` is always a valid *first*
op (unlike a bare `QUESTION_RESPONSE`), so `respondToPlanApproval` never
needs to check whether the socket was already open before sending.

**REST hydration** (`fetchEpisodeContext`, restoring a suspended episode) is
a discriminated result now — `{ type: 'question', ... }` or
`{ type: 'plan', turnId, planContent, planFilePath }` — read from
`suspendedTurn.questionData` or `suspendedTurn.planData` respectively
(confirmed against AO's actual `_serialize_suspended_turn` in
`apps/a2a/api/routes/episodes.py`; `planData` is
`{ planContent, planFilePath }`, camelCased on the wire). `_loadEpisode`
hydrates whichever one AO reports into `_pendingQuestion`/`_pendingPlanApproval`.

**Genuinely non-blocking — the input stays enabled.** Unlike a pending
question, a pending plan approval does *not* disable the chat input.
`chat-ao.js`'s `_blocked` getter (`thinking && !pendingPlanApproval`) is what
every input-disabling/send-blocking site checks instead of raw `thinking` —
the textarea's `disabled` state, `_submit`'s stop-vs-send branch, `_sendPrompt`,
and `ao-controller.js`'s own `sendMessage` guard. A pending question still
uses raw `thinking` and stays blocking, unchanged.

This isn't just a UI preference — AO has a real backend mechanism,
`conversational_resume` (`agents/config/base.py`, off by default, not yet
enabled for `experience-workspace`), that resolves a suspended turn (plan
approval, question, permission) from an ordinary free-text reply instead of
requiring the structured frame. Once enabled, a user can just type "looks
good" into the normal input instead of clicking Approve. Until then, a
message sent while a plan is pending is simply treated as a new, unrelated
turn — the plan card doesn't clear itself in that case, since we don't know
whether the reply was actually about the plan.

Because there's no dedicated event marking "the plan was resolved via
conversational text" (it just looks like an ordinary resumed turn once
`conversational_resume` picks it up), `_handleServerEvent`'s `TEXT_DELTA`
branch also clears `_pendingPlanApproval` defensively — text streaming again
means the turn resumed one way or another, so the card would otherwise linger
with nothing left to click.

Both pending questions and pending plan approvals are still exempted from
`_blockedByActiveTurn`, so switching episodes or starting a new one while
either is awaiting a decision is allowed — the turn is durably suspended
server-side regardless of whether the local input is disabled.

## Markdown rendering

`renderMarkdown` (`utils/markdown.js`) shares `parseMarkdown`
(`shared/chat/markdown.js`) with `nx-chat` — same `remarkGfmNoLink` parser,
which intentionally suppresses GFM autolink literals. That means a bare URL
in AO's response text (e.g. "see https://example.com for details") would
otherwise render as inert plain text. `renderMarkdown` runs the same
`linkifyBareUrls`/`sanitizeLinks` pass as `chat/renderers/renderers.js`
(`chat/utils/links.js`) to fix that — this isn't a da-agent-specific
customization, it's compensating for a parser choice both blocks share, so
both need it.

## Tool-call activity

AO streams three WS events per tool call — `tool_call_detected` (name only,
before args are ready), `tool_call_start` (`{tool_call_id, tool_name,
arguments}`), `tool_call_end` (`{tool_call_id, result, success, duration_s}`)
— all keyed by `tool_call_id`, verified against `agents/events.py` and
`tool_executor/executor.py` in AO's backend. This is generic across every
tool type (native, MCP, skill, code-exec); no manifest opt-in is needed to
receive them.

`ao-controller.js` handles all three events, patching the same
`{ role: 'assistant', toolCall: {...} }` entry in `_messages` in place by
`toolCallId` (same entry-patching pattern as `hydrateToolCall`'s summary
rows) — `tool_call_detected` appends the entry (`status: 'detected'`, name
only, no args yet); `tool_call_start` upgrades it to `status: 'running'` with
`arguments`, appending fresh only if no `detected` row arrived first (AO
doesn't guarantee `detected` fires before `start`); `tool_call_end` upgrades
it again to `status: 'success'`/`'error'` with `result`. No event is skipped
— `detected` gets the card on screen (and the "Using X" label locked in) as
early as possible, before AO even has the tool's arguments ready. Both start
and end also carry `data.metadata.skill_title` for a `skill` tool call —
surfaced as `toolCall.title` and preferred over the raw `tool_name` ("skill")
in the card's summary line, so a skill invocation reads as e.g. "AEM Sites DA
Page Update" instead of "skill".

`chat-ao.js`'s `renderToolCallCard` is a small collapsible `<details>` (styled
after this file's own existing `.selection-context` chevron pattern, not
copied from anywhere) — collapsed by default. **The summary label ("Using
&lt;name&gt;") never changes across detected → running → done** — only the
expandable detail (arguments while in progress, result once done) and an
`error` badge change, so the line doesn't visibly jump/reflow once the user's
eye is on it. Coworker's own production UI (`ao-collab`'s `tool-call-item.tsx`)
does something visually similar (collapsible row, spinner while running) but
this is an independent, from-scratch implementation, not a port —
nx-chat-ao intentionally never shares controller or rendering code with
either coworker's UI or nx-chat's own (unrelated) da-agent tool-card
mechanism.

A skill's `result` is its entire markdown body (can run to several KB) —
`formatToolCallDetail` doesn't truncate it. `.tool-call-detail`'s own
`max-height`/`overflow-y: auto` already keeps the message from growing past a
fixed height; expanding the `<details>` is an explicit request to read the
whole thing, so cutting the text short on top of that scroll box would only
hide content from the one person who asked to see it.

**Reload only shows a cheap summary, hydrated to full detail on first
expand.** Live tool-call cards come entirely from the WS stream above; on
reload there's no episode-level endpoint for tool calls (unlike
`get_episode_artifacts` for artifacts), only a per-turn one
(`GET /api/v1/events/turn/{turn_id}`) — replaying every turn just to populate
history would mean one request per turn. `Turn.tools_summary` looked like a
free per-call synopsis riding along on the `/turns` response, but it's
declared and never actually written server-side (no caller of its own
`update_summaries` repository method exists) — always `[]`. `turnsToMessages`
(`utils/episodes.js`) instead uses `Turn.tool_call_count`, which genuinely is
kept live (incremented per `assistant_message` as it's processed), to push
one aggregate `{ status: 'summary', summaryText: 'Used N tools' }` row per
turn — coarser than per-call (no titles, no per-call detail, just a count),
but real. `renderToolCallCard` renders that row as a plain expandable
`<summary>` with no status badge; opening it (`@toggle`) calls
`AoChatController#hydrateToolCall`, which fetches the turn's full event log
once (cached per `turnId`), extracts every real `{tool_call_id, name,
arguments}`/`{result, display_result, status, duration_s, metadata}` pair via
`extractToolCalls` (matching `assistant_message.tool_calls[]` against
`tool_result` events by `tool_call_id`), and nests them as `toolCall.calls` on
the *same* summary message — replacing it with sibling messages instead (the
first version of this) changed `_messages`' length and swapped the header out
from under the user mid-expand, which read as broken. `summaryText` itself is
deliberately left untouched by hydration, even though the real calls now
carry better titles — rewriting it out from under an already-open `<details>`
was tried and read as just as broken as replacing the row outright; the live
path already gets the right title from the start (`metadata.skill_title` on
`tool_call_start`/`tool_call_end`), so this only ever mattered for reload.
Each nested call renders through the same `renderToolCallCard` as the live
path, just recursed into `.tool-call-children`.

`hydrateToolCall` sets `toolCall.loadingCalls = true` synchronously, before
the fetch, so `renderToolCallCard` can show `.nx-loading-spinner` in the
summary row immediately on click rather than only once the fetch resolves.
Once hydration finishes, `loadingCalls` is dropped from the object entirely
rather than set to `false` — a fully-hydrated toolCall's shape then matches
one that was never in a loading state at all, which matters for anything
that deep-compares the object (this file's own tests included).

`willUpdate`/`updated` guard the scroll-to-bottom behind `_wasNearBottom`
(mirroring `nx-chat`'s own `chat.js`) rather than jumping unconditionally on
every `messages` change — without it, expanding a tool-call row while
scrolled up in history yanked the view back to the bottom.

## Region resolution

`resolveAoHttpBase`/`resolveAoWsBase` (`utils/uploads.js`) resolve the AO
region per-user rather than hardcoding it, per AO's coworker team: find the
IMS profile's product-context entry where `statusCode === 'ACTIVE'` and
`serviceCode` is `acp` or `dma_tartan`, parse its `fulfillable_data` JSON, and
build `https://agent-orchestrator-{environment}-{region}.adobe.io` (and the
`wss://` equivalent) from `region`/`environment`, lowercased. Falls back to
the default `AO_HTTP_BASE`/`AO_WS_BASE` (`prod`/`va7`) if nothing matches or
`fulfillable_data` doesn't parse — the same behavior every profile got before
region resolution existed.

## Skills

Unlike `nx-chat`, which loads skills from the site's own DA config (see
[`chat-ui-component.md`](./chat-ui-component.md#skills-slash-menu)),
`nx-chat-ao` fetches skills from AO's own `GET /api/v1/skills?manifest_id=...`
endpoint (`utils/skills.js`). The result is cached in `localStorage`
(`loadCachedSkills`/`saveCachedSkills`) so the slash-menu isn't empty before
the first `fetchSkills()` resolves.

## Attachments

`uploadAttachment` (`utils/uploads.js`) follows AO's Files API: `POST
/api/v1/files/upload` (initiate) → `PUT` the blob to the returned upload URL
→ `POST /api/v1/files/{id}/finalize`. Any failure at any step returns `null`
rather than throwing; `sendMessage` reports failed uploads inline in the
message text (`buildFailedUploadsText`) rather than blocking the send.

## Client context

`buildClientContext` (`utils/user-context.js`) sends the current document and
selection as a `client_context.focused_resources[]` object on the `USER_INPUT`
frame, per AO's native-protocol client-context schema
(`aep-ao.pages.adobeitc.com/developer-reference/client-context/`), rather than
inlining them into `text` as prose. This replaced an earlier prose-prefix
approach (`[Current document — org: ..., site: ..., path: ...]` etc.) — AO
treats `client_context` as an ephemeral, per-turn reminder that is never
replayed into later turns' history, so it doesn't bloat the conversation the
way a permanent text prefix resent on every message would.

`focused_resources` is ranked most to least relevant per AO's contract, so the
document being edited always comes first, with any selection inside it after.
Failed uploads are the one exception left in `text` (`buildFailedUploadsText`)
rather than folded into `client_context` — they're a transient error status
for that turn, not "where the agent was invoked," so they don't fit the
schema's purpose.

The document resource carries `org`/`site` as plain text in `description`
rather than expecting the agent to parse them back out of `id` — the schema
has no dedicated org/site fields, and `id`/`uri` are identifiers, not
something meant to be reverse-engineered. `client_context.application` is
always sent too (`{ id: 'da.live', name: 'DA Live' }`), even with no document
context yet, since it's static per host app and AO uses `application` to
identify the invoking surface generally (e.g. `AEP`, `CJA` in AO's own docs).

## AO wire-protocol notes

- **First-op restriction.** A fresh WebSocket connection's first substantive
  frame must be one of `SESSION_INIT`/`USER_INPUT`/`RESUME`/`ATTACH` —
  `QUESTION_RESPONSE` alone is rejected as an invalid first op. This is why
  `warmSession` sends `ATTACH` and `_respondToQuestion` sends `RESUME` on a
  cold connection instead of the bare ops.
- **`ATTACH`** is a session-attach signal only — it carries no mid-turn op to
  submit, and is a harmless no-op if sent after the session's already live.
- **`RESUME`** (`{ type: 'RESUME', turn_id, data: {...} }`) is the generic
  resume mechanism; `data.type` dispatches to the right resume handler (e.g.
  `question-response`) server-side.
- **Event naming caveat:** the event this client listens for as
  `AO_EVENT.USER_QUESTION` is `user_question` on the wire — confirmed against
  AO's actual event-serialization code (`SessionEventType.USER_QUESTION` in
  `agents/events.py`, serialized verbatim by `ws_handler.py`'s
  `_serialize_event`). AO's own public OpenAPI doc example currently shows
  `question` instead — that appears to be a stale doc example, not the real
  wire shape. If AO ever actually renames the event, `ao-constants.js`'s
  `AO_EVENT.USER_QUESTION` value is the one place to update.
- **Session start:** `POST /api/v1/sessions` starts a durable session without
  submitting a turn; takes an optional `episodeId` (omit for a new episode,
  pass an existing one to wake/attach). Requires the resolved orchestrator
  mode to be `TEMPORAL`, or it 400s.
