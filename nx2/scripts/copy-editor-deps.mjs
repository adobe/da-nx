#!/usr/bin/env node
/*
 * Copies da-y-wrapper and da-parser dist bundles from da-live into nx2/deps/.
 * Run from da-nx repo root: node nx2/scripts/copy-editor-deps.mjs
 * Override source: DA_LIVE_ROOT=/path/to/da-live
 */
import { cpSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nxRoot = join(scriptDir, '../..');
const liveRoot = process.env.DA_LIVE_ROOT || join(nxRoot, '../da-live');

const copies = [
  { from: join(liveRoot, 'deps/da-y-wrapper/dist'), to: join(nxRoot, 'nx2/deps/da-y-wrapper/dist') },
  { from: join(liveRoot, 'deps/da-parser/dist'), to: join(nxRoot, 'nx2/deps/da-parser/dist') },
];

let ok = true;
for (const { from, to } of copies) {
  if (!existsSync(from)) {
    // eslint-disable-next-line no-console
    console.error(`[copy-editor-deps] Missing source: ${from}`);
    ok = false;
  } else {
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
    // eslint-disable-next-line no-console
    console.log(`[copy-editor-deps] ${from} -> ${to}`);
  }
}

if (!ok) {
  process.exitCode = 1;
}
