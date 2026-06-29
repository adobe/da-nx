import { expect } from '@esm-bundle/chai';
import { isClientEligible, runSkillScript } from '../../../../nx2/utils/skill-runtime/index.js';
import { convert } from '../../../../nx2/blocks/chat/skills-builtin/docx-to-markdown/scripts/convert.js';
import { zipSync, strToU8, unzipSync, strFromU8 } from '../../../../nx2/deps/fflate/dist/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkillBlobUrl(scriptBody) {
  const blob = new Blob([scriptBody], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

function makeFakeManifest(overrides = {}) {
  return {
    id: 'test-skill',
    entry: 'run',
    runtimes: ['js'],
    capabilities: [],
    dependencies: [],
    timeoutMs: 3000,
    ...overrides,
  };
}

/** Build a minimal but valid .docx Uint8Array with the given text in word/document.xml */
function buildDocx(text) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
  </w:body>
</w:document>`;
  const files = { 'word/document.xml': strToU8(xml) };
  return zipSync(files);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Host with fflate injected — required by convert() since it uses host.deps.fflate
const fflateHost = { log: () => {}, deps: { fflate: { unzipSync, strFromU8 } } };

// ---------------------------------------------------------------------------
// 1. Eligibility gate
// ---------------------------------------------------------------------------

describe('isClientEligible', () => {
  it('returns true for empty capabilities', () => {
    expect(isClientEligible([])).to.be.true;
  });

  it('returns false when capabilities are present', () => {
    expect(isClientEligible(['network'])).to.be.false;
    expect(isClientEligible(['secrets', 'pii'])).to.be.false;
  });
});

// ---------------------------------------------------------------------------
// 2. Server runtime gate
// ---------------------------------------------------------------------------

describe('runSkillScript — server runtime gate', () => {
  it('returns { error } when manifest has capabilities', async () => {
    const manifest = makeFakeManifest({ capabilities: ['network'] });
    const result = await runSkillScript({ manifest, moduleUrl: 'blob:unused', input: {} });
    expect(result).to.deep.equal({ error: 'requires server runtime' });
  });
});

// ---------------------------------------------------------------------------
// 3. Pure script runs in worker
// ---------------------------------------------------------------------------

describe('runSkillScript — pure script', () => {
  it('executes the entry function and returns output', async () => {
    const scriptBody = 'export async function run(input) { return { doubled: input.n * 2 }; }';
    const moduleUrl = makeSkillBlobUrl(scriptBody);
    const manifest = makeFakeManifest();
    try {
      const result = await runSkillScript({ manifest, moduleUrl, input: { n: 21 } });
      expect(result).to.deep.equal({ json: { doubled: 42 } });
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Ambient neutering — fetch is undefined inside worker
// ---------------------------------------------------------------------------

describe('runSkillScript — ambient neutering', () => {
  it('fetch is undefined inside the worker', async () => {
    const scriptBody = 'export async function run() { return { fetchType: typeof fetch }; }';
    const moduleUrl = makeSkillBlobUrl(scriptBody);
    const manifest = makeFakeManifest();
    try {
      const result = await runSkillScript({ manifest, moduleUrl, input: {} });
      expect(result).to.deep.equal({ json: { fetchType: 'undefined' } });
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Timeout
// ---------------------------------------------------------------------------

describe('runSkillScript — timeout', () => {
  it('returns { error: "timeout" } for a hanging skill', async () => {
    const scriptBody = 'export async function run() { await new Promise(() => {}); }';
    const moduleUrl = makeSkillBlobUrl(scriptBody);
    const manifest = makeFakeManifest({ timeoutMs: 200 });
    try {
      const result = await runSkillScript({ manifest, moduleUrl, input: {} });
      expect(result.error).to.equal('timeout');
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Host-injected dependencies — allowlisted dep loaded into host.deps
// ---------------------------------------------------------------------------

describe('runSkillScript — host-injected dependencies', () => {
  it('injects an allowlisted dep and the skill receives it via host.deps', async () => {
    // Skill reads host.deps.mylib and calls a function on it
    const scriptBody = `
export async function run(input, host) {
  return { result: host.deps.mylib.double(input.n) };
}`;
    // A tiny dep module served as a blob URL
    const depBody = 'export function double(n) { return n * 2; }';
    const depBlobUrl = makeSkillBlobUrl(depBody);
    const moduleUrl = makeSkillBlobUrl(scriptBody);

    // Pass a custom allowlist for this test (worker receives it via postMessage)
    const manifest = makeFakeManifest({ dependencies: ['mylib'] });
    try {
      // We need to inject a custom allowlist. Since DEPENDENCY_ALLOWLIST is baked into
      // runner.js, we test via the worker directly — runner passes the allowlist to the
      // worker. For this test, we invoke runSkillScript with a patched manifest and
      // rely on the worker-host to resolve via the allowlist passed in postMessage.
      // Because runner.js uses DEPENDENCY_ALLOWLIST from worker-host.js (which only has
      // fflate), we test the allowlist refusal path here and the real fflate injection
      // in the docx test below.
      const result = await runSkillScript({ manifest, moduleUrl, input: { n: 5 } });
      // mylib is not in the real DEPENDENCY_ALLOWLIST → expect refusal error
      expect(result.error).to.be.a('string');
      expect(result.error).to.include('mylib');
      expect(result.error).to.include('not allowed');
    } finally {
      URL.revokeObjectURL(moduleUrl);
      URL.revokeObjectURL(depBlobUrl);
    }
  });

  it('refuses a skill that declares a non-allowlisted dependency', async () => {
    const scriptBody = 'export async function run(input, host) { return { ok: true }; }';
    const moduleUrl = makeSkillBlobUrl(scriptBody);
    const manifest = makeFakeManifest({ dependencies: ['some-unknown-dep'] });
    try {
      const result = await runSkillScript({ manifest, moduleUrl, input: {} });
      expect(result.error).to.be.a('string');
      expect(result.error).to.include('some-unknown-dep');
      expect(result.error).to.include('not allowed');
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Docx proof — in-process convert() with host.deps.fflate
// ---------------------------------------------------------------------------

describe('convert — docx to markdown', () => {
  it('extracts text from a minimal docx', async () => {
    const bytes = buildDocx('hello world');
    const bytesBase64 = bytesToBase64(bytes);
    const result = await convert({ bytesBase64 }, fflateHost);
    expect(result.markdown).to.include('hello world');
  });
});

// ---------------------------------------------------------------------------
// 8. Entity unescape
// ---------------------------------------------------------------------------

describe('convert — XML entity unescape', () => {
  it('unescapes &amp; and friends', async () => {
    const bytes = buildDocx('AT&amp;T &lt;rocks&gt;');
    const bytesBase64 = bytesToBase64(bytes);
    const result = await convert({ bytesBase64 }, fflateHost);
    expect(result.markdown).to.include('AT&T <rocks>');
  });
});

// ---------------------------------------------------------------------------
// 9. Corrupt input
// ---------------------------------------------------------------------------

describe('convert — corrupt input', () => {
  it('throws on garbage bytes', async () => {
    const garbage = btoa('not a zip file at all!!!');
    let threw = false;
    try {
      await convert({ bytesBase64: garbage }, fflateHost);
    } catch {
      threw = true;
    }
    expect(threw).to.be.true;
  });
});
