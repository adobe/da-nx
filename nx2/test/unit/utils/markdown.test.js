import { expect } from '@esm-bundle/chai';
import { extractTitle, extractToolRefs } from '../../../utils/markdown.js';

// ─── extractTitle ─────────────────────────────────────────────────────────────

describe('extractTitle()', () => {
  it('returns the text of the first h1 heading', () => {
    expect(extractTitle('# Fix Typos\n\nSome body')).to.equal('Fix Typos');
  });

  it('returns empty string when there is no h1', () => {
    expect(extractTitle('## Section heading\nno h1 here')).to.equal('');
  });

  it('returns empty string for empty input', () => {
    expect(extractTitle('')).to.equal('');
  });

  it('returns empty string for null/undefined', () => {
    expect(extractTitle(null)).to.equal('');
    expect(extractTitle(undefined)).to.equal('');
  });

  it('trims whitespace from the heading text', () => {
    expect(extractTitle('#   Trimmed Title  ')).to.equal('Trimmed Title');
  });

  it('ignores headings that are not h1 (## or ###)', () => {
    expect(extractTitle('## Not An H1\n\n### Also Not')).to.equal('');
  });

  it('finds the h1 even when it is not on the first line', () => {
    expect(extractTitle('Some intro text\n\n# Real Heading\n\nBody')).to.equal('Real Heading');
  });

  it('does not match # inside a word (e.g. colour #fff)', () => {
    expect(extractTitle('colour is #fff')).to.equal('');
  });
});

// ─── extractToolRefs ──────────────────────────────────────────────────────────

describe('extractToolRefs()', () => {
  it('returns empty array for empty input', () => {
    expect(extractToolRefs('')).to.deep.equal([]);
    expect(extractToolRefs(null)).to.deep.equal([]);
  });

  it('extracts an mcp tool reference', () => {
    const refs = extractToolRefs('Use mcp__da-tools__content_read to read the file.');
    expect(refs).to.include('mcp__da-tools__content_read');
  });

  it('extracts a built-in da_ tool reference', () => {
    const refs = extractToolRefs('Call da_create_skill when saving.');
    expect(refs).to.include('da_create_skill');
  });

  it('extracts multiple references from the same string', () => {
    const refs = extractToolRefs('Use da_get_skill and mcp__eds-preview__content_preview.');
    expect(refs).to.include('da_get_skill');
    expect(refs).to.include('mcp__eds-preview__content_preview');
  });

  it('deduplicates repeated references', () => {
    const refs = extractToolRefs('da_create_skill, da_create_skill, da_create_skill');
    expect(refs.filter((r) => r === 'da_create_skill')).to.have.length(1);
  });

  it('does not match partial da_ names (e.g. da_incomplete without underscore suffix)', () => {
    const refs = extractToolRefs('Use da_ alone or da_.');
    expect(refs).to.deep.equal([]);
  });

  it('handles tool names with hyphens and underscores in the server and tool parts', () => {
    const refs = extractToolRefs('mcp__my-server-123__my_tool_name');
    expect(refs).to.include('mcp__my-server-123__my_tool_name');
  });

  it('returns references in order of first appearance', () => {
    const refs = extractToolRefs('da_get_skill then da_create_skill');
    expect(refs[0]).to.equal('da_get_skill');
    expect(refs[1]).to.equal('da_create_skill');
  });
});
