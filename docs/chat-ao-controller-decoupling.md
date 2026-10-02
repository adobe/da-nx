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

## WebSocket connection (Base)
| Method | Base | Coworker | CMA | Note |
|---|:--:|:--:|:--:|---|
| `_connectionInfo` | ✅ | | | AUTH frame + wsBase; `x-site` lives here (harmless on Coworker, required by CMA) |
| `_ensureSocket`, `_connect` | ✅ | | | `_connect` uses `_episodeId ?? 'new'` |
| `_shouldReattachOnClose`, `_recoverFromClose` | ✅ | | | reconnect |
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
| `_onSessionReady` | ⟐ | (base) | override | CMA also `_storeEpisodeId` |
| `_onSessionError` | ⟐ | (base) | override | CMA adds resume-reject → `startNewEpisode` |

## Episodes / history — the real divergence
| Method | Base | Coworker | CMA | Note |
|---|:--:|:--:|:--:|---|
| `loadEpisodes` | ⟐ abstract | ✅ REST list + latest/stale | ✅ resume stored id (WS replay) | core split |
| `_fetchEpisodes`, `_fetchEpisodeMessages`, `_fetchEpisodeContext` | | ✅ | | orchestrator REST (empty on CMA) |
| `_loadEpisode` | | ✅ | | REST messages → render → warm |
| `_refreshEpisodeList`, `switchEpisode` | | ✅ | | episode picker (no list on CMA) |
| `warmSession`, `_attach`, `reattachIfIdle`, `_fetchWarmSession` | | ✅ | | REST warm + attach |
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
  send/stop, plus `_onSessionReady` / `_onSessionError` / `loadEpisodes` /
  `startNewEpisode` as overridable hooks.
- **Coworker** ≈ the episode list/history/navigation cluster (REST) + `_staleEpisode`.
- **CMA** ≈ resume-on-reload persistence + the two error/ready overrides + its own
  `loadEpisodes`.

## Open decisions
1. **`_loadEpisode` / `warmSession` / `_attach`** sit between the two: Coworker fully
   uses them; CMA's resume also calls `_loadEpisode` (REST returns empty, then WS
   attach replays). Recommended: put the REST-flavored ones in **Coworker** and give
   CMA a lean `_resumeEpisode` that just sets `_episodeId` + connects (cleaner split).
2. **Episode picker** (`switchEpisode` / `_refreshEpisodeList` / list UI) is a
   **Coworker** feature — CMA has no REST list. Confirm the CMA UI hides the picker.
3. **`x-site`** stays in Base `_connectionInfo` (harmless on Coworker) unless you want
   it CMA-only.

## Suggested rollout (staged, low-risk)
1. **PR 1** — extract `BaseChatController` + `CoworkerChatController`, zero behavior
   change, all existing tests green (the current behavior == Coworker).
2. **PR 2** — add `CmaChatController` absorbing the resume + persistence + the two
   overrides (fold in `feat/chat-ao-resume-main`), gate the switch in `chat-ao.js`.
3. The stop-indicator (`feat/chat-ao-stop-indicator`) is shared → lands in Base.
