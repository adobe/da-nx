#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Static checks for a translation connector across da-nx, da-translate and da-etc.
 * Usage: node check-connector.mjs <name> [--root <da-nx>] [--translate <dir>]
 *   [--etc <dir>] [--json]
 * Exit code 1 if any check FAILs.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const REQUIRED_EXPORTS = ['isConnected', 'connect', 'sendAllLanguages', 'getStatusAll', 'saveItems', 'dnt'];
const results = [];

/**
 * Records a check result.
 * @param {'PASS'|'WARN'|'FAIL'} level - Result level.
 * @param {string} scope - Repo scope (da-nx, da-translate, da-etc).
 * @param {string} message - Human-readable message.
 * @returns {void}
 */
function record(level, scope, message) {
  results.push({ level, scope, message });
}

/**
 * Parses argv into a name and flags.
 * @param {string[]} argv - Arguments after the script path.
 * @returns {{name: string, flags: Object<string, string|boolean>}} Parsed arguments.
 */
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      i += 1;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--') && arg !== '--json') {
      flags[arg.slice(2)] = argv[i + 1];
      i += 2;
    } else {
      flags[arg.slice(2)] = true;
      i += 1;
    }
  }
  return { name: positional[0], flags };
}

/**
 * Walks up from a directory to find the da-nx root.
 * @param {string} start - Directory to start from.
 * @returns {string|null} The root, or null.
 */
function findRoot(start) {
  if (existsSync(join(start, 'nx/blocks/loc'))) return start;
  const parent = dirname(start);
  return parent === start ? null : findRoot(parent);
}

/**
 * Reads a file if it exists.
 * @param {string} path - File path.
 * @returns {string|null} The text, or null.
 */
function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * Extracts the body of a named function by paren/brace matching.
 * @param {string} src - Source text.
 * @param {string} fnName - Function name.
 * @returns {string|null} The body text, or null if not found.
 */
function functionBody(src, fnName) {
  const match = new RegExp(`function\\s+${fnName}\\s*\\(`).exec(src);
  if (!match) return null;
  const scan = (start, open, close) => {
    let depth = 0;
    for (let i = start; i < src.length; i += 1) {
      if (src[i] === open) depth += 1;
      if (src[i] === close) {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  };
  const parenStart = match.index + match[0].length - 1;
  const parenEnd = scan(parenStart, '(', ')');
  if (parenEnd < 0) return null;
  const braceStart = src.indexOf('{', parenEnd);
  const braceEnd = scan(braceStart, '{', '}');
  return braceEnd < 0 ? null : src.slice(braceStart, braceEnd + 1);
}

/**
 * Lists every export name in a module (declarations, lists, re-exports).
 * @param {string} src - Source text.
 * @returns {Set<string>} Exported names.
 */
function exportedNames(src) {
  const names = new Set();
  [...src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/g)]
    .forEach((m) => names.add(m[1]));
  [...src.matchAll(/export\s*\{([^}]*)\}/g)].forEach((m) => {
    m[1].split(',').map((part) => part.trim()).filter(Boolean).forEach((part) => {
      names.add(part.split(/\s+as\s+/).pop().trim());
    });
  });
  return names;
}

/**
 * Finds function declarations that lack a JSDoc block immediately above.
 * @param {string} src - Source text.
 * @returns {string[]} Names of functions missing JSDoc.
 */
function functionsMissingJsdoc(src) {
  const lines = src.split('\n');
  return lines.flatMap((line, i) => {
    const m = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/.exec(line);
    if (!m) return [];
    const prev = lines.slice(0, i).reverse().find((l) => l.trim() !== '');
    return prev?.trim().endsWith('*/') ? [] : [m[1]];
  });
}

/**
 * Lists connector source files.
 * @param {string} dir - Connector directory.
 * @returns {{file: string, src: string}[]} Files and contents.
 */
function connectorFiles(dir) {
  return readdirSync(dir)
    .filter((file) => /\.(js|mjs)$/.test(file))
    .map((file) => ({ file, src: readFileSync(join(dir, file), 'utf8') }));
}

