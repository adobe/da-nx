# Docs and PRs

## Docs (aem.live, authored in Experience Workspace)

The public pages live in Experience Workspace at org `adobe`, repo `aem-website` (https://da.live/#/adobe/aem-website). By URL, expected paths are:

- `docs/ew/administering/translation-service-connection`: supported connectors and the "Connector requests" requirements.
- `docs/ew/administering/translation-config`: config keys and the service section.
- `docs/ew/administering/translation-config-samples`: copy-paste examples.

These paths are inferred from the public URLs. Verify them with the Experience Workspace tools or ask the user before relying on them.

Do not edit published Experience Workspace content without confirmation. Draft the changes in the PR description or a scratch file, and hand them over (or apply them after the user approves).

What to document for each new connector, using [../assets/docs-config-section.md.tmpl](../assets/docs-config-section.md.tmpl):

1. Add the vendor to the supported-services list on the connection page.
2. A config section: `translation.service.name` value (exact, case-insensitive, spaces become `-` in the directory name), every `translation.service.<env>.<key>`, which keys belong in the credential sheet (`translation.service.key.path`) rather than the editable config, and `translation.service.all.env`.
3. A config sample row set.
4. Vendor-side prerequisites: account/sandbox, API user or key, permissions, any custom fields the vendor requires, supported languages and codes.
5. Behavior notes the user would otherwise be surprised by: how long jobs take, what statuses mean, what cancel does, size and name limits.

Longer rationale and wire-level quirks go in `docs/*.md` in da-nx, not inline comments (repo convention). Use it sparingly; a connector rarely needs more than one short page. Run [`/avoid-ai-writing`](https://github.com/cloudadoption/artoo/tree/main/skills/avoid-ai-writing) (Adobe-internal repo; request access if the link 404s) over every generated doc.

## PRs

One PR per repo; link them to each other in each description. Use the same `feat/<name>-connector` branch name in all three repos, and base each on the branch the user chose in step 4.

| Repo | Branch | Title (Conventional Commits) |
|---|---|---|
| `adobe/da-nx` | `feat/<name>-connector` | `feat(loc): add <Name> translation connector` |
| `adobe/da-translate` | `feat/<name>-connector` | `feat: add <Name> translation service` |
| `da-sites/da-etc` | `feat/<name>-connector` | `feat: add <Name> integration` |

- Titles use Conventional Commits; in da-nx the squash title is what semantic-release reads. `feat` (minor) is right for a new connector; use `fix` for bug-only changes.
- Run `git log --format="%s%n%b---" -20` in each repo before the first commit. da-nx enforces commitlint through husky; fix the message instead of `--no-verify`.
- Add the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` to commits.
- Never hand-edit `CHANGELOG.md` in da-nx (semantic-release owns it).
- Don't push, open PRs or post comments without the user's confirmation. Each push, each PR and each comment needs its own confirmation.

**PR description**: a short bullet list of changes. No narration. Include:

- What the connector does (modes, options).
- Companion PR links.
- Config keys admins must set, linking to the docs draft.
- How it was verified: unit tests, checker script output, and the live run against the vendor sandbox (what you ran).
- Known limitations or deferred items.

Run `/avoid-ai-writing` on the description. After each push, re-validate the description against the whole branch (`gh pr view`) and update it if stale; that update doesn't need confirmation.

After opening a da-nx PR, run [`/docs-drift-check`](https://github.com/cloudadoption/artoo/tree/main/skills/docs-drift-check) and report the findings (Adobe-internal repo; request access if the link 404s). Skip that step for repos where it's disabled in the user's global instructions.

**Rollout order**: da-etc first, da-translate second, da-nx last. The browser code assumes both endpoints exist. Deploying da-nx first leaves the connector failing with opaque 404s. State this order in the PR descriptions.

## Done checklist

- [ ] Vendor passes the aem.live requirements (intake report saved)
- [ ] da-etc fetcher registered; tests pass; README updated
- [ ] da-translate service routed, IMS-gated, tested; env allowlist (if any) documented
- [ ] da-nx connector under `nx/blocks/loc/connectors/<name>/` with tests; `npm run lint` clean
- [ ] `check-connector.mjs` has no FAIL
- [ ] Live run against vendor sandbox recorded
- [ ] Docs drafted for all three aem.live pages
- [ ] Three cross-linked PRs with conventional titles
