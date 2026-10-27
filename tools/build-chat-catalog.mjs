import { readFile, writeFile } from 'node:fs/promises';

const upstream = 'https://experience.adobe.com/solutions/Adobe-dxue-coworker-ui-experience/assets/component-catalog.9d298bd1fdec9715.json';
const artifacts = new URL('../nx2/blocks/chat-ao/artifacts/', import.meta.url);
const response = await fetch(upstream);
if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
const catalog = await response.json();
const schema = JSON.parse(await readFile(new URL('file-list.schema.json', artifacts), 'utf8'));
catalog.components.FileList = schema;
await writeFile(new URL('component-catalog.json', artifacts), `${JSON.stringify(catalog)}\n`);
