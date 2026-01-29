# Schema Testing Guide

Quick reference for testing all JSON Schema variants after the standardization fixes.

## Testing URLs

Replace `YOUR_FORM_URL` with your actual form URL (e.g., `http://localhost:3000/form-path`).

### 1. Pure Inline Schemas (No $ref/$defs)

#### Simple Form
```
YOUR_FORM_URL?localSchema=pure-inline-simple
```
**What to verify:**
- ✅ Text inputs render (firstName, lastName, email)
- ✅ Number input renders (age)
- ✅ Select dropdown renders (country)
- ✅ Checkbox renders (newsletter)
- ✅ Array of strings works (interests)
- ✅ Textarea renders (bio with x-semantic-type)
- ✅ Required validation works

#### Complex Form
```
YOUR_FORM_URL?localSchema=pure-inline-complex
```
**What to verify:**
- ✅ Nested arrays render (team → skills)
- ✅ Deep object nesting works (budget → breakdown)
- ✅ Arrays with object items render
- ✅ Multiple nesting levels work
- ✅ Navigation tree shows all levels
- ✅ Add/remove items works

#### Comprehensive Inline Test
```
YOUR_FORM_URL?localSchema=inline-test
```
**What to verify:**
- ✅ All primitive types work
- ✅ Arrays of primitives (strings, numbers)
- ✅ Arrays of objects with inline definitions
- ✅ Arrays of arrays (skillCategories)
- ✅ Deeply nested objects (metadata → author → email)
- ✅ Custom semantic types (biography as textarea)
- ✅ Format validation (email, date)
- ✅ Required fields validated

### 2. Pure $ref/$defs Schemas (Regression Tests)

#### Simple Test (Existing)
```
YOUR_FORM_URL?localSchema=simple-test
```
**What to verify:**
- ✅ Works exactly as before (no regression)
- ✅ All features still functional
- ✅ $ref resolution works
- ✅ Reusable components work

#### Root Level $ref
```
YOUR_FORM_URL?localSchema=root-level-ref
```
**What to verify:**
- ✅ Root level $ref resolves correctly
- ✅ Reusable definitions work
- ✅ Multiple references to same definition work
- ✅ Navigation shows proper structure

#### Offer Schema
```
YOUR_FORM_URL?localSchema=offer
```
**What to verify:**
- ✅ Simple production schema works
- ✅ Required fields validated
- ✅ Nested CTA object works

### 3. Mixed Inline and $ref

```
YOUR_FORM_URL?localSchema=mixed-inline-refs
```
**What to verify:**
- ✅ Inline fields work alongside $ref fields
- ✅ Inline arrays work
- ✅ $ref arrays work
- ✅ Inline objects work
- ✅ $ref objects work
- ✅ No conflicts between patterns
- ✅ Navigation shows all items correctly

### 4. Edge Cases

```
YOUR_FORM_URL?localSchema=edge-cases
```
**What to verify:**
- ✅ Empty optional arrays render
- ✅ Required arrays (minItems) validated
- ✅ Limited arrays (maxItems) enforced
- ✅ Arrays of arrays work
- ✅ Deep nesting (4+ levels) works
- ✅ All primitive types render correctly
- ✅ String and number enums work
- ✅ Validation patterns work (email, date, regex)
- ✅ Empty objects don't crash

## Test Scenarios by Feature

### Field Type Rendering

| Feature | Test Schema | URL Parameter |
|---------|-------------|---------------|
| Text input | `pure-inline-simple` | `?localSchema=pure-inline-simple` |
| Number input | `pure-inline-simple` | `?localSchema=pure-inline-simple` |
| Checkbox | `pure-inline-simple` | `?localSchema=pure-inline-simple` |
| Select (enum) | `pure-inline-simple` | `?localSchema=pure-inline-simple` |
| Textarea (long-text) | `inline-test` | `?localSchema=inline-test` |

### Array Handling

| Feature | Test Schema | URL Parameter |
|---------|-------------|---------------|
| Array of strings | All | Any schema |
| Array of numbers | `inline-test` | `?localSchema=inline-test` |
| Array of objects | `pure-inline-complex` | `?localSchema=pure-inline-complex` |
| Array of arrays | `inline-test` | `?localSchema=inline-test` |
| Empty arrays | `edge-cases` | `?localSchema=edge-cases` |
| Required arrays | `edge-cases` | `?localSchema=edge-cases` |
| Limited arrays (max) | `edge-cases` | `?localSchema=edge-cases` |

