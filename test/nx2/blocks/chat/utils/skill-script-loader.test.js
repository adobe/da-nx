import { expect } from '@esm-bundle/chai';
import { parseSkillFrontmatter, resolveSkill } from '../../../../../nx2/blocks/chat/utils/skill-script-loader.js';

// ---------------------------------------------------------------------------
// parseSkillFrontmatter
// ---------------------------------------------------------------------------

describe('parseSkillFrontmatter', () => {
  it('parses a complete flat execution_* block', () => {
    const text = `---
name: docx-to-markdown
description: Convert .docx to markdown
version: 1
execution_entry: convert
execution_runtimes: js
execution_capabilities: network,secrets
execution_timeout_ms: 8000
---
body here
`;
    const manifest = parseSkillFrontmatter(text);
    expect(manifest).to.deep.equal({
      entry: 'convert',
      runtimes: ['js'],
      capabilities: ['network', 'secrets'],
      dependencies: [],
      timeoutMs: 8000,
    });
  });

  it('returns empty capabilities array when execution_capabilities is absent', () => {
    const text = `---
execution_entry: convert
execution_runtimes: js
execution_timeout_ms: 5000
---
`;
    const { capabilities } = parseSkillFrontmatter(text);
    expect(capabilities).to.deep.equal([]);
  });

  it('returns empty capabilities array when execution_capabilities value is blank', () => {
    const text = `---
execution_entry: convert
execution_runtimes: js
execution_capabilities:
execution_timeout_ms: 5000
---
`;
    const { capabilities } = parseSkillFrontmatter(text);
    expect(capabilities).to.deep.equal([]);
  });

  it('parses execution_dependencies into dependencies array', () => {
    const text = `---
execution_entry: convert
execution_runtimes: js
execution_capabilities:
execution_dependencies: fflate
execution_timeout_ms: 5000
---
`;
    const { dependencies } = parseSkillFrontmatter(text);
    expect(dependencies).to.deep.equal(['fflate']);
  });

  it('parses multiple comma-separated execution_dependencies', () => {
    const text = `---
execution_entry: run
execution_runtimes: js
execution_capabilities:
execution_dependencies: fflate, marked
---
`;
    const { dependencies } = parseSkillFrontmatter(text);
    expect(dependencies).to.deep.equal(['fflate', 'marked']);
  });

  it('returns empty dependencies array when execution_dependencies is absent', () => {
    const text = `---
execution_entry: convert
execution_runtimes: js
execution_capabilities:
---
`;
    const { dependencies } = parseSkillFrontmatter(text);
    expect(dependencies).to.deep.equal([]);
  });

  it('returns empty dependencies array when execution_dependencies value is blank', () => {
    const text = `---
execution_entry: convert
execution_runtimes: js
execution_capabilities:
execution_dependencies:
---
`;
    const { dependencies } = parseSkillFrontmatter(text);
    expect(dependencies).to.deep.equal([]);
  });

  it('defaults timeoutMs to 5000 when execution_timeout_ms absent', () => {
    const text = `---
execution_entry: run
execution_runtimes: js
execution_capabilities:
---
`;
    const { timeoutMs } = parseSkillFrontmatter(text);
    expect(timeoutMs).to.equal(5000);
  });

  it('returns null when there is no frontmatter', () => {
    expect(parseSkillFrontmatter('no frontmatter here')).to.be.null;
  });

  it('returns null when execution_entry is missing', () => {
    const text = `---
name: incomplete
execution_runtimes: js
---
`;
    expect(parseSkillFrontmatter(text)).to.be.null;
  });

  it('parses multiple comma-separated runtimes', () => {
    const text = `---
execution_entry: run
execution_runtimes: js, py
execution_capabilities:
---
`;
    const { runtimes } = parseSkillFrontmatter(text);
    expect(runtimes).to.deep.equal(['js', 'py']);
  });
});

// ---------------------------------------------------------------------------
// resolveSkill — GH marketplace resolution
// ---------------------------------------------------------------------------

