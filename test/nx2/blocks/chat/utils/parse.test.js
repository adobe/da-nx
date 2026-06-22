import { expect } from '@esm-bundle/chai';
import { parseDirectives } from '../../../../../nx2/blocks/chat/utils/parse.js';

describe('parseDirectives', () => {
  describe('plain text', () => {
    it('returns a single text segment for plain text', () => {
      const result = parseDirectives('hello world');
      expect(result).to.deep.equal([{ kind: 'text', content: 'hello world' }]);
    });

    it('returns empty array for empty string', () => {
      expect(parseDirectives('')).to.deep.equal([]);
    });
  });

  describe('single directive', () => {
    it('parses a basic directive', () => {
      const text = ':::checklist\n- [x] Done\n:::';
      expect(parseDirectives(text)).to.deep.equal([
        { kind: 'directive', type: 'checklist', content: '- [x] Done' },
      ]);
    });

    it('parses a hyphenated type', () => {
      const text = ':::alert-error\nSomething failed.\n:::';
      expect(parseDirectives(text)).to.deep.equal([
        { kind: 'directive', type: 'alert-error', content: 'Something failed.' },
      ]);
    });
  });

  describe('mixed content', () => {
    it('handles text before a directive', () => {
      const text = 'Intro text.\n:::list\n- item\n:::';
      const result = parseDirectives(text);
      expect(result).to.deep.equal([
        { kind: 'text', content: 'Intro text.' },
        { kind: 'directive', type: 'list', content: '- item' },
      ]);
    });

    it('handles text after a directive', () => {
      const text = ':::list\n- item\n:::\nTrailing text.';
      const result = parseDirectives(text);
      expect(result).to.deep.equal([
        { kind: 'directive', type: 'list', content: '- item' },
        { kind: 'text', content: 'Trailing text.' },
      ]);
    });

    it('handles multiple directives', () => {
      const text = ':::list\n- a\n:::\n:::checklist\n- [x] b\n:::';
      const result = parseDirectives(text);
      expect(result).to.deep.equal([
        { kind: 'directive', type: 'list', content: '- a' },
        { kind: 'directive', type: 'checklist', content: '- [x] b' },
      ]);
    });
  });

  describe('bare ::: with no type', () => {
    it('treats ::: with no type as plain text', () => {
      expect(parseDirectives(':::')).to.deep.equal([{ kind: 'text', content: ':::' }]);
    });

    it('does not open a directive scope for bare :::', () => {
      const text = ':::\n:::checklist\n- item\n:::';
      const result = parseDirectives(text);
      expect(result).to.deep.equal([
        { kind: 'text', content: ':::' },
        { kind: 'directive', type: 'checklist', content: '- item' },
      ]);
    });
  });

  describe('unclosed directive (streaming)', () => {
    it('renders an unclosed directive as a directive with partial content', () => {
      const text = ':::checklist\n- [x] partial';
      const result = parseDirectives(text);
      expect(result).to.deep.equal([
        { kind: 'directive', type: 'checklist', content: '- [x] partial' },
      ]);
    });

    it('renders completed and unclosed directives in order', () => {
      const text = ':::list\n- done\n:::\n:::checklist\n- partial';
      const result = parseDirectives(text);
      expect(result).to.deep.equal([
        { kind: 'directive', type: 'list', content: '- done' },
        { kind: 'directive', type: 'checklist', content: '- partial' },
      ]);
    });
  });
});
