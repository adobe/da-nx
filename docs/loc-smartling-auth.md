# Smartling connector auth (`nx/blocks/loc/connectors/smartling/auth.js`)

## Credential model

Smartling credentials are held server-side by da-etc and never sent to the
browser. `authenticate()` exchanges them for a short-lived access/refresh
token pair via da-etc's `/integrations/smartling/login` endpoint (see
`nx/blocks/loc/utils/auth.js`'s `login()`). This matches Trados/Lionbridge's
`authReady` model: connecting is transparent, with no separate manual step
required by default — `ensureConnected()` backs both `isConnected()` and
`connect()`.

## Token refresh and the 12-hour session cap

Smartling caps a token pair's session at 12 hours regardless of how many
times the access token is refreshed. Eventually `refreshOrReauthenticate()`'s
refresh call starts failing even though da-etc's held credentials still
work, so it falls back to a full `authenticate()` re-run rather than giving
up. `authContext` (module-level) is retained specifically so that fallback
has an org/site/env to re-authenticate against.

`scheduleRefresh()` tracks Smartling's actual reported `expiresIn` rather
than assuming a constant lifetime, since that value shrinks as a session
nears the 12-hour cap. It only stops rescheduling once
`refreshOrReauthenticate` fails outright (both refresh and fallback
re-auth), so a translation job that outlives several sessions keeps working
without user intervention.

`onUnauthorized()` is the reactive counterpart: if a request 401s before the
proactive schedule catches up (e.g. the tab was backgrounded and its timers
were throttled), it refreshes once and retries with a fresh Authorization
header.

## Legacy origin

`resolveOrigin()` rewrites configs still pointing at translate.da.live's
deprecated `/smartling` route to `/translate/smartling/<org>/<site>`, so
old configs keep working without a migration.
