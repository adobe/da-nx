/**
 * Client-side Figma `.fig` handling for EW chat.
 *
 * A `.fig` is a ZIP whose bulk (~99%) is the `images/` folder (embedded
 * bitmaps). The design itself — layout, text, tokens — lives in `canvas.fig`
 * (~100KB) plus `thumbnail.png`. So instead of uploading tens of MB, we strip
 * the file down to `{canvas.fig, thumbnail.png, meta.json}` (~190KB) in the
 * browser, parse that via the fig-inspector worker, and hand the recovered
 * content to the agent inline. Nothing large ever leaves the browser.
 */

const FIG_INSPECTOR_URL = 'https://fig-inspector.franklin-prod.workers.dev';

// ZIP record signatures (little-endian).
const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

// The only entries the parser needs; everything else (notably images/) is dropped.
const KEEP = ['canvas.fig', 'thumbnail.png', 'meta.json'];

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
 * POST the (stripped) `.fig` bytes to the fig-inspector worker and return the
 * parsed inspection JSON: `{ file_name, meta, thumbnail_base64, images, text }`.
 * @param {Uint8Array} bytes
 */
export async function parseStrippedFig(bytes) {
  const resp = await fetch(`${FIG_INSPECTOR_URL}/inspect`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: bytes,
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`fig-inspector responded ${resp.status}${detail ? `: ${detail}` : ''}`);
  }
  return resp.json();
}

/**
 * Build a compact, readable block for the agent from the parsed inspection.
 * Note: `text` mixes real page copy with design-system scaffolding (font names,
 * `--sds-*` tokens, Spectrum icon ids) — we pass it through as-is; the
 * figma-to-landing-page skill filters it.
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
  const unique = [];
  runs.forEach((t) => {
    const s = String(t ?? '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    unique.push(s);
  });

  const CAP = 8000;
  let body = unique.join('\n');
  if (body.length > CAP) body = `${body.slice(0, CAP)}\n…(truncated)`;

  lines.push(
    '',
    'Recovered text (may include design tokens / font names — ignore scaffolding):',
    body,
  );
  return lines.join('\n');
}
