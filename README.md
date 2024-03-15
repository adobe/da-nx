# Nexter
Next generation shell for Edge Delivery Services

## About
Nexter provides a common set of styles, patterns, blocks, components, and libraries to accelerate building AEM Edge Delivery front-end applications.

## How to use Nexter
There are two ways to integrate Nexter.

1. **Standalone library** - Add a script to an existng HTML page. Also useful for CMS-based content.
2. **Individual Web Components** - Integrate Nexter Components directly into your SPA.

## Standalone library integration
### Step 1
Add Nexter to your head element.

```html
<script src="https://main--nexter--da-sites.hlx.live/nx/scripts/nexter.js" type="module"></script>
<link rel="stylesheet" href="https://main--nexter--da-sites.hlx.live/nx/styles/nexter.css"/>
```

### Step 2
Import and run Nexter's `loadArea` function.

```
import { loadArea } from 'https://main--nexter--da-sites.hlx.live/nx/scripts/nexter.js';
loadArea();
```

### Step 3
There is no step 3.

## Integration guide (advanced)
At it's core, Nexter is just another Edge Delivery project. You can start with the basic integration and then progressively add Nexter features like blocks. You can do this using a typical Edge Delivery project, or you can bring your own HTML as long as you follow Edge Delivery semantics. The following goes beyond the basic integration.
