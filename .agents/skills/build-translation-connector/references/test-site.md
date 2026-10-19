# Test site for live validation

Offer this after the unit tests pass and before the PRs. It gives the user a disposable Experience Workspace site, already configured for the new connector and filled with pages that exercise it. Ask first; it is optional.

All content work (pages, sheets, folders) goes through the **DA MCP tools** (`da_create_source`, `da_update_source`, `da_get_source`, `da_list_sources`, `da_delete_source`, `da_preview_content`, `da_publish_content`). Use GitHub only for the repo (`gh`). If a DA tool returns 401/403, stop and tell the user; don't work around it.

## Confirmation

Everything here creates remote resources. Show one plan listing every write (repo, config sheets, pages) and get an explicit go-ahead. Ask again separately for: placing a credential, previewing/publishing, and any delete.

## 1. Prompt for names

Ask for the **org** and **site** (one question at a time; offer a default like `<vendor>-connector-test`). Constraints to state:

- The org must be a GitHub org or user you can create repos in (`gh api user/orgs --jq '.[].login'` and your own login). The Experience Workspace org and the GitHub owner are the same name.
- The site name becomes the repo name and the DA site: `https://da.live/#/<org>/<site>`.
- Ask public (recommended by aem.live) or private.

## 2. Create the repo from the boilerplate

```bash
gh repo create <org>/<site> --template adobe/aem-boilerplate --public --description "<vendor> connector test site"
```

Use `--private` if the user chose it. Confirm with `gh repo view <org>/<site> --json url,visibility`.

## 3. Install AEM Code Sync

This cannot be done with the user's `gh` token; the GitHub App install is a browser step. Give the user this link and instructions, then wait:

1. If the app is already installed on the org with **Only select repositories** (check with `gh api /orgs/<org>/installations --jq '.installations[]|.app_slug+" "+.repository_selection'`), open `https://github.com/organizations/<org>/settings/installations`, choose **Configure** on AEM Code Sync, add `<site>` under Repository access and save.
2. Otherwise open `https://github.com/apps/aem-code-sync/installations/new`, pick the org, choose **Only select repositories**, select `<site>`, save, and click **Finish setup** if prompted.

Verify the wiring (retry for up to a minute):

```bash
curl -sI https://main--<site>--<org>.aem.page/scripts/aem.js | head -1   # expect 200
```

A 404 or 401 means Code Sync isn't installed on the repo yet. The root page (`/`) returns 404 until content exists; that is expected. Observed: no explicit `admin.hlx.page` site config was needed, since `da_preview_content` on a page returned 200 on `.aem.page` straight after the install. (`admin.hlx.page` calls need a valid IMS token; `~/.aem/ims-token.json` expires.)

## 4. Configure translation

Create the config sheets with `da_create_source` (content type `application/json`). `.da/translate.json` is a multi-sheet; each tab's `total`, `limit` and `data` row count must match:

```json
{
  "config": { "total": 1, "offset": 0, "limit": 1, "data": [{ "key": "translation.service.name", "value": "<name>", "description": "" }] },
  "languages": { "total": 0, "offset": 0, "limit": 0, "data": [] },
  ":version": 3,
  ":names": ["config", "languages"],
  ":type": "multi-sheet"
}
```

