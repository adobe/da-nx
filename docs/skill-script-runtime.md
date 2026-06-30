# Skill-Script Runtime

Status: proof of concept (Phase 1)
Owner: DA chat / skills platform

## 1. Intention

DA's product mandate is **"don't build agents, build skills."** Concretely that means
three things:

1. **Keep the agent runtime thin** so capability lives where it can be iterated
   *without an agent deploy*.
2. **Iterate without a deploy** — capability should be authorable and revisable as a
   skill, not hardcoded into the worker.
3. **Redistribution** — a capability authored once should be shareable across
   orgs/sites/teams as a self-contained unit, not locked to one deployment.

Today a skill is **pure Markdown** injected into the model's system prompt. It can
*instruct* the model to call existing tools, but it cannot *do* anything itself. Any
real capability (e.g. "extract text from this .docx") therefore has to be hardcoded
natively into `da-agent` — which is exactly the accretion the mandate warns against:
every new format or transform becomes an agent PR + deploy, and none of it is
redistributable.

The **skill-script runtime** closes that gap. It extends a skill so it can carry an
**executable script** with a declared, JSON-serializable I/O contract, and gives DA a
**client-side execution substrate** that runs that script in a sandboxed Web Worker
when it is provably safe to do so. The capability lives in the skill, iterates without
an agent deploy, and travels with the skill when redistributed.

The same script contract is designed up front to run **unchanged in three places** as
the platform matures:

- **Phase 1 (now):** browser Web Worker, fully client-side.
- **Phase 1.5:** the harness **server-side sandbox** when it ships.
- **Phase 2:** **AO's Python runtime** (see §6).

## 2. Design

### 2.1 The skill-script contract

A skill may carry one or more executable implementations behind a single,
language-neutral contract:

```
async <entry>(input, host) -> output
```

- `input` and `output` are **strictly JSON-serializable**. No live objects, DOM nodes,
  closures, or streams cross the boundary. This is the single property that makes a
  script location- and runtime-portable: serializable in / serializable out behaves
  identically whether the callee is a worker next door or a process across the wire.
- `host` is an **injected capability object**. A script never reaches for ambient
  globals; anything it is allowed to do is handed to it explicitly. A pure script
  receives only a buffered `log()`.

The JS implementation is `script.js`; a future AO implementation is `script.py` with
the mirrored signature `def <entry>(input, host) -> output`. **"Same skill" means same
contract, not necessarily same source** — the runtime selects the implementation for
its environment (decision: *contract + per-runtime implementations*).

### 2.2 Execution metadata

Authored skills declare an `execution` block in `skill.md` frontmatter; built-in
(in-repo) proof skills declare the equivalent as a plain manifest object:

```yaml
execution:
  entry: convert          # exported function name
  runtimes: [js]          # implementations present (js | py)
  capabilities: []        # [] => pure compute => client-eligible
  timeoutMs: 5000
  # input / output documented as JSON shapes
```

### 2.3 Client eligibility — enforce by construction

A skill declares the `capabilities` it needs. The rule is deliberately simple and
**structural, not trust-based** (decision: *declare + enforce by construction*):

- `capabilities: []` → **pure compute** → eligible to run **client-side** in a Web
  Worker.
- Any non-empty capability (`network`, `secrets`, `pii`, `storage`, …) → **not**
  client-eligible → routed to a server runtime.

Eligibility is enforced by *removing the capability*, not by trusting a declaration.
Before the worker loads a script it **neuters ambient globals** — `fetch`,
`XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB`, `caches`,
`navigator.sendBeacon`, `Notification`. A "pure" script therefore *cannot* touch the
network, storage, or secrets even if it tried; the security/PII property holds by the
shape of the environment, not by review.

> Honesty note: a Web Worker is a strong-but-not-perfect boundary. Neutering ambient
> globals removes network/storage/PII exfiltration paths, which is the property we
> need for "safe to run fully client-side." A harder wall (sandboxed iframe + worker,
> or a WASM boundary) is a future hardening option if untrusted third-party skills are
> ever run client-side.

### 2.4 Location transparency

`runSkillScript({ manifest, moduleUrl, input })` is the single boundary every caller
uses. It checks eligibility and dispatches to a runner strategy:

- `LOCAL` (today) — spins the sandboxed Web Worker.
- `SANDBOX` (seam reserved) — POSTs the serializable `input` to the harness server
  sandbox.

Because the contract is async + serializable from day one, **callers do not change**
when a skill moves from `LOCAL` to `SANDBOX`. The only thing the switch changes is data
flow (see §5.3).

