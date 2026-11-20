# Translate: Localize Links

Links are sent to translation as do-not-translate (DNT), so a page translated from `/en-nl` to `/nl-nl` comes back
still linking to `/en-nl/...`. `translate.links.localize` is an opt-in site setting that moves those links to the
folder the translated page is saved to.

It does one thing: it rewrites every matching link, or none (flag off, the default). To change only some links, edit
them by hand. Links to pages that were not translated are caught by preflight before publishing, as usual. To
translate page names, remove the DNT on links and agree the handling with your translation vendor.

Only translation saves are affected. Copy and rollout to locales don't localize links: rolling `/de` out to `/de-at`
keeps `/de/...` links.

## Enabling

Add a row to the `config` sheet of the site's `/.da/translate.json` (or the org's, which applies to sites without
their own config, like every other translate setting):

| key | value |
|---|---|
| `translate.links.localize` | `true` |

Sites where the setting is missing (or has any other value) save translations exactly as before.

## What is rewritten

Only links (`<a>` elements) in HTML pages that link to this site:

- root-relative links (`/en-nl/about`)
- links to the site's own `{branch}--{site}--{org}` hosts (any branch) on `aem.page`, `aem.live`, `hlx.page` or
  `hlx.live`; the host and protocol are kept

A link is rewritten when its path starts with a "from" folder (whole folders only, so `/en` does not match `/en-us`).
The folder is replaced by the language's `location`, keeping the rest of the path, query and hash. Other hosts,
relative links (`../x`), `mailto:`, `#` anchors and JSON content are left alone.

When a link's text is the link itself (for example a fragment link showing its own URL), the text is updated to
match, as long as it is a single run of text (formatting the whole URL is fine). If only part of the URL is
formatted, the link is still moved but its text is left as is. Any other link text is left as translated.

## Which folders are "from" folders

- The language's own `source` column, if set (region setups). Otherwise the project's `source.language` location,
  which is where the content sent for translation is read from.
- For a dependent language (its `source language` names a language other than the project's `source.language`),
  also the location of that language. For example French Canada translated from French moves `/fr/...` links too.
  That location is the one saved in the project when it was created; if that language isn't in the project, the
  current languages sheet is used.

## Rules

- Longest match wins: a link inside a more specific configured location (another language, locale or source) is
  left alone, and a destination inside the source folder is never nested.
- A root `/` source does nothing (every link would match). A root `/` destination moves links to the site root
  (`/en/about` → `/about`).
- Snapshot saves use the live destination folder in links.

## Known limitations

- Paths are compared folder by folder after decoding (`/ja/%E6%97%A5%E6%9C%AC` matches `/ja/日本`); the rest of the
  link is kept exactly as written. An encoded slash (`%2F`) is not a folder separator.
- Paths are not resolved: links ending in `.html` at a location root (`/en.html`) and paths with dot segments
  (`/en/../x`) are matched as written. EDS page URLs have no extension and authors don't write dot segments, so these
  shouldn't appear in DA content.