describe('resolveSkill', () => {
  const GH_RAW_BASE = 'https://raw.githubusercontent.com/exp-workspace/skills/main/ew';

  // Stub global fetch for these tests
  let origFetch;
  before(() => { origFetch = globalThis.fetch; });
  after(() => { globalThis.fetch = origFetch; });

  function mockFetch({ skillMdText, skillMdOk = true, skillMdStatus = 200, scriptText = 'export function convert() {}', scriptOk = true, scriptStatus = 200 } = {}) {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('skill.md')) {
        return { ok: skillMdOk, status: skillMdStatus, text: async () => skillMdText ?? '' };
      }
      if (u.includes('/scripts/')) {
        return { ok: scriptOk, status: scriptStatus, text: async () => scriptText };
      }
      return { ok: false, status: 404, text: async () => '' };
    };
  }

  it('resolves manifest and a blob moduleUrl from GH marketplace', async () => {
    const skillMd = `---
execution_entry: convert
execution_runtimes: js
execution_capabilities:
execution_timeout_ms: 5000
---
body
`;
    mockFetch({ skillMdText: skillMd });
    const result = await resolveSkill('docx-to-markdown');
    expect(result.error).to.be.undefined;
    expect(result.manifest.entry).to.equal('convert');
    expect(result.manifest.capabilities).to.deep.equal([]);
    // moduleUrl must be a blob URL (text/javascript), NOT a raw GitHub URL
    expect(result.moduleUrl).to.match(/^blob:/);
    // Revoke to avoid leak
    URL.revokeObjectURL(result.moduleUrl);
  });

  it('fetches skill.md from GH marketplace and script from scripts/<entry>.js', async () => {
    const skillMd = `---
execution_entry: convert
execution_runtimes: js
execution_capabilities:
---
`;
    const fetchedUrls = [];
    globalThis.fetch = async (url) => {
      fetchedUrls.push(String(url));
      return { ok: true, status: 200, text: async () => skillMd };
    };
    const result = await resolveSkill('docx-to-markdown');
    expect(fetchedUrls[0]).to.equal(`${GH_RAW_BASE}/docx-to-markdown/skill.md`);
    expect(fetchedUrls[1]).to.equal(`${GH_RAW_BASE}/docx-to-markdown/scripts/convert.js`);
    if (result.moduleUrl) URL.revokeObjectURL(result.moduleUrl);
  });

  it('includes the skillId in the manifest', async () => {
    const skillMd = `---
execution_entry: run
execution_runtimes: js
execution_capabilities:
---
`;
    mockFetch({ skillMdText: skillMd });
    const result = await resolveSkill('my-skill');
    expect(result.manifest.id).to.equal('my-skill');
    if (result.moduleUrl) URL.revokeObjectURL(result.moduleUrl);
  });

  it('includes dependencies in the manifest', async () => {
    const skillMd = `---
execution_entry: convert
execution_runtimes: js
execution_capabilities:
execution_dependencies: fflate
---
`;
    mockFetch({ skillMdText: skillMd });
    const result = await resolveSkill('docx-to-markdown');
    expect(result.manifest.dependencies).to.deep.equal(['fflate']);
    if (result.moduleUrl) URL.revokeObjectURL(result.moduleUrl);
  });

  it('returns an error when skill.md is not found (404)', async () => {
    mockFetch({ skillMdOk: false, skillMdStatus: 404 });
    const result = await resolveSkill('missing-skill');
    expect(result.error).to.be.a('string');
    expect(result.error).to.include('missing-skill');
  });

  it('returns an error when the script is not found (404)', async () => {
    const skillMd = `---
execution_entry: convert
execution_runtimes: js
execution_capabilities:
---
`;
    mockFetch({ skillMdText: skillMd, scriptOk: false, scriptStatus: 404 });
    const result = await resolveSkill('partial-skill');
    expect(result.error).to.be.a('string');
    expect(result.error).to.include('partial-skill');
  });

  it('returns an error when skillId is absent', async () => {
    const result = await resolveSkill('');
    expect(result.error).to.be.a('string');
  });

  it('returns an error for ao: prefixed marketplace skills (not yet supported)', async () => {
    const result = await resolveSkill('ao:some-skill');
    expect(result.error).to.be.a('string');
  });

  it('does not need org/site — resolveSkill takes only skillId', async () => {
    const skillMd = `---
execution_entry: run
execution_runtimes: js
execution_capabilities:
---
`;
    mockFetch({ skillMdText: skillMd });
    // No second argument — must not error on missing org/site
    const result = await resolveSkill('any-skill');
    expect(result.error).to.be.undefined;
    if (result.moduleUrl) URL.revokeObjectURL(result.moduleUrl);
  });
});