### 2.5 Invocation: who decides, who runs

Running a skill-script involves three distinct roles. Keeping them separate is what
preserves the thin-agent mandate:

1. **Read / distribute** — the agent loads script-carrying skills (from `.da/skills/`
   or a marketplace), parses the `execution` contract, and includes them in the skills
   index. Pure plumbing.
2. **Orchestrate / decide** — at runtime the **agent (LLM)** decides *when* a script
   should run and *what input* to pass. This is the agent's job; it is the brain that
   knows intent.
3. **Execute** — the code actually runs in the **swappable substrate** (client worker
   today, server sandbox / AO later). Never in the agent.

The agent therefore **orchestrates but does not execute**. It delegates execution to
the substrate over the *existing client-executed tool-call round-trip* — a
script-carrying skill is, mechanically, **a client-executed tool whose body is the
skill's script**. The agent emits a run request; da-nx runs it via `runSkillScript`;
the JSON result flows back to the agent, which continues reasoning.

There are **two triggers**:

- **Client-triggered (normalization)** — da-nx runs the script proactively on a client
  event (e.g. a `.docx` is attached). The agent only ever sees the result (markdown).
  No orchestration; the agent is not involved in the decision.
- **Agent-triggered** — the LLM decides mid-turn to run a skill (e.g. "extract tables
  from this data"). The agent orchestrates via the round-trip below.

Both triggers route through the same `runSkillScript` boundary, so the
client/server/AO execution choice is identical regardless of who pulled the trigger.

## 3. Proof of concept (Phase 1)

The PoC proves the **substrate**, with `docx-to-markdown` as the first skill riding on
it. The substrate, not docx, is the deliverable.

**Substrate** (`nx2/utils/skill-runtime/`):
- `capabilities.js` — capability constants + `isClientEligible(capabilities)`.
- `worker-host.js` — worker bootstrap; neuters ambient globals, imports the skill
  module, calls `entry(input, host)`, enforces `timeoutMs`, returns `{ json }` / `{ error }`.
- `runner.js` — `runSkillScript(...)`; eligibility gate + `LOCAL`/`SANDBOX` strategy seam.
- `index.js` — public surface.

**Proof skill** (`docx-to-markdown`): pure `convert(input, host)` over bundled `fflate`,
`capabilities: []`. Input `{ bytesBase64 }`, output `{ markdown }`.

**What the tests prove:**
- a pure script runs in the worker and returns serializable output;
- `fetch` (and the other network/storage globals) is `undefined` inside the worker —
  enforce-by-construction holds;
- a manifest with `capabilities: ['network']` returns `{ error: 'requires server runtime' }`
  **without** spinning a worker;
- a runaway script is killed at `timeoutMs`;
- the docx skill converts a fixture (`<w:t>hello world</w:t>` → markdown), unescapes
  XML entities, and returns `{ error }` on corrupt input without throwing past the runner.

**Explicitly out of scope this round:** wiring into the chat attachment flow (a
deliberate follow-up once the engine is proven), PDF (its current library is
environment-coupled and not cleanly client-portable), and authored-skill loading from
`.da/skills/` (the PoC ships docx as a built-in skill).

## 4. Phase 2 — AO Python runtime

AO has a Python runtime. The goal is to run **the same skill** there by supplying a
`script.py` that satisfies the identical contract:

```python
def convert(input, host):
    # input: {"bytesBase64": "..."}  ->  output: {"markdown": "..."}
    ...
    return {"markdown": text}
```

Nothing about the contract is JS-specific: JSON in, JSON out, capabilities declared the
same way, `host` injected the same way. The runtime selects `script.py` when running in
AO and `script.js` in the browser/harness. This is why the contract was fixed *before*
writing any implementation — Phase 2 is "add an implementation," not "redesign the
boundary."

## 5. Flow

### 5.1 Client-side (Phase 1, `LOCAL` runner)

```mermaid
flowchart TD
    A[Caller: skill input as JSON] --> B[runSkillScript]
    B --> C{isClientEligible?<br/>capabilities == []}
    C -- no --> E[return error:<br/>requires server runtime]
    C -- yes --> D[Spawn sandboxed Web Worker<br/>from blob URL]
    D --> F[Worker bootstrap:<br/>delete fetch / XHR / WebSocket /<br/>importScripts / indexedDB / caches]
    F --> G[Dynamic import script.js]
    G --> H["entry(input, host)<br/>host = { log }"]
    H --> I{within timeoutMs?}
    I -- no --> J[terminate worker<br/>return error]
    I -- yes --> K[postMessage<br/>json: output, logs]
    K --> L[Caller receives<br/>JSON output]

    style F fill:#fde,stroke:#c39
    style E fill:#fee,stroke:#c66
    style J fill:#fee,stroke:#c66
```

Key property: the **binary never leaves the browser**. The user-attached bytes are
already client-side; conversion is network-free, and only the small extracted result is
sent onward.

### 5.2 Server-side (Phase 1.5 / Phase 2, `SANDBOX` runner)

```mermaid
flowchart TD
    A[Caller: skill input as JSON] --> B[runSkillScript]
    B --> C{isClientEligible?}
    C -- "client-eligible<br/>(future policy may still<br/>prefer server)" --> C
    C --> M[SANDBOX runner:<br/>POST serializable input<br/>to harness endpoint]
    M --> N[Harness sandbox<br/>selects implementation]
    N --> O{runtime}
    O -- "JS (harness)" --> P[run script.js<br/>in isolate]
    O -- "Python (AO)" --> Q["run script.py<br/>def entry(input, host)"]
    P --> R[entry input host<br/>host = injected capabilities]
    Q --> R
    R --> S[serializable output]
    S --> T[HTTP response: JSON output]
    T --> U[Caller receives<br/>JSON output]

    style M fill:#def,stroke:#39c
    style N fill:#def,stroke:#39c
    style Q fill:#efe,stroke:#3a3
```

The caller-facing boundary (`runSkillScript` → JSON output) is identical to §5.1. Only
the runner strategy and the data path differ.

### 5.2.1 Agent-triggered orchestration round-trip

When the LLM decides mid-turn to run a skill-script, it reuses the existing
client-executed tool-call round-trip — the agent orchestrates, the substrate executes.

```mermaid
sequenceDiagram
    participant LLM as Agent (LLM)
    participant CC as da-nx chat-controller
    participant RT as runSkillScript (dispatcher)
    participant EX as Substrate (worker / sandbox)

    LLM->>CC: emit run-skill tool call { skillId, input }
    CC->>RT: runSkillScript({ manifest, moduleUrl, input })
    RT->>RT: isClientEligible? (capabilities == [])
    alt client-eligible
        RT->>EX: run in sandboxed worker (LOCAL)
    else needs capabilities
        RT->>EX: POST to server sandbox (SANDBOX)
    end
    EX-->>RT: { json: output } / { error }
    RT-->>CC: result (JSON)
    CC-->>LLM: tool result ({ output })
    LLM->>LLM: continue reasoning with result
```

The agent never sees *where* the script ran — it only sent input and got JSON back.
That is the same property that lets the execution location swap (§2.4) without touching
the agent.

### 5.3 The one thing the switch is *not* free

Toggling `LOCAL` → `SANDBOX` is a no-op for **callers** but a real change in **data
flow**:

| | `LOCAL` (client) | `SANDBOX` (server) |
|---|---|---|
| Where bytes live | already in browser | must be shipped to the sandbox |
| Wire cost | small result only | full input payload |
| Network dependency | none | required |
| Capability ceiling | pure compute only | network/secrets/PII allowed |

So the default is `LOCAL` for pure skills; `SANDBOX` is reached for when a skill
genuinely needs capabilities a client cannot safely have.

## 6. Script layout and host-injected dependencies

### 6.1 `scripts/<entry>.<ext>` layout

Marketplace skill repositories store their executable code under a `scripts/` subdirectory:

```
<skillId>/
  skill.md              # manifest + docs
  scripts/
    <entry>.js          # JS implementation (entry from execution_entry)
    <entry>.py          # (future) Python implementation
```

`resolveSkill` builds the script URL as:

```
${MARKETPLACE_RAW_BASE}/<skillId>/scripts/<entry><ext>
```

where `ext` is mapped from the first declared runtime (`js` → `.js`). This separates the
skill descriptor (`skill.md`) from its implementations and keeps the root clean for
potential multi-runtime skills.

### 6.2 Host-injected dependencies

Skills must **not** import host paths directly. Instead they declare the names of any
dependencies they need, and the host injects them at runtime.

**Declaration** — a new flat frontmatter field in `skill.md`:

```yaml
execution_dependencies: fflate         # comma-separated; empty/absent = none
```

`parseSkillFrontmatter` parses this into `dependencies: string[]` on the manifest.

**Host allowlist** — `worker-host.js` exports `DEPENDENCY_ALLOWLIST`, a map from
dependency name to a vetted module URL served by this host:

```js
export const DEPENDENCY_ALLOWLIST = {
  fflate: '/nx2/deps/fflate/dist/index.js',
};
```

**Injection** — `runner.js` passes `dependencies` (from the manifest) and `allowlist` (the
full `DEPENDENCY_ALLOWLIST` object) to the worker via `postMessage`. The worker bootstrap:

1. For each declared dependency name, looks it up in `allowlist`.
2. If present: `await import(allowlist[name])` and stores the module on `host.deps[name]`.
3. If not present: posts `{ error: 'dependency "<name>" not allowed' }` and returns
   immediately — the skill does not run.

**Usage in a skill script**:

```js
export async function convert({ bytesBase64 }, host) {
  const { unzipSync, strFromU8 } = host.deps.fflate;  // injected, not imported
  ...
}
```

This is the same capability-injection principle as `host.log`: skills declare what they
need, the host grants exactly that from its vetted set, and skills contain no host-specific
paths. AO's Python runtime would inject its own `fflate`-equivalent (or a different
implementation of the declared name) using the same declared-name contract — the skill
source is unchanged.

