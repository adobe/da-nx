import { expect } from '@esm-bundle/chai';
import {
  WRAPPER_FREE_TYPES,
  isWrapperFreeType,
  decomposeBlockNode,
  composeBlockNode,
  toWrapperPos,
  blockSizeFromContentSize,
} from '../../../../../nx/public/plugins/quick-edit/src/inline-projection.js';

describe('quick-edit inline-projection helpers', () => {
  it('marks paragraph and heading as wrapper-free', () => {
    expect(isWrapperFreeType('paragraph')).to.equal(true);
    expect(isWrapperFreeType('heading')).to.equal(true);
    expect(WRAPPER_FREE_TYPES.has('heading')).to.equal(true);
  });

  it('does not mark structural blocks as wrapper-free', () => {
    ['bullet_list', 'ordered_list', 'table', 'blockquote', 'code_block'].forEach((t) => {
      expect(isWrapperFreeType(t), t).to.equal(false);
    });
    expect(isWrapperFreeType(undefined)).to.equal(false);
  });

  it('decomposes a block node into type/attrs/content', () => {
    const block = {
      type: 'heading',
      attrs: { level: 2, id: 'intro' },
      content: [{ type: 'text', text: 'Hello' }],
    };
    expect(decomposeBlockNode(block)).to.deep.equal({
      blockType: 'heading',
      blockAttrs: { level: 2, id: 'intro' },
      content: [{ type: 'text', text: 'Hello' }],
    });
  });

  it('decomposes safely when fields or the node are missing', () => {
    expect(decomposeBlockNode({ type: 'paragraph' })).to.deep.equal({
      blockType: 'paragraph', blockAttrs: null, content: [],
    });
    expect(decomposeBlockNode(null)).to.deep.equal({
      blockType: null, blockAttrs: null, content: [],
    });
  });

  it('round-trips decompose -> compose back to the original block node', () => {
    const block = {
      type: 'paragraph',
      attrs: { class: null },
      content: [
        { type: 'text', text: 'a ' },
        { type: 'text', marks: [{ type: 'strong' }], text: 'bold' },
      ],
    };
    const { blockType, blockAttrs, content } = decomposeBlockNode(block);
    expect(composeBlockNode(blockType, blockAttrs, content)).to.deep.equal(block);
  });

  it('omits attrs from a composed node when there are none', () => {
    expect(composeBlockNode('paragraph', null, [{ type: 'text', text: 'x' }]))
      .to.deep.equal({ type: 'paragraph', content: [{ type: 'text', text: 'x' }] });
  });

  it('omits content from a composed node when it is empty (matches PM toJSON)', () => {
    expect(composeBlockNode('paragraph', { class: null }))
      .to.deep.equal({ type: 'paragraph', attrs: { class: null } });
    expect(composeBlockNode('paragraph', { class: null }, []))
      .to.deep.equal({ type: 'paragraph', attrs: { class: null } });
  });

  it('normalizes an inline position to wrapper semantics (+1)', () => {
    // Inline doc caret at start (0) maps to wrapper caret inside the block (1).
    expect(toWrapperPos(0)).to.equal(1);
    expect(toWrapperPos(5)).to.equal(6);
  });

  it('derives block nodeSize from inline content size (+2 for open/close)', () => {
    // "Hello" = 5 inline chars -> paragraph nodeSize 7.
    expect(blockSizeFromContentSize(5)).to.equal(7);
    expect(blockSizeFromContentSize(0)).to.equal(2);
  });
});
