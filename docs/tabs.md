# nx-tabs

A horizontal tab strip with keyboard navigation following the WAI-ARIA Tabs pattern.

## Usage

```html
<nx-tabs></nx-tabs>
```

```js
import '../shared/tabs/tabs.js';

const tabs = document.querySelector('nx-tabs');
tabs.items = [
  { id: 'skills', label: 'Skills' },
  { id: 'agents', label: 'Agents' },
  { id: 'prompts', label: 'Prompts' },
];
tabs.active = 'skills';

tabs.addEventListener('tab-change', (e) => {
  console.log(e.detail.id); // 'agents'
});
```

## API

### Properties

| Property | Type     | Reflect | Description                                       |
| -------- | -------- | ------- | ------------------------------------------------- |
| `items`  | `Array`  | no      | Tab descriptors: `{ id: string, label: string }`. |
| `active` | `String` | yes     | The `id` of the currently active tab.             |

### Events

| Event        | Detail   | Description                                 |
| ------------ | -------- | ------------------------------------------- |
| `tab-change` | `{ id }` | Fired when the user switches to a new tab.  |

### CSS Parts

| Part  | Description                  |
| ----- | ---------------------------- |
| `tab` | Each individual tab button.  |

## Keyboard behaviour

| Key          | Action                              |
| ------------ | ----------------------------------- |
| ArrowRight   | Move focus to next tab and select.  |
| ArrowLeft    | Move focus to previous tab.         |
| Home         | Move focus to first tab.            |
| End          | Move focus to last tab.             |