The fflate path (`/nx2/deps/fflate/dist/index.js`) lives **only** in the host allowlist.
Skills never see it.

## 7. Decisions on record

- **Runtime model:** one JSON-serializable I/O contract per skill, with per-runtime
  implementations (`script.js`, later `script.py`). Same contract, runtime picks the
  impl.
- **Client eligibility:** declare-and-enforce-by-construction. Empty capabilities =
  client-eligible; the worker grants zero ambient access and only injected
  capabilities.
- **Phase 1 scope:** prove the substrate in isolation with docx as the proof skill; no
  chat wiring, no PDF, no authored-skill loading yet.
- **scripts/ layout:** skill code lives at `<skillId>/scripts/<entry>.<ext>`, not flat
  alongside `skill.md`. Keeps the root clean; prepares for multi-runtime implementations.
- **Host-injected deps:** skills declare dep names; the host allowlist grants exact vetted
  URLs; the worker imports and injects. No skill ever imports a host path. AO's Python
  runtime provides its own impl for the declared name — contract is host-independent.

## 8. Skill marketplace providers (configurable, swappable)

Script-carrying skills come **only** from curated marketplaces, never from user-writable
`.da/skills` (§10). A marketplace is accessed through one stable interface, so the *source*
can change without touching callers:

```ts
interface SkillMarketplaceProvider {
  listSkills(): Promise<SkillSummary[]>;          // index entries incl. execution metadata
  getSkillManifest(id): Promise<SkillManifest>;   // entry, runtimes, capabilities, deps, timeoutMs
  getScript(id, runtime): Promise<{ source } | { url }>;
}
```