### Object Nesting

| Feature | Test Schema | URL Parameter |
|---------|-------------|---------------|
| Simple nested object | `pure-inline-simple` | `?localSchema=pure-inline-simple` |
| Deep nesting (3+ levels) | `pure-inline-complex` | `?localSchema=pure-inline-complex` |
| Very deep nesting (4+) | `edge-cases` | `?localSchema=edge-cases` |

### Schema Patterns

| Pattern | Test Schema | URL Parameter |
|---------|-------------|---------------|
| Pure inline | `pure-inline-simple` | `?localSchema=pure-inline-simple` |
| Pure $ref/$defs | `simple-test` | `?localSchema=simple-test` |
| Mixed | `mixed-inline-refs` | `?localSchema=mixed-inline-refs` |
| Root $ref | `root-level-ref` | `?localSchema=root-level-ref` |

## Complete Test Flow

### 1. Smoke Test (Quick Validation)
Run these 3 tests to verify basic functionality:

```bash
# 1. Inline schema works
?localSchema=pure-inline-simple

# 2. $ref schema still works (no regression)
?localSchema=simple-test

# 3. Mixed approach works
?localSchema=mixed-inline-refs
```

### 2. Comprehensive Test
Run all schemas to verify complete coverage:

```bash
# Pure inline variants
?localSchema=pure-inline-simple
?localSchema=pure-inline-complex
?localSchema=inline-test

# Pure $ref variants
?localSchema=simple-test
?localSchema=root-level-ref
?localSchema=offer

# Mixed
?localSchema=mixed-inline-refs

# Edge cases
?localSchema=edge-cases
```

### 3. Feature-Specific Tests
Target specific features based on changes:

**Testing field type detection:**
```bash
?localSchema=pure-inline-simple  # Basic types
?localSchema=edge-cases          # All types + enums
```

**Testing array handling:**
```bash
?localSchema=pure-inline-complex  # Complex arrays
?localSchema=edge-cases          # Edge cases
```

**Testing nesting:**
```bash
?localSchema=pure-inline-complex  # Deep inline nesting
?localSchema=edge-cases          # Very deep nesting
```

## Expected Behavior

After the fixes, ALL schemas should:

1. ✅ **Render without errors** - No console errors
2. ✅ **Display all fields** - Every field from schema appears
3. ✅ **Use correct input types** - String→text, boolean→checkbox, etc.
4. ✅ **Show validation errors** - Required fields, patterns, etc.
5. ✅ **Handle arrays** - Add/remove items works
6. ✅ **Navigate properly** - Breadcrumbs and navigation tree work
7. ✅ **Save data** - Form data persists correctly

## Common Issues to Watch For

### ❌ Before Fixes (Expected Failures)

With inline schemas, you might have seen:
- Fields not rendering
- Wrong input types (e.g., text instead of number)
- Arrays not showing items
- "Cannot read property 'type' of undefined" errors
- Missing enum options

### ✅ After Fixes (Expected Success)

All schemas should work identically, regardless of pattern:
- Inline schemas work same as $ref schemas
- No console errors
- All fields render with correct types
- Arrays fully functional
- Navigation works

## Debugging

If a schema fails:

1. **Check console** - Look for warnings about missing type/items
2. **Verify schema** - Ensure `type`, `items`, `enum` are at correct level
3. **Compare behavior** - Does equivalent $ref schema work?
4. **Check navigation** - Do breadcrumbs show expected structure?
5. **Test actions** - Can you add/remove array items?

## Console Warnings (Expected)

You may see helpful warnings for malformed schemas:
- `"Schema missing type"` - Schema lacks type property
- `"Array schema missing items definition"` - Array has no items
- `"Array node missing items schema"` - Node missing items during resolution

These warnings help identify schema issues, not code bugs.

## Success Criteria

✅ All test URLs load without errors  
✅ Inline schemas work identically to $ref schemas  
✅ Mixed approach schemas work correctly  
✅ Edge cases handled gracefully  
✅ No regression in existing $ref/$defs schemas  
✅ Console has no errors (warnings are OK)  
✅ Navigation tree shows all structures  
✅ Add/remove array items works  
✅ Required field validation works  
✅ Form data saves correctly
