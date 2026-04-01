# Skills Lab: Generated Tools — Architecture Proposal

**Issue:** [adobe/da-nx#279](https://github.com/adobe/da-nx/issues/279)
**Branch:** `feat/skills-lab`
**Status:** Phase 0 — Design (pending team review)

> **Rev 2 — 2026-04-01**
> Updated based on team feedback:
> - Storage changed from `/.da/` file paths (deprecated) to DA config sheets + S3/R2
> - Added client-side execution tier (WebAssembly, Web Workers) as Phase 1
> - Added `client-ai` tier using Chrome Built-in AI (Prompt API, Summarizer, Writer)
> - Cloudflare Worker sandbox moved to Phase 2

---

## Summary

The DA Skills Lab currently supports three extension modes:

| Mode | Storage | Execution |
|------|---------|-----------|
| Built-in DA/EDS tools | Hard-coded in `da-agent` | Worker inline |
| Repo-backed skills | DA content path (`.md` files) | System prompt injection |
| Remote MCP servers | `mcp-servers` DA config sheet | External HTTP server |

This proposal introduces a **fourth extension mode: generated tools** — model-authored, narrowly scoped runtime extensions that are validated, approved, executed in an appropriate runtime (client or server), and optionally promoted into the reusable library.

---

## Vocabulary

| Term | Meaning |
|------|--------|
| **generated tool** | A tool definition authored by the model or a developer, stored as a DA config sheet entry, not in Worker source code |
| **dynamic tool synthesis** | The act of the model proposing a new tool definition at runtime in response to a user request |
| **client-side execution** | Running tool logic in a browser Web Worker with WASM or Chrome Built-in AI — zero server footprint |
| **sandboxed execution** | Running a generated tool's logic inside an isolated CF Worker with no access to `da-agent` internals, secrets, or arbitrary network |
| **untrusted generated code** | Any executable logic originating from model output or user-provided code; always treated as untrusted regardless of source |
| **control plane** | `da-agent` + DA config sheets — decides which generated tools exist and are approved; never executes untrusted code |
| **execution plane** | Browser (Phase 1) or `da-generated-tools-sandbox` CF Worker (Phase 2+) — the only environments that run generated tool logic |

---

## Storage — Revised

> **Note:** `/.da/` file paths are deprecated. Config is stored in DA config sheets; code artifacts are stored in S3/R2.

### Tool definitions → DA config sheet

Generated tool definitions live in a `generated-tools` DA config sheet for each site (with org-level fallback), mirroring how `mcp-servers` is structured:

```
/{org}/{site}/configs/da-config.json   ← sheet: "generated-tools"
/{org}/configs/da-config.json          ← org-level fallback
```

Each row in the sheet represents one tool:

| Column | Value |
|--------|-------|
| `id` | `slugified-tool-name` |
| `name` | Human-readable name |
| `description` | What this tool does |
| `status` | `draft \| approved \| deprecated` |
| `capability` | `client-wasm \| client-ai \| da-read \| da-write` |
| `inputSchema` | JSON (stringified) — parameter definitions |
| `implementation` | JSON (stringified) — for `da-api-sequence` steps; S3 key for `client-wasm`/`js-sandboxed` |
| `createdBy` | `model \| developer` |
| `approvedBy` | email or id |
| `approvedAt` | ISO timestamp |

### Tool code → S3/R2

For any capability tier that involves code beyond a simple DA API sequence (Phase 2+):

```
s3://{bucket}/generated-tools/{org}/{site}/{id}/{version}.wasm
s3://{bucket}/generated-tools/{org}/{site}/{id}/{version}.js
```

Loaded by the execution plane (browser or sandbox Worker) at runtime. The config sheet stores only the S3 key, not the code itself.

> **Open question:** What bucket/R2 binding is used for tool code? Confirm with platform team.

---

## Architecture

### Data flow

```
User message
    │
    ▼
da-nx canvas
    ├── Generated Tools tab — browse, approve, reject proposals
    ├── Reads "generated-tools" config sheet rows
    ├── Client-side execution engine (Web Worker + WASM / Chrome Built-in AI)
    │    └── handles client-wasm and client-ai tools locally, no server roundtrip
    └── chat-controller.js — sends requestedGeneratedTools: string[] on /chat body
         │
         ▼
da-agent (control plane — CF Worker)
    ├── reads approved tool defs from DA config sheet
    ├── injects approved tool list into system prompt
    ├── registers each approved def as a tool() stub in allTools
    │    ├── client-wasm / client-ai: stub signals canvas to execute locally
    │    └── da-read / da-write: stub delegates to sandbox-client (Phase 2)
    └── [Phase 2] sandbox-client.ts → POST to da-generated-tools-sandbox
         │
         ▼
[Phase 2] da-generated-tools-sandbox (execution plane — separate CF Worker)
    ├── receives: { toolId, org, site, args }
    ├── loads tool code from S3/R2
    ├── executes against DA Admin read-only (da-read) or write (da-write) API
    └── returns: { result } or { error }
```

### Why generated code must NOT run inside `da-agent`

`da-agent` holds:
- AWS Bedrock credentials (IAM token)
- DA Admin service binding (unrestricted read/write to all orgs and sites)
- DA Collab service binding (live Y.js sessions)
- IMS tokens from user requests

Running untrusted model-generated code in the same process would grant it implicit access to all of these. The execution plane **must be separate**.

For Phase 1 client-side tools: the browser's Web Worker boundary and WASM sandbox are the isolation layer.
For Phase 2 server-side tools: a dedicated CF Worker with no bindings to `da-agent` secrets is the isolation layer.

---

## Capability model

| Tier | Label | Execution environment | DA API access | Phase |
|------|-------|-----------------------|---------------|-------|
| `client-wasm` | WebAssembly | Browser Web Worker | None — pure compute | Phase 1 |
| `client-ai` | Chrome Built-in AI | Browser (Prompt/Summarizer/Writer API) | None — text transformation | Phase 1 |
| `da-read` | Sandboxed read-only | CF Worker (separate) | DA Admin read-only allowlist | Phase 2 |
| `da-write` | Sandboxed read-write | CF Worker (separate) | DA Admin create/update (approved per-call) | Phase 3 |
| `external-fetch` | Not allowed in MVP | — | Not allowed | Phase 4+ |

---

## Chrome Built-in AI integration (Phase 1 — `client-ai` tier)

The [Chrome Built-in AI APIs](https://developer.chrome.com/docs/ai/built-in) provide task APIs backed by on-device models (Gemini Nano). These are ideal for a `client-ai` generated tool tier:

| API | DA use cases |
|-----|-------------|
| Prompt API | Custom text transformation, structured extraction, analysis |
| Summarizer API | Summarize selected page content |
| Writer API | Generate content drafts from outline or notes |
| Rewriter API | Rephrase or reformat selected content |
| Language Detector | Auto-detect language before translation |
| Translator API | Translate selected text |

**Execution model for `client-ai` tools:**
1. Model proposes a tool with `capability: "client-ai"` and an `implementation.promptTemplate` field
2. User approves in the Generated Tools tab
3. On invocation, `da-agent` returns a special tool result `{ clientExecute: true, toolId, args }` instead of calling out
4. Canvas intercepts this result, runs the Chrome AI API with the tool's prompt template and the provided args
5. Canvas injects the result back into the chat as a tool result message

**Graceful degradation:** If `window.ai` is unavailable (non-Chrome or hardware not supported), the tool falls back to returning a `{ unavailable: "client-ai not supported in this browser" }` result, and the model can explain the limitation or suggest an alternative.

### Why this matters for Phase 1

- **Zero CF Worker needed** for the most common text-focused generated tools
- **Privacy**: content never leaves the device
- **Offline capable**: no DA API calls
- **No additional infrastructure cost** — Chromium ships and manages the model

---

## WebAssembly client-side execution (`client-wasm` tier)

For generated tools that need deterministic computation (parsing, transformation, validation) without DA API access:

**Execution model:**
1. Tool implementation is a `.wasm` binary stored in S3/R2
2. Loaded from a `<Worker>` (Web Worker) on the canvas side at invocation time
3. Worker instantiates the WASM module and calls the exported `execute(args)` function
4. Result is returned to the chat stream as a tool result

**Good fit for:**
- Custom HTML/markdown validators
- Document structure analysis
- Content format transformers (e.g., markdown to structured JSON)
- Schema validation tools

**Not appropriate for:**
- Anything needing network access (DA APIs, external services)
- Long-running compute (5s timeout in Worker)

> **Open question:** How do we author and compile WASM tools? Build pipeline TBD. Phase 1 MVP may limit `client-wasm` to pre-compiled tools only; model-generated WASM is Phase 3+.

---

## Approval model

Three separate approval gates:

### Gate 1 — Generation approval
When the model proposes a new generated tool (via `[TOOL_PROPOSAL]` block), it is written with **`status: "draft"`** to the config sheet. It does **not** appear in `allTools` or the slash menu.

A **proposal card** in the Generated Tools tab shows the definition; the user can:
- **Approve** → sets `status: "approved"`, tool is active for future chat requests
- **Reject** → sets `status: "deprecated"`, tool is hidden
- **Edit** → opens definition editor before approving

### Gate 2 — Execution approval
- `client-wasm` / `client-ai`: first run per session; canvas shows a confirmation dialog describing what the tool will do
- `da-read`: first run per session; standard tool-approval card (same pattern as existing DA tools)
- `da-write`: explicit approval on **every** call — same bar as existing destructive write tools

### Gate 3 — Promotion
A generated tool with 3+ successful executions and no errors can be promoted to the reusable skill library as a markdown skill. Promotion requires explicit user action; the agent never promotes autonomously.

---

## Lifecycle

```
Dynamic tool synthesis
    (model outputs [TOOL_PROPOSAL] block)
         │
         ▼
    status: draft
    (config sheet row; not in allTools)
         │
    [Gate 1 — User approves in Generated Tools tab]
         │
         ▼
    status: approved
    (included in allTools; appears in slash menu as /gen__<id>)
         │
    [Gate 2 — First call in session; user confirms execution]
         │
         ▼
    Executing
    (client-ai → Chrome AI API, client-wasm → Web Worker, da-read/write → CF sandbox)
         │
    [Optional — Gate 3 — User promotes]
         │
         ▼
    Promoted → skill markdown in /.da/skills/   OR   status: deprecated
```

---

## Phased rollout plan

### Phase 0 — Design (current)
- This document
- Team review: platform, agent, security, accessibility stakeholders
- Follow-up implementation tickets created

### Phase 1 — Client-side tools (no CF Worker needed)
**Capability tiers:** `client-ai` and `client-wasm`

Deliverables:
- `da-nx`: `generated-tools/utils.js` updated — reads/writes DA config sheet instead of `/.da/` paths
- `da-nx`: Generated Tools tab in Skills Lab (proposal card, approve/reject, slash `/gen__*`)
- `da-nx`: `generated-tools/client-executor.js` — Web Worker runner for WASM tools and Chrome Built-in AI bridge
- `da-agent`: `generated-tools/loader.ts` updated — reads config sheet; `buildGeneratedToolsPromptSection`
- `da-agent`: tool stubs for `client-ai` / `client-wasm` return `{ clientExecute: true }` result that the canvas handles
- Feature flagged behind `env.GENERATED_TOOLS_ENABLED` in `da-agent`

Success metric: user can approve a `client-ai` tool proposal and the model can subsequently invoke it to transform content locally.

### Phase 2 — Server-side read-only tools
**Capability tier:** `da-read`

Additional deliverables:
- `da-generated-tools-sandbox`: new CF Worker; DA Admin read-only allowlist; loads tool code from R2
- `da-agent`: `sandbox-client.ts` wired to real Worker URL
- `da-nx`: `da-read` execution approval UI (once per session)
- Audit log: execution record per invocation

### Phase 3 — Write-capable and WASM authoring
- `da-write` tier with per-call approval
- Model-generated WASM compilation pipeline
- Org-level shared tool catalog

### Phase 4 — Promotion and library
- Promotion flow from generated tool → skill markdown
- Community tool registry (if desired)

---

## Security and threat model

| Threat | Mitigation |
|--------|-----------|
| Model generates malicious tool definition | Definitions are JSON or prompt templates (no executable JS in Phase 1); schema validated; user must explicitly approve |
| `client-ai` tool extracts secrets via prompt | Chrome AI model runs on-device with no network; it cannot exfiltrate — it can only return text to the page |
| `client-wasm` module calls network | Web Worker sandbox blocks arbitrary fetch; WASM has no built-in network access |
| Phase 2 sandbox exfiltrates secrets | Sandbox CF Worker has no bindings to `da-agent` secrets; outbound fetch to DA Admin only |
| Sandbox crashes or times out | `da-agent` stub catches errors; chat request continues |
| Tool id spoofing | Tool ids are scoped to org/site in the config sheet; cross-tenant access impossible via DA Admin scoping |
| Excessive invocations | Rate limit at the config sheet approval level; CF Worker CPU limits as hard floor |
| Promotion of harmful tools | Gate 3 requires explicit user action; promoted skill is visible in Skills Lab for review/deletion |

### Audit requirements (Phase 2+)
All sandbox executions must log: `timestamp`, `org`, `site`, `userId`, `toolId`, `capabilityTier`, `args` (hashed, not raw), `success/error`.

---

## Open questions

1. **Config sheet format:** What is the exact DA config sheet schema and fetch path for `generated-tools`? Does it follow the same `da-config.json` pattern as `mcp-servers`? (Confirm with platform team before Phase 1 implementation)
2. **S3/R2 bucket:** Which bucket and binding is used for tool code storage? Is it the same media bucket or a separate `generated-tools` binding?
3. **Chrome Built-in AI availability:** `client-ai` tools only work in Chrome (Windows/macOS/Linux). What is the plan for Firefox/Safari users — silent unavailability, server-side fallback, or explicit capability check?
4. **WASM authoring pipeline:** How are WASM tools compiled and published to R2? Is there a toolchain or CLI for developers to use?
5. **CF Worker deployment (Phase 2):** Same Cloudflare account with service binding, or separate account with HTTP?
6. **Tool definition versioning:** Should `id` be immutable with version suffixes, or last-write-wins per config sheet row?
7. **org-level vs site-level catalog:** Auto-propagate org tools to all sites, or require site opt-in?

---

## Implementation files to update (carry-over from initial scaffold)

The Phase 0 scaffold used `/.da/` file paths which are now known to be deprecated. These files need rework before Phase 1 ships:

| File | Current (deprecated) | Needs |
|------|---------------------|-------|
| `da-nx/nx/blocks/canvas/src/generated-tools/utils.js` | `daFetch /list /.da/generated-tools/` | Read/write DA config sheet row |
| `da-agent/src/generated-tools/loader.ts` | `client.listSources(…, '.da/generated-tools')` | Read DA config sheet via admin client |

Both files are otherwise architecturally sound; only the storage layer needs replacing once the config sheet format is confirmed (Open question #1).

---

## Acceptance criteria (from #279)

- [x] Documented proposal for how generated tools fit into the DA architecture
- [x] Explains why generated code must not run directly inside `da-agent`
- [x] Defines a capability model for generated tools (four tiers)
- [x] Defines approval requirements for generation, execution, and promotion
- [x] Phased rollout plan (Phase 0–4)
- [x] Security and operational risks documented
- [x] Consistent vocabulary: `generated tools`, `sandboxed execution`, `dynamic tool synthesis`, `untrusted generated code`

## Motivating scenarios — Phase 1 client-side tools

The following scenarios illustrate how the agent identifies a recurring user pattern, proposes a generated tool, and runs it entirely in the browser. Each replaces repeated, expensive, non-deterministic LLM round-trips with a one-time approval and instant local execution.

### Scenario 1: Readability scorer (`client-wasm`)

**Pattern the agent detects:**
A content author asks variations of "is this page too complex?", "can a non-technical reader understand this?", or "simplify this for me" three or more times across sessions. Each time the agent reads the page with `da_get_source`, sends the full HTML into the LLM context, and the model subjectively estimates the reading level. This is slow, costly, and inconsistent.

**What the agent proposes:**
A `readability-score` tool (capability: `client-wasm`) that computes a Flesch-Kincaid score on the page text.

**Why no existing tool covers it:**
Built-in tools can read and write content, but there is no structural text-analysis tool. The LLM can approximate readability, but the answer varies between calls and burns a full Bedrock round-trip each time.

**Implementation (~40 lines, runs in a Web Worker):**

```js
export function execute({ html }) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = text.split(/[.!?]+/).filter(Boolean);
  const words = text.split(/\s+/);
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);

  const score = 206.835
    - 1.015 * (words.length / sentences.length)
    - 84.6 * (syllables / words.length);

  const level = score >= 80 ? 'Easy'
    : score >= 60 ? 'Standard'
    : score >= 40 ? 'Difficult'
    : 'Very difficult';

  return { score: Math.round(score), level, words: words.length, sentences: sentences.length };
}

function countSyllables(word) {
  word = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}
```

**User experience after approval:**
The author types `/gen__readability-score` in chat. The agent passes the current page HTML. The tool returns `{ score: 62, level: "Standard", words: 847, sentences: 41 }` instantly — no LLM call, no network, deterministic.

---

### Scenario 2: Heading hierarchy validator (`client-wasm`)

**Pattern the agent detects:**
An author managing a multi-page site asks "are my headings correct?", "does this page have proper heading order?", or "is there an h1?" repeatedly. Each time the agent reads the page source, scans the HTML in-context, and sometimes misses issues — the LLM is unreliable at counting nesting levels and tends to hallucinate "looks good" when there is an `h2` → `h4` skip.

**What the agent proposes:**
A `validate-headings` tool (capability: `client-wasm`) that parses heading tags and reports structural issues.

**Why no existing tool covers it:**
Built-in tools can read and write content but have no structural validator. The LLM makes counting errors on deeply nested heading hierarchies.

**Implementation (~30 lines, runs in a Web Worker):**

```js
export function execute({ html }) {
  const headingRe = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
  const headings = [];
  let match;
  while ((match = headingRe.exec(html))) {
    headings.push({ level: Number(match[1]), text: match[2].replace(/<[^>]+>/g, '').trim() });
  }

  const issues = [];
  if (!headings.length) return { valid: false, issues: ['No headings found'] };
  if (headings[0].level !== 1) issues.push(`First heading is h${headings[0].level}, expected h1`);
  if (headings.filter((h) => h.level === 1).length > 1) issues.push('Multiple h1 tags found');

  for (let i = 1; i < headings.length; i++) {
    const jump = headings[i].level - headings[i - 1].level;
    if (jump > 1) {
      issues.push(`h${headings[i - 1].level} → h${headings[i].level} skip at "${headings[i].text}"`);
    }
  }

  return { valid: issues.length === 0, headings: headings.length, issues };
}
```

**User experience after approval:**
Instant, deterministic report: `{ valid: false, issues: ["h2 → h4 skip at 'Pricing Details'"] }`. The agent can then offer to fix the heading levels in the page.

---

### Scenario 3: Alt text suggester (`client-ai`)

**Pattern the agent detects:**
An accessibility-conscious author keeps selecting images and asking "suggest alt text for this", "what should the alt be?", or "describe this image for screen readers". Each request burns a full Bedrock LLM call with the entire page context, when only the image filename and surrounding text are relevant.

**What the agent proposes:**
A `suggest-alt-text` tool (capability: `client-ai`) that uses Chrome's Built-in AI Prompt API to generate alt text on-device.

**Why no existing tool covers it:**
Built-in tools can update content but cannot generate alt text. Today each suggestion costs a full server round-trip. Chrome's on-device model handles this locally with zero cost and near-instant latency.

**Implementation (~25 lines, uses Chrome Built-in AI Prompt API):**

```js
export async function execute({ imageContext, surroundingText }) {
  if (!('ai' in self) || !ai.languageModel) {
    return { error: 'Chrome Built-in AI not available in this browser' };
  }

  const session = await ai.languageModel.create({
    systemPrompt: 'You write concise, descriptive alt text for images on web pages. '
      + 'Output ONLY the alt text, no quotes, no explanation. Max 125 characters.',
  });

  const prompt = surroundingText
    ? `Image filename/URL: ${imageContext}\nSurrounding page text: ${surroundingText}\n\nAlt text:`
    : `Image filename/URL: ${imageContext}\n\nAlt text:`;

  const altText = await session.prompt(prompt);
  session.destroy();

  return { altText: altText.trim() };
}
```

**User experience after approval:**
The author selects an image, types `/gen__suggest-alt-text`, and gets a suggested alt text in under a second — generated on-device, content never leaves the browser, works offline. Falls back gracefully with an explanatory message on non-Chrome browsers.

---

### Why these scenarios matter

Each scenario replaces **repeated, expensive, non-deterministic LLM round-trips** with **a one-time approval and instant local execution**:

| Scenario | Today (without generated tools) | With generated tools |
|----------|------|------|
| Readability | Full Bedrock call, subjective answer, ~3s | Local JS, deterministic score, <50ms |
| Heading validation | LLM scans HTML, misses edge cases | Regex parser, 100% accurate, <10ms |
| Alt text suggestion | Full Bedrock call per image | On-device Chrome AI, <1s, zero cost |

No new infrastructure is needed for any of these — they all run in the browser.

---

## Definition of Done

- [ ] Architecture proposal reviewed by platform, agent, and security stakeholders
- [ ] Open questions captured (done above — awaiting team answers)
- [ ] Follow-up implementation tickets identified for Phase 1
- [ ] Team agrees on framing and scope for MVP

---

## Related files (current codebase)

| Area | File |
|------|------|
| Skills CRUD (canvas) | `da-nx/nx/blocks/skills-editor/utils/utils.js` |
| Config sheet read pattern | `da-agent/src/server.ts` (`mcpServers` from DA config sheet via canvas) |
| MCP tool registration pattern | `da-agent/src/mcp/tool-adapter.ts` |
| allTools merge point | `da-agent/src/server.ts` (`handleChat`) |
| Tool approval UI pattern | Canvas tool card component |
| Generated tools UI component | `da-nx/nx/blocks/canvas/src/generated-tools/generated-tools.js` |
| Generated tools utils (needs update) | `da-nx/nx/blocks/canvas/src/generated-tools/utils.js` |
| Agent loader (needs update) | `da-agent/src/generated-tools/loader.ts` |
| Sandbox client stub | `da-agent/src/generated-tools/sandbox-client.ts` |
