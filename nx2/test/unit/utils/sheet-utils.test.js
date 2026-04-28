import { expect } from '@esm-bundle/chai';
import { normaliseRowKey, parseSheetBoolean } from '../../../utils/sheet-utils.js';

// ─── normaliseRowKey ──────────────────────────────────────────────────────────

describe('normaliseRowKey()', () => {
  it('returns the key field when present', () => {
    expect(normaliseRowKey({ key: 'my-skill' })).to.equal('my-skill');
  });

  it('falls back to the id field when key is absent', () => {
    expect(normaliseRowKey({ id: 'my-skill' })).to.equal('my-skill');
  });

  it('returns empty string when both key and id are absent', () => {
    expect(normaliseRowKey({})).to.equal('');
    expect(normaliseRowKey(null)).to.equal('');
    expect(normaliseRowKey(undefined)).to.equal('');
  });

  it('strips a trailing .md extension', () => {
    expect(normaliseRowKey({ key: 'my-skill.md' })).to.equal('my-skill');
  });

  it('strips .md extension case-insensitively', () => {
    expect(normaliseRowKey({ key: 'my-skill.MD' })).to.equal('my-skill');
  });

  it('trims surrounding whitespace', () => {
    expect(normaliseRowKey({ key: '  my-skill  ' })).to.equal('my-skill');
  });

  it('prefers key over id when both are present', () => {
    expect(normaliseRowKey({ key: 'by-key', id: 'by-id' })).to.equal('by-key');
  });
});

// ─── parseSheetBoolean ────────────────────────────────────────────────────────

describe('parseSheetBoolean()', () => {
  it('returns true JS booleans as-is', () => {
    expect(parseSheetBoolean(true)).to.equal(true);
    expect(parseSheetBoolean(false)).to.equal(false);
  });

  it('parses truthy string values', () => {
    expect(parseSheetBoolean('true')).to.equal(true);
    expect(parseSheetBoolean('1')).to.equal(true);
    expect(parseSheetBoolean('yes')).to.equal(true);
  });

  it('parses falsy string values', () => {
    expect(parseSheetBoolean('false')).to.equal(false);
    expect(parseSheetBoolean('0')).to.equal(false);
    expect(parseSheetBoolean('no')).to.equal(false);
  });

  it('is case-insensitive for string values', () => {
    expect(parseSheetBoolean('TRUE')).to.equal(true);
    expect(parseSheetBoolean('False')).to.equal(false);
    expect(parseSheetBoolean('YES')).to.equal(true);
    expect(parseSheetBoolean('NO')).to.equal(false);
  });

  it('trims whitespace from string values', () => {
    expect(parseSheetBoolean('  true  ')).to.equal(true);
    expect(parseSheetBoolean('  false  ')).to.equal(false);
  });

  it('returns undefined fallback for unrecognised strings', () => {
    expect(parseSheetBoolean('maybe')).to.be.undefined;
    expect(parseSheetBoolean('')).to.be.undefined;
  });

  it('returns a custom fallback for unrecognised values', () => {
    expect(parseSheetBoolean('maybe', true)).to.equal(true);
    expect(parseSheetBoolean(null, false)).to.equal(false);
  });

  it('returns fallback for non-string, non-boolean inputs', () => {
    expect(parseSheetBoolean(null)).to.be.undefined;
    expect(parseSheetBoolean(undefined)).to.be.undefined;
    expect(parseSheetBoolean(42)).to.be.undefined;
  });
});
