import { expect } from '@esm-bundle/chai';
import {
  parseFrontmatter,
  validateSkillFrontmatter,
  ensureSkillFrontmatter,
} from '../../../utils/skill-frontmatter.js';

// ─── parseFrontmatter ─────────────────────────────────────────────────────────

describe('parseFrontmatter()', () => {
  it('returns null when no frontmatter block is present', () => {
    expect(parseFrontmatter('# Just a heading\n\nBody.')).to.be.null;
  });

  it('returns null when the opening --- is not at the start', () => {
    expect(parseFrontmatter('Some text\n---\nname: foo\n---\n')).to.be.null;
  });

  it('returns null when there is no closing ---', () => {
    expect(parseFrontmatter('---\nname: foo\n')).to.be.null;
  });

  it('parses a minimal valid frontmatter block', () => {
    const md = '---\nname: my-skill\ndescription: Does things.\nstatus: approved\n---\n\n# Body';
    const result = parseFrontmatter(md);
    expect(result).to.not.be.null;
    expect(result.fields.name).to.equal('my-skill');
    expect(result.fields.description).to.equal('Does things.');
    expect(result.fields.status).to.equal('approved');
  });

  it('trims the body text', () => {
    const md = '---\nname: foo\ndescription: bar\n---\n\n\n# Heading\n\nBody.';
    const result = parseFrontmatter(md);
    expect(result.body).to.match(/^# Heading/);
  });

  it('handles values containing colons (e.g. URLs)', () => {
    const md = '---\nname: my-skill\ndescription: See https://example.com for details.\n---\n\nBody';
    const result = parseFrontmatter(md);
    expect(result.fields.description).to.equal('See https://example.com for details.');
  });

  it('returns empty string for fields with no value', () => {
    const md = '---\nname: my-skill\ndescription: \n---\n\nBody';
    const result = parseFrontmatter(md);
    expect(result.fields.description).to.equal('');
  });

  it('handles leading whitespace before the opening ---', () => {
    const md = '   ---\nname: my-skill\ndescription: ok\n---\n\nBody';
    const result = parseFrontmatter(md);
    expect(result).to.not.be.null;
    expect(result.fields.name).to.equal('my-skill');
  });

  it('returns null for null/undefined input', () => {
    expect(parseFrontmatter(null)).to.be.null;
    expect(parseFrontmatter(undefined)).to.be.null;
  });
});

// ─── validateSkillFrontmatter ─────────────────────────────────────────────────

describe('validateSkillFrontmatter()', () => {
  it('returns no errors for a valid frontmatter object', () => {
    const errors = validateSkillFrontmatter({ name: 'my-skill', description: 'Does useful things.' });
    expect(errors).to.deep.equal([]);
  });

  it('errors when name is missing', () => {
    const errors = validateSkillFrontmatter({ description: 'ok' });
    expect(errors).to.have.length.greaterThan(0);
    expect(errors[0]).to.include('"name"');
  });

  it('errors when description is missing', () => {
    const errors = validateSkillFrontmatter({ name: 'my-skill' });
    expect(errors.some((e) => e.includes('"description"'))).to.be.true;
  });

  it('errors when description is empty string', () => {
    const errors = validateSkillFrontmatter({ name: 'my-skill', description: '' });
    expect(errors.some((e) => e.includes('"description"'))).to.be.true;
  });

  it('errors when name exceeds 64 characters', () => {
    const longName = 'a'.repeat(65);
    const errors = validateSkillFrontmatter({ name: longName, description: 'ok' });
    expect(errors.some((e) => e.includes('exceeds'))).to.be.true;
  });

  it('accepts name exactly 64 characters', () => {
    const name = 'a'.repeat(64);
    const errors = validateSkillFrontmatter({ name, description: 'ok' });
    expect(errors.filter((e) => e.includes('exceeds'))).to.have.length(0);
  });

  it('errors when name contains uppercase letters', () => {
    const errors = validateSkillFrontmatter({ name: 'My-Skill', description: 'ok' });
    expect(errors.some((e) => e.includes('lowercase'))).to.be.true;
  });

  it('errors when name contains spaces', () => {
    const errors = validateSkillFrontmatter({ name: 'my skill', description: 'ok' });
    expect(errors.some((e) => e.includes('lowercase'))).to.be.true;
  });

  it('accepts names with numbers', () => {
    const errors = validateSkillFrontmatter({ name: 'skill-v2', description: 'ok' });
    expect(errors).to.deep.equal([]);
  });

  it('errors when name contains XML tags', () => {
    const errors = validateSkillFrontmatter({ name: 'my-<b>skill</b>', description: 'ok' });
    expect(errors.some((e) => e.includes('XML'))).to.be.true;
  });

  it('errors when name contains reserved word "anthropic"', () => {
    const errors = validateSkillFrontmatter({ name: 'anthropic-helper', description: 'ok' });
    expect(errors.some((e) => e.includes('"anthropic"'))).to.be.true;
  });

  it('errors when name contains reserved word "claude"', () => {
    const errors = validateSkillFrontmatter({ name: 'claude-tools', description: 'ok' });
    expect(errors.some((e) => e.includes('"claude"'))).to.be.true;
  });

  it('reserved word check is case-insensitive', () => {
    const errors = validateSkillFrontmatter({ name: 'Claude-tools', description: 'ok' });
    // name format error fires first; reserved word should also appear
    expect(errors.some((e) => e.includes('"claude"'))).to.be.true;
  });

  it('errors when description exceeds 1024 characters', () => {
    const longDesc = 'x'.repeat(1025);
    const errors = validateSkillFrontmatter({ name: 'my-skill', description: longDesc });
    expect(errors.some((e) => e.includes('exceeds'))).to.be.true;
  });

  it('accepts description exactly 1024 characters', () => {
    const desc = 'x'.repeat(1024);
    const errors = validateSkillFrontmatter({ name: 'my-skill', description: desc });
    expect(errors).to.deep.equal([]);
  });

  it('errors when description contains XML tags', () => {
    const errors = validateSkillFrontmatter({ name: 'my-skill', description: 'Use <b>this</b> skill.' });
    expect(errors.some((e) => e.includes('XML'))).to.be.true;
  });

  it('reports multiple errors at once', () => {
    const errors = validateSkillFrontmatter({});
    expect(errors.length).to.be.greaterThan(1);
  });
});

// ─── ensureSkillFrontmatter ───────────────────────────────────────────────────

describe('ensureSkillFrontmatter()', () => {
  it('injects frontmatter when none is present', () => {
    const { markdown, injected } = ensureSkillFrontmatter('# My Skill\n\nBody.', 'my-skill', 'approved');
    expect(injected).to.be.true;
    expect(markdown).to.include('---\nname: my-skill\n');
    expect(markdown).to.include('status: approved');
    expect(markdown).to.include('# My Skill');
  });

  it('uses the skill ID directly as the name value', () => {
    const { markdown } = ensureSkillFrontmatter('Body.', 'brand-voice', 'draft');
    const parsed = parseFrontmatter(markdown);
    expect(parsed.fields.name).to.equal('brand-voice');
  });

  it('does not double-inject if frontmatter is already present', () => {
    const md = '---\nname: my-skill\ndescription: ok\nstatus: approved\n---\n\n# Body';
    const { markdown, injected } = ensureSkillFrontmatter(md, 'my-skill', 'approved');
    expect(injected).to.be.false;
    expect(markdown).to.equal(md);
  });

  it('returns injected: false and warnings for existing invalid frontmatter', () => {
    const md = '---\nname: \ndescription: \n---\n\n# Body';
    const { injected, warnings } = ensureSkillFrontmatter(md, 'my-skill', 'approved');
    expect(injected).to.be.false;
    expect(warnings.length).to.be.greaterThan(0);
  });

  it('returns injected: false and no warnings for valid existing frontmatter', () => {
    const md = '---\nname: my-skill\ndescription: Does things well.\nstatus: approved\n---\n\n# Body';
    const { injected, warnings } = ensureSkillFrontmatter(md, 'my-skill', 'approved');
    expect(injected).to.be.false;
    expect(warnings).to.deep.equal([]);
  });

  it('preserves existing body content after injection', () => {
    const body = '# Brand Voice\n\nUse when reviewing copy.';
    const { markdown } = ensureSkillFrontmatter(body, 'brand-voice', 'approved');
    expect(markdown).to.include(body);
  });

  it('handles null/undefined markdown gracefully', () => {
    const { markdown, injected } = ensureSkillFrontmatter(null, 'my-skill', 'approved');
    expect(injected).to.be.true;
    expect(markdown).to.include('name: my-skill');
  });
});