Start from the Google sample (`https://www.aem.live/docs/ew/administering/translation-config-samples/google-language.json`) and replace the service keys; it also carries the conflict-behavior rows and the `custom-doc-rules`, `dnt-content-rules` and `dnt-sheet-rules` tabs. Check column names against [Translation config options](https://www.aem.live/docs/ew/administering/translation-config), because the samples have changed before.

**`.da/translate.json`**

- `config` tab, `key`/`value`/`description` rows: `translation.service.name` (the connector directory name), `translation.service.all.env` (or the env the connector supports), `translation.service.key.path` = `https://admin.da.live/source/<org>/<site>/.da/translate-keys.json` for archetype B, plus every non-secret `translation.service.<env>.<prop>` the connector reads.
- `languages` tab, columns `name`, `code`, `translate type`, `location`, `actions` (`Skip, Translate`): at least two direct languages plus **one dependent language**. Set its `source language` column to the `name` of another row; that holds it back until its dependency completes (the `source` column is a path override, not a dependency).

**`.da/translate-keys.json`** (only if the connector has a secret): a single-sheet with `key`/`value` rows, `translation.service.<env>.<prop>`, and a placeholder value such as `PASTE-KEY-HERE`. da-etc reads the rows from `data` and ignores other keys. The aem.live "separate credentials" sample downloads currently 404, so don't rely on them. Never ask the user to paste a credential into the chat, never print it, and never commit it. Tell them to open `https://da.live/edit#/<org>/<site>/.da/translate-keys` and paste it there. Alternatively, if they explicitly confirm, read it from a local file they name and write it with `da_update_source` without echoing it.

Read both back with `da_get_source` and check the keys against what the connector and da-etc read.

## 5. Create the test pages

Create pages under `/<source location>/translate-test/` (for example `/en/translate-test/`, matching the source language row's `location`) with `da_create_source` (content type `text/html`). Page shell:

```html
<body><header></header><main><div><h1>Title</h1><p>Body</p></div></main><footer></footer></body>
```

Blocks are `<div class="name"><div><div>cell</div></div></div>` inside a section `<div>`. Do-not-translate content uses `translate="no"` on the element.

Build the set from what the connector does, not from a fixed list. Start from this table and add a row for every vendor behavior you found in intake (page-size limits, id-length limits, unsupported markup).

| Page(s) | Exercises | Expect |
| --- | --- | --- |
| `basic` | Headings, paragraphs, lists, links, an image, inline formatting | Round-trips with structure intact |
| `dnt` | `<p translate="no">`, inline `<span translate="no">`, a block marked `translate="no"` | DNT content identical after save; note whether the vendor keeps or strips the attribute |
| `blocks` | `columns`, `cards`, a table block with several variants | Block markup and cell order preserved |
| `data.json` (a sheet) | A sheet with text and DNT columns | Sheet translated per `dnt-sheet-rules`, structure intact |
| `bulk/page-01` … `page-NN` | More than 5 pages (concurrent download limit), and one more than the vendor's list page size when that is practical | All pages submitted, tracked and saved; no pagination loss |
| `collide/a_b/c` and `collide/a/b_c` | Flattened upload-name collisions | Distinct vendor items, both saved to the right path |
| `collide/a` and `collide/ba` | Substring matching of names | Each result maps to its own page |
| `long/<very-long-path-segments>` | Path or title near the vendor's id/name length limit | Truncated or prefixed as designed; no vendor 400 |
| `large` | Several thousand words | Upload and save complete; tab stays responsive |
| `unicode` | Non-ASCII text, entities, emoji | No mojibake after save |

Keep each page small except `large`. Then list the folder with `da_list_sources` and report the page URLs (`https://da.live/#/<org>/<site>/en/translate-test/...`). Pass paths without a leading slash and with the extension (`en/translate-test/basic.html`); sheets are `.json`.

## 6. Scenarios to walk through

Give the user a numbered test plan against `https://da.live/apps/loc?nx=<branch>#/<org>/<site>` (add the `DA_TRANSLATE`/`DA_ETC` overrides when testing unreleased services):

1. Connect, then send `basic` + `dnt` + `blocks` to two languages. Check status moves through created, in progress, translated.
2. Save. Open the saved pages; confirm `translate="no"` content and block markup.
3. Send the `bulk` set (more than five pages). Confirm every page is tracked.
4. Include the dependent language. Confirm it is held until its source language is saved, then sent.
5. Send the `collide` pages; confirm each saves to its own path.
6. Force a vendor failure (bad key via `translate-keys.json`, or an unsupported file). Confirm a single clear error and that no language shows "Get Status" for a job the vendor never received.
7. Reload the browser mid-job. Confirm status and ids persist.
8. Cancel a project (if the vendor supports it). Confirm `cancelled`.
9. Create a second project with the same pages. Confirm it neither collides with nor cancels the first.

Record the outcome of each in the PR (what you ran, what the vendor did). Add any behavior the vendor docs didn't state to the connector's docs.

## 7. Preview, publish and cleanup

Previewing is not needed for translation. Only run `da_preview_content` or `da_publish_content` if the user asks.

Offer cleanup when testing is done, and confirm each: `da_delete_source` for `en/translate-test` and `.da/translate*.json`, and `gh repo delete <org>/<site>` (needs the `delete_repo` scope, which the default `gh` login lacks; give the user `https://github.com/<org>/<site>/settings` instead). Remind them to uninstall or remove the repo from the AEM Code Sync app if they delete the repo.
