# chat-ao controller decoupling — base + 2 subclasses

Design matrix for splitting the single `nx2/blocks/chat-ao/ao-controller.js`
(which today serves **both** harnesses) into a shared base and two
harness-specific subclasses, so a change to one path cannot regress the other.

- **Base** — shared by both harnesses.
- **Coworker** — AO-direct / CX Coworker (orchestrator REST history).
- **CMA** — the aem-sites-claudebridge path (WS-only, replay on reconnect).
- **Base ⟐ override** — an overridable hook defined in Base, specialized per subclass.

Proposed classes: `BaseChatController`, `CoworkerChatController extends Base`,
`CmaChatController extends Base`. `chat-ao.js` picks the subclass by harness
(`ew.altHarness`). `renderers.js` stays shared.

> **Status:** PR 1 (this change) extracts `BaseChatController` +
> `CoworkerChatController`, behavior-preserving. `CmaChatController` lands in PR 2.
> Because Coworker is the only instantiated controller today, every Base method is
> exercised through it.

## State
| Field | Base | Coworker | CMA | Why |
|---|:--:|:--:|:--:|---|
| `_context`, `_onUpdate`, `_destroyed` | ✅ | | | wiring |
| `_messages`, `_streaming`, `_streamingText`, `_thinking` | ✅ | | | conversation/stream |
| `_ws`, `_connecting`, `_interrupting` | ✅ | | | socket + stop |
| `_pendingQuestion`, `_pendingPlanApproval`, `_pendingPermission` | ✅ | | | suspended-turn UI |
| `_skills` | ✅ | | | shared skills |
| `_episodeId`, `_warmedEpisodeId`, `_loadingEpisode` | ✅ | | | current session + warm |
| `_episodes`, `_staleEpisode` | | ✅ | | REST episode list / >24h stale (CMA has no list) |
| `_resuming` | | | ✅ | resume-reject guard |
| *(sessionStorage `cma-episode:*`)* | | | ✅ | reload persistence |

## Lifecycle & core (Base, unchanged)
| Method | Base | Coworker | CMA |
|---|:--:|:--:|:--:|
| `constructor`, `setContext`, `_update`, `destroy` | ✅ | | |
| `_resolveManifest`, `getSkills`, `loadSkills`, `_loadCachedSkills`, `_fetchSkills` | ✅ | | |
| `sendMessage` | ✅ | | |
| `_catalogUrl` | ⟐ `undefined` | ✅ Coworker's A2UI component catalog | (inherits `undefined`) |

## WebSocket connection (Base)
| Method | Base | Coworker | CMA | Note |
|---|:--:|:--:|:--:|---|
| `_connectionInfo` | ✅ | | | AUTH frame + wsBase; `x-site` lives here (harmless on Coworker, required by CMA) |
| `_ensureSocket`, `_connect` | ✅ | | | `_connect` uses `_episodeId ?? 'new'` |
| `_shouldReattachOnClose`, `_recoverFromClose` | ✅ | | | reconnect |
| `_attach`, `reattachIfIdle` | ✅ | | | **shared** attach primitive — both harnesses attach without starting a turn; Base's reconnect path depends on `_attach`, so it lives here (see Resolved decision 1) |
| `_handleServerEvent` | ✅ | | | event dispatch |

## Server events — streaming / tools / cards (Base)
| Method | Base | Coworker | CMA |
|---|:--:|:--:|:--:|
| `_onUserMessage`, `_onTextDelta`, `_onTextDone`, `_onUiArtifactCreated` | ✅ | | |
| `_onToolCallDetected/Start/End`, `_patchToolCall`, `hydrateToolCall`, `_fetchTurnEvents` | ✅ | | |
| `_onUserQuestion`, `_buildQuestionResponseMessage`, `_onUserQuestionResponse` | ✅ | | |
| `_onPlanApprovalRequest`, `_onPermissionRequest` | ✅ | | |
| `_onTurnCompleted` (incl. stop indicator) | ✅ | | |
| `_done`, `_pushError`, `stop` | ✅ | | |
| `_respondToQuestion`, `answerQuestion`, `declineQuestion`, `respondToPlanApproval`, `respondToPermission` | ✅ | | |