/**
 * Runs the da-nx connector checks.
 * @param {string} root - da-nx root.
 * @param {string} name - Connector directory name.
 * @returns {void}
 */
function checkDaNx(root, name) {
  const scope = 'da-nx';
  const dir = join(root, 'nx/blocks/loc/connectors', name);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    record('FAIL', scope, `Directory name "${name}" must be lowercase with hyphens (service name lowercased, spaces to "-")`);
  }
  const indexSrc = read(join(dir, 'index.js'));
  if (!indexSrc) {
    record('FAIL', scope, `Missing ${dir}/index.js`);
    return;
  }
  const files = connectorFiles(dir);
  const all = files.map((f) => f.src).join('\n');

  const exported = exportedNames(indexSrc);
  REQUIRED_EXPORTS.forEach((exp) => {
    if (exported.has(exp)) record('PASS', scope, `exports ${exp}`);
    else record('FAIL', scope, `index.js does not export ${exp}`);
  });
  if (exported.has('dnt') && !/dnt\s*=\s*\{[^}]*addDnt/.test(indexSrc)) {
    record('FAIL', scope, 'dnt export must be { addDnt } from ../../dnt/dnt.js');
  }

  const placeholders = all.match(/TODO\(vendor\)|__name__|__Vendor__|__UPSTREAM_ORIGIN__/g);
  if (placeholders) record('FAIL', scope, `${placeholders.length} unresolved template placeholder/TODO(vendor) marker(s)`);

  if (/['"`]canceled['"`]/.test(all)) record('FAIL', scope, "Uses 'canceled' (one l); the host terminal status is 'cancelled'");
  if (/localStorage/.test(all)) record('FAIL', scope, 'Uses localStorage; use sessionStorage through utils/auth.js');
  if (/translation\.status\s*=\s*['"]complete['"]/.test(all)) record('WARN', scope, "Sets status 'complete'; the host sets it after saveItems");
  if (/window\.[A-Za-z_]+\s*=[^=]/.test(all)) record('WARN', scope, 'Assigns a custom property on window');
  if (/\bnew Queue\(/.test(all)) record('WARN', scope, 'Constructs its own Queue; use utils/downloadQueue.js');

  if (!/utils\/fetchWithRetry\.js/.test(all)) record('WARN', scope, 'Does not import utils/fetchWithRetry.js (429/5xx backoff is required)');
  if (!/utils\/downloadQueue\.js/.test(all)) record('WARN', scope, 'Does not import utils/downloadQueue.js (max five concurrent downloads)');
  if (!/DA_TRANSLATE/.test(all)) record('WARN', scope, 'No DA_TRANSLATE proxy use; new connectors proxy every call');
  if (/fetch\(\s*[`'"]https?:\/\//.test(all)) record('WARN', scope, 'fetch() to a literal https URL; route through the proxy');
  if (/['"]Authorization['"]\s*:/.test(all) && /DA_TRANSLATE/.test(all)) {
    record('WARN', scope, 'Sets an Authorization header on proxied calls; it is reserved for the IMS token (use x-<name>-authorization)');
  }
  if (/'en-US'/.test(all)) record('WARN', scope, "Hardcoded 'en-US'; use options['source.language'].code");
  if (!/\.\s*value\b/.test(all)) record('WARN', scope, 'Never reads a persisted { value }; confirm state is read as service.<key>?.value');

  const send = functionBody(indexSrc, 'sendAllLanguages');
  if (send) {
    if (/setTimeout|while\s*\(|for\s*\(\s*let\s+attempt/.test(send)) record('WARN', scope, 'sendAllLanguages appears to poll; set status "created" and let getStatusAll poll');
    if (!/saveState/.test(send)) record('WARN', scope, 'sendAllLanguages never calls saveState; ids will not survive a reload');
    if (!/type:\s*['"]error['"]/.test(send)) record('WARN', scope, "sendAllLanguages never reports sendMessage({ type: 'error' })");
    if (!/isConnected/.test(send)) record('WARN', scope, 'sendAllLanguages does not check isConnected');
    if (!/'created'/.test(send)) record('WARN', scope, "sendAllLanguages never sets status 'created'");
  }
  const status = functionBody(indexSrc, 'getStatusAll');
  const skipsTerminal = /complete/.test(status || '') && /cancelled/.test(status || '');
  const hasTerminalList = /\[\s*'complete'\s*,\s*'cancelled'\s*\]/.test(all);
  if (status && !skipsTerminal && !hasTerminalList) {
    record('WARN', scope, "getStatusAll does not skip 'complete' and 'cancelled' languages");
  }
  const save = functionBody(indexSrc, 'saveItems');
  if (save) {
    if (!/saveFn\(/.test(save)) record('FAIL', scope, 'saveItems never calls saveFn');
    if (!/removeDnt/.test(all)) record('WARN', scope, 'removeDnt is not used before saving translated content');
    if (!/downloadQueue/.test(save)) record('WARN', scope, 'saveItems does not use downloadQueue');
  }
  const cancel = functionBody(indexSrc, 'cancelTranslation');
  if (cancel && !/cancelled/.test(cancel)) record('WARN', scope, "cancelTranslation never sets 'cancelled'");
  if (/translation\.(status|sent|translated)\s*=/.test(all) && !/translation\s*\?\?=/.test(all)) {
    record('WARN', scope, 'Writes lang.translation.* without lang.translation ??= {}');
  }

  files.forEach(({ file, src }) => {
    const missing = functionsMissingJsdoc(src);
    if (missing.length) record('WARN', scope, `${file}: functions without JSDoc: ${missing.join(', ')}`);
  });

  const testPath = join(root, 'test/loc/connectors', name, 'index.test.js');
  const testSrc = read(testPath) || read(join(root, 'test/loc', name, 'index.test.js'));
  if (!testSrc) {
    record('FAIL', scope, `Missing ${testPath}`);
  } else {
    const count = (testSrc.match(/\bit\(/g) || []).length;
    record(count >= 8 ? 'PASS' : 'WARN', scope, `${count} test cases (expect at least 8 covering the contract)`);
    const bigBatch = /(?:length:\s*|makeUrls\(\s*)([6-9]|\d{2,})\b/.test(testSrc);
    if (!bigBatch) record('WARN', scope, 'No test with six or more urls (concurrency cap)');
    if (!/page|skip|offset|cursor|next/i.test(testSrc)) record('WARN', scope, 'No test that appears to cover pagination');
    if (!/error/.test(testSrc)) record('WARN', scope, 'No test that appears to cover error paths');
  }
}

/**
 * Runs the da-translate checks.
 * @param {string} dir - da-translate checkout.
 * @param {string} name - Service name.
 * @returns {void}
 */
function checkTranslate(dir, name) {
  const scope = 'da-translate';
  const svc = read(join(dir, 'src/services', `${name}.js`));
  if (!svc) {
    record('FAIL', scope, `Missing src/services/${name}.js`);
    return;
  }
  const post = read(join(dir, 'src/handlers/postHandler.js')) || '';
  if (new RegExp(`startsWith\\(\\s*['"]/${name}/?['"]`).test(post)) record('PASS', scope, 'routed in postHandler');
  else record('FAIL', scope, `postHandler has no routeToService entry for /${name}/`);

  const ims = /needsImsAuth\s*=\s*\[([^\]]*)\]/.exec(post);
  if (ims && ims[1].includes(`'${name}'`)) record('PASS', scope, 'listed in needsImsAuth');
  else record('FAIL', scope, `'${name}' missing from needsImsAuth; the route would skip IMS auth`);

  if (!/buildForwardHeaders/.test(svc)) record('FAIL', scope, 'Does not use buildForwardHeaders (header allowlist)');
  if (/headers:\s*req\.headers\b/.test(svc)) record('FAIL', scope, 'Forwards req.headers wholesale (leaks IMS Authorization/cookies upstream)');
  if (!/AbortSignal\.timeout/.test(svc)) record('FAIL', scope, 'No upstream timeout (AbortSignal.timeout)');
  if (!/isTimeoutError/.test(svc)) record('WARN', scope, 'Timeouts are not mapped to a 504');
  if (/console\.[a-z]+\([^)]*\b(url|search)\b/.test(svc)) record('WARN', scope, 'Logs a URL or search string; keyed URLs must never be logged');
  if (/(x-[a-z]+-origin)/.test(svc) && !/ALLOWED_ORIGINS/.test(svc)) record('FAIL', scope, 'Accepts a caller-supplied origin without an allowlist (open proxy)');
  if (/TODO\(vendor\)|__name__|__Vendor__/.test(svc)) record('FAIL', scope, 'Unresolved template placeholders');
  if (!existsSync(join(dir, 'test/services', `${name}.test.js`))) record('FAIL', scope, `Missing test/services/${name}.test.js`);
}

/**
 * Runs the da-etc checks.
 * @param {string} dir - da-etc checkout.
 * @param {string} name - Integration name.
 * @returns {void}
 */
function checkEtc(dir, name) {
  const scope = 'da-etc';
  const ints = read(join(dir, 'src/routes/ints.js'));
  if (!ints) {
    record('FAIL', scope, 'Missing src/routes/ints.js');
    return;
  }
  const fetchers = /TOKEN_FETCHERS\s*=\s*\{([^}]*)\}/.exec(ints);
  if (fetchers && new RegExp(`\\b${name}\\s*:`).test(fetchers[1])) record('PASS', scope, 'registered in TOKEN_FETCHERS');
  else record('FAIL', scope, `'${name}' not registered in TOKEN_FETCHERS`);

  const staticKey = /STATIC_KEY_SERVICES\s*=\s*new Set\(\[([^\]]*)\]/.exec(ints);
  const isStatic = !!staticKey && staticKey[1].includes(`'${name}'`);
  record('PASS', scope, isStatic
    ? 'static-key service (browser can only call boolean /status)'
    : 'token-exchange service (not in STATIC_KEY_SERVICES; /status is intentionally unavailable)');

  if (/TODO\(vendor\)|__name__|__Vendor__/.test(ints)) record('FAIL', scope, 'Unresolved template placeholders');
  if (!existsSync(join(dir, 'test/routes', `${name}.test.js`))) record('WARN', scope, `No test/routes/${name}.test.js`);
  const readme = read(join(dir, 'README.md')) || '';
  if (!new RegExp(name, 'i').test(readme)) record('WARN', scope, 'README does not mention the service');
}

/**
 * Entry point.
 * @returns {void}
 */
function main() {
  const { name, flags } = parseArgs(process.argv.slice(2));
  if (!name) {
    console.error('Usage: check-connector.mjs <name> [--root <da-nx>] [--translate <dir>] [--etc <dir>] [--json]');
    process.exit(2);
  }
  const root = flags.root ? resolve(flags.root) : findRoot(process.cwd());
  if (!root) {
    console.error('Could not find the da-nx root (no nx/blocks/loc). Pass --root.');
    process.exit(2);
  }

  checkDaNx(root, name);
  if (flags.translate) checkTranslate(resolve(flags.translate), name);
  else record('WARN', 'da-translate', 'Skipped (pass --translate <dir>)');
  if (flags.etc) checkEtc(resolve(flags.etc), name);
  else record('WARN', 'da-etc', 'Skipped (pass --etc <dir>)');

  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  results.forEach((r) => { counts[r.level] += 1; });

  if (flags.json) {
    console.log(JSON.stringify({ name, counts, results }, null, 2));
  } else {
    results.forEach((r) => console.log(`${r.level.padEnd(4)} [${r.scope}] ${r.message}`));
    console.log(`\n${counts.PASS} pass, ${counts.WARN} warn, ${counts.FAIL} fail`);
  }
  process.exit(counts.FAIL ? 1 : 0);
}

main();
