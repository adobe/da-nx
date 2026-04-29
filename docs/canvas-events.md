# Canvas Events

Communication within the canvas block uses two mechanisms: **DOM CustomEvents** for component-tree-local signalling, and **observables** for cross-cutting concerns that span component boundaries. Constants for event name strings live in [`nx2/blocks/canvas/canvas-events.js`](../nx2/blocks/canvas/canvas-events.js).

---

## Observable signals

Observables represent **core editor interactions** — the signals that any panel or block may need to participate in, now or in the future. They are the designed extension points for new panels and blocks: a panel added months later can subscribe immediately on connect and participate in the same interactions as everything built today, with no wiring changes required elsewhere.

This is the key difference from DOM CustomEvents: events require a DOM ancestor relationship to be in place at the time of wiring. Observables have no such constraint — subscribers connect asynchronously, in any order, from any location in the tree.

Use an observable when the signal is a core interaction that future participants should be able to opt into. Use a DOM event when the signal is scoped to a known parent-child relationship that will not grow.

They live in `editor-utils/document.js` and follow a consistent shape:

```js
const myObservable = (() => {
  const listeners = new Set();
  return {
    emit(value) { listeners.forEach((fn) => fn(value)); },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);    // call the return value to unsubscribe
    },
  };
})();
```

### Two variants — choose deliberately

**State observable** — fires the last-known value immediately on subscribe, then on every subsequent change. Use when a subscriber needs the current value at mount time (e.g. a panel that opens after the document is already loaded).

**Event observable** — fires only going forward; no replay on subscribe. Use when the signal is a momentary occurrence with no meaningful "current value" (e.g. a selection change or a user action).

Getting this wrong causes bugs: a state observable replaying stale data on mount, or an event observable leaving a late subscriber with no initial state.

### Before adding a new observable

Check the registry below. If the data you need is already emitted, subscribe to the existing observable — don't introduce a parallel channel for the same information. If you do need a new one, add it to `editor-utils/document.js` and register it here.

### Registry

| Name | Variant | Description |
|---|---|---|
| `editorHtmlChange` | State | Serialised AEM HTML of the active document; rebuilds on every structural change |
| `editorSelectChange` | Event | Active block/section selection; emitted by any participant, consumed by all others |

---

### `editorHtmlChange`

```js
import { editorHtmlChange } from '../editor-utils/document.js';
const unsub = editorHtmlChange.subscribe((aemHtml) => { … });
```

Emits the full serialised AEM HTML of the active document after every structural change. Subscribers receive the last-known value immediately on subscribe. Used by `nx-page-outline` to rebuild the block tree.

### `editorSelectChange`

```js
import { editorSelectChange } from '../editor-utils/document.js';
const unsub = editorSelectChange.subscribe(({ sectionIndex, blockFlatIndex, source }) => { … });
```

Emits whenever the active block/section selection changes — from the canvas (cursor move) or from a panel (e.g. outline click). Does not replay on subscribe. Every participant both emits and subscribes; use `source` to skip your own echoes and prevent feedback loops.

| Field | Type | Description |
|---|---|---|
| `sectionIndex` | `number` | Zero-based section index in `main > div` |
| `blockFlatIndex` | `number` | Zero-based index across all blocks in the document (`-1` = section-level selection with no specific block) |
| `source` | `string` | Emitter identity — e.g. `'wysiwyg'`, `'outline'` |
