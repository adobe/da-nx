# Canvas Events

Communication within the canvas block uses two mechanisms: **DOM CustomEvents** for component-tree-local signalling, and **observables** for cross-cutting concerns that span component boundaries.

---

## Observable signals

Observables represent **core editor interactions** — the signals that any panel or block may need to participate in, now or in the future. They are the designed extension points for new panels and blocks: a panel added months later can subscribe immediately on connect and participate in the same interactions as everything built today, with no wiring changes required elsewhere.

This is the key difference from DOM CustomEvents: events require a DOM ancestor relationship to be in place at the time of wiring. Observables have no such constraint — subscribers connect asynchronously, in any order, from any location in the tree.

Use an observable when the signal is a **change notification** that unrelated components need to react to. Use the **extensions bridge** (`editor-utils/extensions-bridge.js`) when a panel wants to imperatively modify the editor — block insert, move, delete. The bridge gives synchronous view access; `editorHtmlChange` then propagates the result to any observer. Do not create a new observable for editor commands.

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
const unsub = editorSelectChange.subscribe(({ blockIndex, source, blockName, proseIndex, innerText }) => { … });
```

Emits whenever the active block/section selection changes — from the canvas (cursor move) or from a panel (e.g. outline click). Does not replay on subscribe. Every participant both emits and subscribes; use `source` to skip your own echoes and prevent feedback loops.

`document.js` automatically enriches events with block metadata derived from the current `editorHtmlChange` state. Consumers that only need `blockIndex` and `source` are unaffected.

| Field | Type | Description |
|---|---|---|
| `blockIndex` | `number` | Zero-based index across all blocks in the document (`-1` = no specific block) |
| `source` | `string` | Emitter identity — `'wysiwyg'`, `'outline'`, or `'doc'` |
| `blockName` | `string \| undefined` | Block class name (e.g. `'hero'`); absent when no matching block is found |
| `proseIndex` | `number \| undefined` | ProseMirror position of the block's first editable node |
| `innerText` | `string \| undefined` | Plain-text content of the block at selection time |
| `explicit` | `boolean \| undefined` | `true` when the selection was a deliberate block selection (NodeSelection); `false`/absent for cursor-driven TextSelection. Currently set only by `source: 'doc'` |

#### Known gap — chat context requires explicit block selection

The canvas chat bridge only adds context when `source === 'doc'` and `explicit === true` — meaning the user clicked the block select handle in the doc editor, producing a `NodeSelection`.

Two cases are intentionally excluded:

- **Cursor movement in doc** (`source: 'doc'`, `explicit: false`): cursor crossing a block boundary by typing or keyboard navigation does not update chat context, only the outline highlight. Chat context is only replaced by a new explicit selection — this mirrors the editor's own visual behaviour, where `NodeSelection` persists until another explicit selection is made.
- **wysiwyg entirely** (`source: 'wysiwyg'`): the WYSIWYG editor has no block-select handle equivalent, so all wysiwyg events are excluded. If a block-selection affordance is added to wysiwyg in the future, it should emit `explicit: true` to opt in.

