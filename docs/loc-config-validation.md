# Loc translate config validation

Every translation project validates the `.da/translate.json` config before it can be configured or run. Misconfigured languages or connector values show an error message and block the project until the config is fixed.

Rules live in `nx/blocks/loc/utils/validate-config.js`.

## Where it runs

- **Basics:** after org and site are known, the config cache is cleared and the config is re-fetched and validated. Errors block the step.
- **Options:** validated before the options are built. Errors block saving and continuing.
- **Translate:** the project's saved service is validated before connecting. Errors block "Connect" and "Translate all".

## Error display

One error shows as a single line. Several show a heading ("Translate config has N issues:") with a bulleted list, built by `configErrorMessage` and rendered by `nx-loc-actions`.

## Language rules

- At least one language row exists.
- Each row has a `name`, `code`, `location` and `actions`.
- `location` starts with `/`.
- `actions` only uses `translate`, `copy`, `rollout` or `skip`.
- `code` and `location` are unique. Locations compare ignoring case and trailing slashes.
- A row's optional `source` starts with `/`.
- A row's optional `source language` names another configured language (exact match, as the options view resolves it).
- The config's `source.language` matches a configured language name.

## Connector rules

- `translation.service.name` is set and is a supported service.
- The first env in `translation.service.all.env` (default `prod`) has every required key.
- Each env listed in `all.env` has at least one `translation.service.{env}.*` value. `name`, `all` and `key` are not environments.
- Credential keys (below) are also required, because the translation service fails at run time without them.

Each connector exports two lists from its `index.js`: `requiredKeys` (client-side values) and `requiredCredentialKeys` (used by the server-side service). The validator loads the connector on demand and reads them. An entry can be an array of aliases; any one value satisfies it.

| Service | `requiredKeys` | `requiredCredentialKeys` |
| --- | --- | --- |
| glaas | `origin`, `clientid` | none |
| globallink | `endpoint`, `fileFormatName` | `clientId`, `clientSecret`, `username`, `password` |
| google | none | none |
| lionbridge | `apiEndpoint`, `providerId` | `authEndpoint`, `clientId`, `clientSecret` |
| sample | none | none |
| smartling | `origin`, `projectId` | `userIdentifier`, `userSecret` |
| trados | `tenantId`, `apiEndpoint` | `authEndpoint`, `clientId`, `clientSecret` |

## Key sheet

If `translation.service.key.path` is set, the validator fetches that sheet and reads its `translation.service.{env}.{key}` rows. These values are merged over the config sheet, so the key sheet wins, matching the server.

- Credential keys can come from either sheet.
- If the key sheet can't be read (non-OK response, invalid JSON, or a failed request), the error names the path and credential checks are skipped.
- Without `key.path`, credential keys must be in the config sheet.
- The saved project service holds only config-sheet values, so the translate step checks `requiredKeys` only.

To add a connector, export `requiredKeys` and `requiredCredentialKeys` from its `index.js`. The validator loads connectors dynamically, so no registry needs updating. Folder names must use lowercase letters, digits, and hyphens.

A site without a translate config falls back to the Google connector, which passes validation.
