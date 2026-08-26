/**
 * Client-side Figma `.fig` handling for the AO chat.
 *
 * A `.fig` is a ZIP whose bulk (~99%) is the `images/` folder (embedded
 * bitmaps). The design itself — layout, text, tokens — lives in `canvas.fig`
 * (~100KB) plus `thumbnail.png`. So instead of uploading tens of MB, we strip
 * the file down to `{canvas.fig, thumbnail.png, meta.json}` (~190KB) in the
 * browser, parse that via the fig-inspector worker, and hand the recovered
 * content to the agent inline. Nothing large ever leaves the browser.
 */

import { daFetch } from '../../../utils/api.js';
import { DA_ADMIN } from '../../../utils/utils.js';

// ZIP record signatures (little-endian).
const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

// The only entries the parser needs; everything else (notably images/) is dropped.
const KEEP = ['canvas.fig', 'thumbnail.png', 'meta.json'];
const FIG_PARSE_WORKER_URL = new URL('./fig-strip.worker.js', import.meta.url);

let figParseWorkerPromise;
let figParseRequestId = 0;
const figParsePending = new Map();

// A cross-origin Worker script is blocked outright (no CORS opt-in, unlike a
// plain cross-origin `import`) — da-nx's code is served from a different
// origin (aem.live/aem.page) than the page (da.live). Fetch the script as
// text and construct the Worker from a same-origin blob: URL instead.
async function getFigParseWorker() {
  if (!figParseWorkerPromise) {
    figParseWorkerPromise = (async () => {
      const src = await (await fetch(FIG_PARSE_WORKER_URL)).text();
      const blobUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const worker = new Worker(blobUrl, { type: 'module' });
      worker.addEventListener('message', ({ data }) => {
        const pending = figParsePending.get(data?.id);
        if (!pending) return;
        figParsePending.delete(data.id);
        if (data.ok) pending.resolve(data.result);
        else {
          const detail = data.error?.stack || data.error?.message || 'Failed to parse .fig file';
          pending.reject(new Error(detail));
        }
      });
      worker.addEventListener('error', (error) => {
        figParsePending.forEach(({ reject }) => reject(error));
        figParsePending.clear();
        worker.terminate();
        figParseWorkerPromise = undefined;
      });
      return worker;
    })();
  }
  return figParseWorkerPromise;
}

function concatBytes(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((c) => {
    out.set(c, offset);
    offset += c.length;
  });
  return out;
}

/**
 * Return a new ZIP (Uint8Array) containing only the KEEP entries, copied from
 * the source without recompressing. We rebuild each local header from the
 * central-directory record (canonical, no extra field, no data descriptor) so
 * we don't depend on the source's local extra fields or streaming flags.
 *
 * @param {ArrayBuffer} arrayBuffer raw `.fig` bytes
 * @returns {Uint8Array} stripped `.fig`
 */
