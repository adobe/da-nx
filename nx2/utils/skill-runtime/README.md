# skill-runtime

Client-side execution substrate for da-nx skill scripts.

## Frontmatter shape

In `.da/skills/<id>/skill.md`, the `execution:` block looks like:

```yaml
execution:
  id: my-skill
  entry: run
  runtimes: [js]
  capabilities: []
  timeoutMs: 5000
```

## Fields

| Field | Type | Description |
|---|---|---|
| `entry` | string | Exported function name to call (e.g. `run`, `convert`) |
| `runtimes` | string[] | Supported runtimes. Currently only `js` is supported. |
| `capabilities` | string[] | Required host capabilities. Empty array = client-eligible. |
| `timeoutMs` | number | Max execution time in ms (default 5000). |

## Client eligibility

A skill is client-eligible when `capabilities` is empty (`[]`).

Skills that declare any capability (`network`, `secrets`, `pii`, `storage`) require a
server-side runner and will return `{ error: 'requires server runtime' }` from the client.

## Script contract

```js
// skill.js
export async function <entry>(input, host) {
  host.log('doing work...');
  // input is the plain object from the caller
  // return the output object
  return { result: '...' };
}
```

- `input` — plain object passed by the caller
- `host.log(...args)` — buffered log; flushed into the result alongside output
- No ambient globals available (`fetch`, `XMLHttpRequest`, `WebSocket`, etc. are neutered)
- Only pure ECMAScript + lazy-imported modules via absolute URLs

## Security

Skills run in a sandboxed Web Worker. Ambient network and storage globals are neutered
before the skill module is imported. The worker is terminated after each run.
