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
// resolveSkill — module URL resolution
// ---------------------------------------------------------------------------

describe('resolveSkill', () => {
  const MOCK_DA_ADMIN = 'https://admin.da.live';

  // Stub global fetch for these tests
  let origFetch;
  before(() => { origFetch = globalThis.fetch; });
  after(() => { globalThis.fetch = origFetch; });

  function mockFetch(text, ok = true, status = 200) {
    globalThis.fetch = async (url) => ({
      ok,
      status,
      text: async () => text,
      url: String(url),
    });
  }

  it('resolves module URL from a valid skill.md', async () => {
    const skillMd = `---
execution_entry: convert
execution_runtimes: js
execution_capabilities:
execution_timeout_ms: 5000
---
body
`;
    mockFetch(skillMd);
    const result = await resolveSkill('docx-to-markdown', { org: 'myorg', site: 'mysite' });
    expect(result.error).to.be.undefined;
    expect(result.manifest.entry).to.equal('convert');
    expect(result.manifest.capabilities).to.deep.equal([]);
    // moduleUrl points to script.js alongside skill.md on DA Admin
    expect(result.moduleUrl).to.include('.da/skills/docx-to-markdown/script.js');
    expect(result.moduleUrl).to.include('myorg');
    expect(result.moduleUrl).to.include('mysite');
  });

  it('includes the skillId in the manifest', async () => {
    const skillMd = `---
execution_entry: run
execution_runtimes: js
execution_capabilities:
---
`;
    mockFetch(skillMd);
    const result = await resolveSkill('my-skill', { org: 'o', site: 's' });
    expect(result.manifest.id).to.equal('my-skill');
  });

  it('returns an error when skill.md is not found (404)', async () => {
    mockFetch('', false, 404);
    const result = await resolveSkill('missing-skill', { org: 'o', site: 's' });
    expect(result.error).to.be.a('string');
    expect(result.error).to.include('missing-skill');
  });

  it('returns an error when skillId is absent', async () => {
    const result = await resolveSkill('', { org: 'o', site: 's' });
    expect(result.error).to.be.a('string');
  });

  it('returns an error when org/site context is missing', async () => {
    const result = await resolveSkill('some-skill', {});
    expect(result.error).to.be.a('string');
  });

  it('returns an error for ao: prefixed marketplace skills (not yet supported)', async () => {
    const result = await resolveSkill('ao:some-skill', { org: 'o', site: 's' });
    expect(result.error).to.be.a('string');
  });
});