**Implementations**
- `GitHubMarketplaceProvider` — **today**. Reads `skill.md` + `scripts/<entry>.<ext>` from a
  GitHub repo over raw HTTPS + the contents API.
- `ConfigSheetMarketplaceProvider` — **later**. Marketplace list comes from the site config
  sheet.
- `AOMarketplaceProvider` — **later**. Wraps AO's backend/harness behind the same interface.

**Configuration is a list, and only its *source* migrates:**

| Phase | Where the marketplace list lives |
|---|---|
| now | **in code** — a hardcoded `MARKETPLACES` array |
| next | **config sheet** — read from site config (`ConfigSheetMarketplaceProvider`) |
| later | **ew-extensions UI** — authored/edited in the Skills panel |

Today's config (in code):

```js
const MARKETPLACES = [
  // DEMO: prod target is adobe/skills once the PR lands.
  { type: 'github', owner: 'exp-workspace', repo: 'skills', branch: 'main', path: 'ew' },
];
```

A `providerFor(entry)` factory turns each config entry into a provider. Adding AO is a new
entry `{ type: 'ao', … }` → `AOMarketplaceProvider`; **no caller changes**. Swappability is
proven by running the same provider conformance suite against an `AOMarketplaceProvider` stub.

## 9. Backwards compatibility (no PLG regression)

Existing customers already load prose skills from `.da/skills` and the legacy config sheet.
That behavior is a **frozen contract**:

- **Marketplace is purely additive.** It is appended to the index after the existing
  folder→sheet resolution and resolved through its own provider. It never displaces,
  reorders, or alters folder/sheet skills.
- **Untouched paths:** `loadSkillsIndexFromFolders`, `loadSkillBodyFromFolder`,
  `loadSkillsIndex`, `loadSkillContent`, `saveSkillContent` (load, read, **save, delete**).
