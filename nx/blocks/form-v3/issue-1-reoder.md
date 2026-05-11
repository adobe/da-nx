## Problem

Array reordering in Form V3 no longer works after simplifying the controller/core communication model.

The reorder confirmation UI currently emits a payload using:

```js
{
  type: 'form-array-reorder',
  pointer,
  beforePointer,
}
```

However, the simplified controller and core API now expect:

```js
{
  type: 'form-array-reorder',
  pointer,
  fromIndex,
  toIndex,
}
```

Because of this mismatch:

- `fromIndex` becomes `undefined`
- `toIndex` becomes `undefined`

Then `core.moveArrayItem(...)` rejects the operation because the indices are invalid.

As a result:

- the reorder confirmation completes
- but no mutation is applied
- and the array order does not change

---

# Root Cause

The architecture was simplified to:

- remove pointer choreography from the controller
- remove `moveArrayItemBefore(...)`
- use explicit index-based array movement

But the reorder UI still emits the old pointer-based payload.

So the UI and core are no longer using the same reorder contract.

---

# Correct Architecture

The simplified architecture intentionally moved array movement semantics to:

```txt
UI provides indices
→ controller forwards directly
→ core performs move
```

The controller should NOT:

- parse pointers
- compute indices
- infer array structure

The UI already knows:

- the current item index
- the target index

So the UI should provide them directly.

---

# Required Fix

Update the reorder confirmation flow in the UI layer to emit:

```js
{
  type: 'form-array-reorder',
  pointer,
  fromIndex,
  toIndex,
}
```

instead of:

```js
{
  type: 'form-array-reorder',
  pointer,
  beforePointer,
}
```

---

# Expected Flow After Fix

```txt
UI reorder confirm
→ emits fromIndex/toIndex
→ controller calls core.moveArrayItem(...)
→ core validates indices
→ array mutator applies reorder
→ updated state returned
→ UI rerenders
```

---

# Important Constraint

Do NOT reintroduce:

- `moveArrayItemBefore(...)`
- pointer choreography in the controller
- pointer-based move translation
- complex reorder mapping logic

The architecture simplification intentionally removed those abstractions.

The reorder flow should remain:

- explicit
- index-based
- direct
- simple

---

# Final Goal

The reorder flow should remain aligned with the simplified architecture:

```txt
UI intent
→ direct core method call
→ updated state
→ rerender
```

without:

- extra pointer parsing
- translation layers
- move-before abstractions
- orchestration complexity