export function stripFig(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  // Locate the End Of Central Directory record (scan back from the end; the
  // 22-byte record can be followed by a comment, so search for the signature).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a .fig file (no ZIP end-of-central-directory record)');

  const cdCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  const localChunks = [];
  const centralMeta = [];
  let newLocalOffset = 0;
  let cursor = cdOffset;

  for (let n = 0; n < cdCount; n += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIG) {
      throw new Error('Corrupt .fig (bad central-directory signature)');
    }
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compSize = view.getUint32(cursor + 20, true);
    const uncompSize = view.getUint32(cursor + 24, true);
    const fnameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameBytes = buf.subarray(cursor + 46, cursor + 46 + fnameLen);
    const name = new TextDecoder().decode(nameBytes);
    const nextCursor = cursor + 46 + fnameLen + extraLen + commentLen;

    if (KEEP.indexOf(name) !== -1) {
      if (view.getUint32(localOffset, true) !== LOCAL_SIG) {
        throw new Error(`Corrupt .fig (bad local header for ${name})`);
      }
      // The local header's own name/extra lengths locate the compressed data.
      const localFnameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localFnameLen + localExtraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);

      // Canonical local header (flags 0, no extra, no data descriptor).
      const header = new Uint8Array(30 + fnameLen);
      const hv = new DataView(header.buffer);
      hv.setUint32(0, LOCAL_SIG, true);
      hv.setUint16(4, 20, true); // version needed
      hv.setUint16(6, 0, true); // flags
      hv.setUint16(8, method, true);
      hv.setUint16(10, 0, true); // mod time
      hv.setUint16(12, 0, true); // mod date
      hv.setUint32(14, crc, true);
      hv.setUint32(18, compSize, true);
      hv.setUint32(22, uncompSize, true);
      hv.setUint16(26, fnameLen, true);
      hv.setUint16(28, 0, true); // extra len
      header.set(nameBytes, 30);

      localChunks.push(header, data);
      centralMeta.push({
        method, crc, compSize, uncompSize, nameBytes, fnameLen, offset: newLocalOffset,
      });
      newLocalOffset += header.length + data.length;
    }
    cursor = nextCursor;
  }

  if (!centralMeta.some((e) => new TextDecoder().decode(e.nameBytes) === 'canvas.fig')) {
    throw new Error('Not a valid .fig (canvas.fig not found)');
  }

  // Rebuild the central directory pointing at the new local offsets.
  const centralChunks = [];
  let cdSize = 0;
  centralMeta.forEach((e) => {
    const rec = new Uint8Array(46 + e.fnameLen);
    const rv = new DataView(rec.buffer);
    rv.setUint32(0, CENTRAL_SIG, true);
    rv.setUint16(4, 20, true); // version made by
    rv.setUint16(6, 20, true); // version needed
    rv.setUint16(8, 0, true); // flags
    rv.setUint16(10, e.method, true);
    rv.setUint16(12, 0, true); // mod time
    rv.setUint16(14, 0, true); // mod date
    rv.setUint32(16, e.crc, true);
    rv.setUint32(20, e.compSize, true);
    rv.setUint32(24, e.uncompSize, true);
    rv.setUint16(28, e.fnameLen, true);
    rv.setUint16(30, 0, true); // extra len
    rv.setUint16(32, 0, true); // comment len
    rv.setUint16(34, 0, true); // disk number
    rv.setUint16(36, 0, true); // internal attrs
    rv.setUint32(38, 0, true); // external attrs
    rv.setUint32(42, e.offset, true);
    rec.set(e.nameBytes, 46);
    centralChunks.push(rec);
    cdSize += rec.length;
  });

  const cdStart = newLocalOffset;
  const eocdRec = new Uint8Array(22);
  const ev = new DataView(eocdRec.buffer);
  ev.setUint32(0, EOCD_SIG, true);
  ev.setUint16(8, centralMeta.length, true); // records on this disk
  ev.setUint16(10, centralMeta.length, true); // total records
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);

  return concatBytes(localChunks.concat(centralChunks, [eocdRec]));
}

/**
 * Parse `.fig` bytes in a dedicated worker and return the parsed inspection
 * JSON: `{ file_name, meta, thumbnail_base64, images:[{hash,layer_name,width,
 * height,mime}], text }`. Send the FULL file when you need the image list/dims —
 * the images metadata is only present when the parser sees the `images/` entries.
 * @param {Uint8Array} bytes
 */
export async function parseFig(bytes) {
  const worker = await getFigParseWorker();
  figParseRequestId += 1;
  const id = figParseRequestId;
  const transfer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  return new Promise((resolve, reject) => {
    figParsePending.set(id, { resolve, reject });
    worker.postMessage({
      id,
      bytes: transfer,
      baseUrl: import.meta.url,
    }, [transfer]);
  });
}