## Server events — split
| Method | Base ⟐ override | Coworker | CMA | Split |
|---|:--:|:--:|:--:|---|
| `_onSessionReady` | ⟐ | (base) | override | base refreshes the list via the `_refreshEpisodeList` hook; CMA also `_storeEpisodeId` |
| `_onSessionError` | ⟐ | (base) | override | CMA adds resume-reject → `startNewEpisode` |

## Episodes / history — the real divergence
| Method | Base ⟐ | Coworker | CMA | Note |
|---|:--:|:--:|:--:|---|
| `loadEpisodes` | ⟐ abstract | ✅ REST list + latest/stale | ✅ resume stored id (WS replay) | core split |
| `_fetchEpisodes`, `_fetchEpisodeMessages`, `_fetchEpisodeContext` | | ✅ | | orchestrator REST (empty on CMA) |
| `_loadEpisode` | | ✅ | | REST messages → render → warm |
| `_refreshEpisodeList` | ⟐ no-op | ✅ REST list | (inherits no-op) | **Base declares a no-op hook** so `_onSessionReady` is safe for a harness with no list; Coworker overrides it (see Resolved decision 2) |
| `switchEpisode` | ⟐ no-op | ✅ | | episode picker (no list on CMA) |
| `warmSession`, `_fetchWarmSession` | | ✅ | | REST warm wrapping the shared `_attach` |
| `startNewEpisode` | ⟐ | (base clears state) | override | CMA also clears stored pointer |

## CMA-only (new, bridge path)
| Method | CMA |
|---|:--:|
| `_episodeStorageKey`, `_storeEpisodeId`, `_restoreEpisodeId` | ✅ |
| `loadEpisodes` (resume) + `_resuming` handling | ✅ |
| `_resumeEpisode` (lean: set `_episodeId` + connect; WS replay) | ✅ |

## Unchanged / outside the split
- `renderers.js` — pure rendering, stays shared.
- `chat-ao.js` — picks the subclass by harness (`ew.altHarness`); otherwise unchanged.
- `utils/*` (episodes.js, uploads.js) — shared helpers; Coworker uses the episode
  REST ones, CMA mostly doesn't.

## Shape summary
- **Base** ≈ 70% of the file: all chat mechanics, WS, streaming, tools, cards,
  send/stop, the shared `_attach`/`reattachIfIdle` attach primitive, plus
  `_onSessionReady` / `_onSessionError` / `loadEpisodes` / `switchEpisode` /
  `_refreshEpisodeList` / `startNewEpisode` as overridable hooks.
- **Coworker** ≈ the episode list/history/navigation cluster (REST) + `_staleEpisode`.
- **CMA** ≈ resume-on-reload persistence + the two error/ready overrides + its own
  `loadEpisodes`.

## Resolved decisions
1. **`_attach` / `reattachIfIdle` are shared → Base.** They only use `_ensureSocket`
   plus an `ATTACH` frame, both already in Base, and Base's own reconnect path
   (`_recoverFromClose`) calls `_attach`. Putting them in Base keeps the base from
   depending on a subclass method. The REST-flavored warm (`_fetchWarmSession`) and
   the Coworker `warmSession` wrapper stay in **Coworker**; CMA will call the shared
   `_attach` directly.
2. **`_refreshEpisodeList` is a Base no-op hook, overridden by Coworker.** The episode
   list is an orchestrator-REST concept Coworker owns, but `_onSessionReady` (Base)
   refreshes it on a new episode. Rather than have Base call a method only a subclass
   defines, Base declares a no-op `_refreshEpisodeList()` (matching `loadEpisodes` /
   `switchEpisode`); Coworker overrides it, and the WS-only CMA harness inherits the
   no-op.
3. **`x-site`** stays in Base `_connectionInfo` (harmless on Coworker, required by CMA).

## Suggested rollout (staged, low-risk)
1. **PR 1** — extract `BaseChatController` + `CoworkerChatController`, zero behavior
   change, all existing tests green (the current behavior == Coworker).
2. **PR 2** — add `CmaChatController` absorbing the resume + persistence + the two
   overrides (fold in `feat/chat-ao-resume-main`), gate the switch in `chat-ao.js`.
3. The stop-indicator (`feat/chat-ao-stop-indicator`) is shared → lands in Base.