- **Folder skills stay prose-only** — `.da/skills` `skill.md` never yields `execution`
  metadata, so a `script.js` there is inert.
- **Precedence unchanged:** `.da/skills` (exclusive when present) → config sheet (fallback)
  → then marketplace appended.

**Regression net (written *before* the refactor):** characterization tests snapshot the
current output of all five functions above. Any change to existing-skill behavior fails them.

## 10. Security model — tested, not asserted

| Property | Mechanism | Test |
|---|---|---|
| **Scripts only from marketplace** | folder/sheet skills carry no `execution`; only provider-sourced skills are runnable | a `script.js` in `.da/skills` is never executed |
| **No network** | worker deletes `fetch`/XHR/`WebSocket`/`importScripts`/`sendBeacon` before loading the script | each global is `undefined` in the worker |
| **No storage** | no `indexedDB`/`caches`/`localStorage`; worker has no `document`/cookies | each absent in the worker |
| **No credentials / PII** | IMS tokens, cookies, session are **never injected**; `host` exposes only `log` + allowlisted `deps` | `host` has no token/credential fields; script cannot read them |
| **Capability gating** | only `capabilities: []` (pure) runs client-side; anything else routed to server runtime | non-empty capability → refused, no worker spun |
| **Dependency allowlist** | only allowlisted dep names inject; others refused | non-allowlisted dep → `{ error: 'dependency not allowed' }` |
| **No exfiltration** | combination of no-network + no-creds means a script *cannot* leak data even if malicious | script attempting `fetch` fails |

**Prompt injection.** Two surfaces:
1. **The script** cannot inject into the agent — it returns JSON `output`; it has no path to
   the system prompt.
2. **The converted document content** is untrusted user data that *does* reach the agent (as
   the skill's `output`). Mitigation: tool/skill output is presented to the model as **data,
   not instructions**, and skill output is **never merged into the system prompt**. The
   curation of marketplace *scripts* does not extend to *user document content* — that is
   always treated as untrusted.

## 11. Migration path & flow

Two independent axes migrate over time; the contracts (§2.1 I/O, §8 provider) stay fixed:

- **Config source:** code → config sheet → ew-extensions UI.
- **Execution location:** client worker (now) → harness server sandbox → AO Python runtime.

### Today

```mermaid
flowchart LR
  CFG["Marketplace config<br/>(in code)"] --> PROV["GitHubMarketplaceProvider"]
  PROV --> IDX["da-agent: skills index<br/>folder + sheet + marketplace"]
  IDX --> PROMPT["system prompt:<br/>script-runnable skills"]
  PROMPT --> LLM["agent emits skill_run_script"]
  LLM --> RES["da-nx: resolveSkill<br/>from marketplace (GH raw)"]
  RES --> WORK["sandboxed Web Worker<br/>(pure, host.deps injected)"]
  WORK --> OUT["JSON output → agent"]
  style WORK fill:#e8f4ec,stroke:#2d7d46
```

### Tomorrow (with AO / harness)

```mermaid
flowchart LR
  CFG["Marketplace config<br/>(config sheet / UI)"] --> FAC["providerFor(entry)"]
  FAC --> GH["GitHubMarketplaceProvider"]
  FAC --> AO["AOMarketplaceProvider"]
  GH --> IDX["skills index"]
  AO --> IDX
  IDX --> LLM["agent emits skill_run_script"]
  LLM --> DISP["runSkillScript dispatcher"]
  DISP -- "pure" --> WORK["client Web Worker"]
  DISP -- "needs capabilities" --> SBX["harness server sandbox"]
  SBX --> PY["AO Python runtime<br/>def entry(input, host)"]
  WORK --> OUT["JSON output → agent"]
  PY --> OUT
  SBX --> OUT
  style AO fill:#def,stroke:#39c
  style SBX fill:#def,stroke:#39c
  style PY fill:#def,stroke:#39c
```

The caller boundary (`skill_run_script` → JSON output) is identical in both diagrams. What
changes between today and tomorrow is *where the marketplace list comes from* and *where the
script executes* — never the skill contract or the calling code.

## 12. Decisions on record (additions)

- **Marketplace provider interface** is the swap point. Config is a list whose *source*
  migrates (code → sheet → UI); providers are interchangeable; AO is just another provider.
- **Backwards compatibility is a frozen contract**, protected by characterization tests on
  the five existing load/read/save functions before any refactor.
- **Security is structural and tested**: scripts only from marketplace, sandbox has no
  network/storage/creds, capability + dependency gating, document content treated as
  untrusted data.