// The flat text extractor is greedy: alongside real UI copy it emits design-
// system scaffolding (font postscript names, `--sds-*`/Spectrum tokens, layer
// names like "Vector 108") and binary runs mis-read as text. Keep only strings
// that read like human copy, so we don't ship gibberish (and blow the WS frame).
function isLikelyHumanText(raw) {
  const s = String(raw ?? '').trim();
  if (s.length < 2 || s.length > 300) return false;

  // Structural / token characters that don't appear in page copy.
  if (/[<>{}|/\\%?^~`=#@*+_()[\]]/.test(s)) return false;
  if (/^[).(]/.test(s)) return false;

  // Design-system scaffolding.
  if (/^var\(|--sds-|^#[0-9a-fA-F]{3,8}$/.test(s)) return false; // css vars / hex
  if (/^S2?[._]/.test(s)) return false; // S2.Color-theme, S2_Icon_...
  if (/[A-Za-z]-(Bold|Regular|Italic|Light|Medium|Semibold|SemiBold|Extrabold|ExtraBold|Black|Thin)\b/.test(s)) return false; // font postscript ids
  if (/^(Ellipse|Vector|Rectangle|Line|Group|Frame|Icon|Mask|Union|Path|Asset|image|Component|Slice|Layer|Polygon|Star|Arrow)\b/i.test(s)) return false; // layer names

  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (letters / s.length < 0.6) return false; // too many symbols/digits
  if (!/[aeiouAEIOU]/.test(s)) return false; // no vowel → not a word
  if (!/[a-z]/.test(s) && s.length > 4) return false; // all-caps run → likely noise

  // Single tokens (no spaces) are where most id-like noise lives.
  if (!/\s/.test(s)) {
    if (/\d/.test(s) && s.length > 8) return false; // random id token
    if (/[a-z][A-Z]/.test(s)) return false; // internal lower→upper, e.g. HuO, fID
    if (!/[a-z]/.test(s) && s.length >= 3) return false; // short all-caps, e.g. XUU, BUU
  }

  return true;
}

/**
 * Build a compact, DE-NOISED block for the agent: file name, canvas background,
 * and the human-readable copy only, hard-capped so it can never bloat the frame.
 */
export function summarizeFigForAgent(parsed) {
  const name = parsed?.file_name || 'Figma design';
  const lines = [`[Parsed Figma design: ${name}]`];

  const bg = parsed?.meta?.client_meta?.background_color;
  if (bg && typeof bg === 'object') {
    const to255 = (v) => Math.round((Number(v) || 0) * 255);
    lines.push(`Canvas background: rgb(${to255(bg.r)}, ${to255(bg.g)}, ${to255(bg.b)})`);
  }

  const runs = Array.isArray(parsed?.text) ? parsed.text : [];
  const seen = new Set();
  const copy = [];
  runs.forEach((run) => {
    const s = String(run ?? '').trim();
    if (isLikelyHumanText(s) && !seen.has(s)) {
      seen.add(s);
      copy.push(s);
    }
  });

  const MAX_LINES = 120;
  const MAX_CHARS = 4000;
  let body = copy.slice(0, MAX_LINES).join('\n');
  if (body.length > MAX_CHARS) body = `${body.slice(0, MAX_CHARS)}\n…(truncated)`;

  lines.push('', 'Recovered copy (headings, body, labels):', body);
  return lines.join('\n');
}

async function inflateRaw(bytes) {
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Extract the embedded images from a full `.fig` (ZIP), client-side. Returns
 * `[{ hash, bytes }]` for each `images/<hash>` entry — decompressing deflate
 * entries (most image entries are stored, i.e. already-compressed pixels).
 * @param {ArrayBuffer} arrayBuffer full `.fig`
 */
export async function extractFigImages(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const cdCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  let cursor = cdOffset;
  const found = [];

  for (let n = 0; n < cdCount; n += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIG) break;
    const method = view.getUint16(cursor + 10, true);
    const compSize = view.getUint32(cursor + 20, true);
    const fnameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(buf.subarray(cursor + 46, cursor + 46 + fnameLen));
    cursor = cursor + 46 + fnameLen + extraLen + commentLen;

    if (name.startsWith('images/') && !name.endsWith('/') && view.getUint32(localOffset, true) === LOCAL_SIG) {
      const lFnameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lFnameLen + lExtraLen;
      found.push({
        hash: name.slice('images/'.length),
        method,
        comp: buf.subarray(dataStart, dataStart + compSize),
      });
    }
  }

  return Promise.all(found.map(async ({ hash, method, comp }) => ({
    hash,
    bytes: method === 8 ? await inflateRaw(comp) : comp,
  })));
}

function mimeToExt(mime) {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'png';
}

/**
 * Upload extracted images to DA under `.figma-assets/<slug>/` and return a
 * `{ <hash>: contentUrl }` map. `images` items are `{ hash, bytes, mime }`.
 */
export async function uploadFigImages(images, {
  org, site, slug, onProgress,
}) {
  const urlByHash = {};
  await Promise.all(images.map(async ({ hash, bytes, mime }) => {
    const path = `/${org}/${site}/.figma-assets/${slug}/${hash}.${mimeToExt(mime)}`;
    try {
      const form = new FormData();
      form.append('data', new Blob([bytes], { type: mime || 'image/png' }));
      const resp = await daFetch({ url: `${DA_ADMIN}/source${path}`, opts: { method: 'PUT', body: form } });
      if (resp.ok) {
        const json = await resp.json().catch(() => null);
        if (json?.source?.contentUrl) urlByHash[hash] = json.source.contentUrl;
      }
    } catch { /* skip this image; others still upload */ }
    if (onProgress) onProgress();
  }));
  return urlByHash;
}

/**
 * Build the `[Images available]` block the skill places by name: one line per
 * uploaded image as `- <layer_name|hash>: <url> (<W>x<H>)`.
 */
export function buildImagesBlock(parsedImages, urlByHash) {
  const withUrl = (parsedImages || []).filter((im) => urlByHash[im.hash]);
  const hasGeometry = withUrl.some((im) => im.bbox || im.section);

  const lines = withUrl.map((im) => {
    const label = im.layer_name || im.hash.slice(0, 8);
    const dims = im.width && im.height ? ` (${im.width}x${im.height})` : '';
    const section = im.section ? ` — section: "${im.section}"` : '';
    const bbox = im.bbox ? ` — position: x${Math.round(im.bbox.x)},y${Math.round(im.bbox.y)}` : '';
    const order = typeof im.order === 'number' ? ` — order: ${im.order}` : '';
    return `- ${label}: ${urlByHash[im.hash]}${dims}${section}${bbox}${order}`;
  });
  if (!lines.length) return '';

  const header = hasGeometry
    ? '[Images available] (place using section/position — this is real design geometry, not a guess):'
    : '[Images available] (no position data — place by name/shape):';
  return [header, ...lines].join('\n');
}
