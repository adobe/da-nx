import { expect } from '@esm-bundle/chai';
import { buildAttachmentPayload, buildSlashMessage } from '../../../../nx2/blocks/chat/utils/chat-helpers.js';

// Build a minimal chat-like object with just enough state to exercise
// the _onSlashSelect orchestration (menu close, sendMessage call, items reset).
function makeChat(items = []) {
  const calls = [];
  const chat = {
    _items: items,
    _slashCtx: { wordStart: 0 },
    _slashMenuEl: { close() {} },
    shadowRoot: {
      querySelector(sel) {
        if (sel === '.chat-input') return { value: '/writeBlog', selectionStart: 10 };
        return null;
      },
    },
    _controller: {
      sendMessage(...args) { calls.push(args); },
    },
  };

  chat._onSlashSelect = function onSlashSelect(skillId) {
    const input = this.shadowRoot?.querySelector('.chat-input');
    const { wordStart } = this._slashCtx ?? {};
    const message = buildSlashMessage(input?.value ?? '', input?.selectionStart ?? 0, wordStart, skillId);
    this._slashCtx = null;
    this._slashMenuEl?.close();
    if (input) input.value = '';
    const localItems = this._items ?? [];
    const fileItems = localItems.filter((item) => item.dataBase64);
    const contextItems = localItems.filter((item) => !item.dataBase64);
    const attachments = buildAttachmentPayload(localItems);
    fileItems.forEach((item) => { if (item.thumbnail) URL.revokeObjectURL(item.thumbnail); });
    const opts = { requestedSkills: [skillId], ...(attachments.length ? { attachments } : {}) };
    this._controller.sendMessage(message, contextItems, opts);
    this._items = [];
  };

  return { chat, calls };
}

describe('buildAttachmentPayload', () => {
  it('returns only items that have dataBase64', () => {
    const items = [
      { id: '1', fileName: 'a.png', mediaType: 'image/png', sizeBytes: 100, dataBase64: 'abc' },
      { id: '2', label: 'context', type: 'selection' },
    ];
    const result = buildAttachmentPayload(items);
    expect(result).to.have.lengthOf(1);
    expect(result[0].id).to.equal('1');
  });

  it('omits sizeBytes when it is not a number', () => {
    const items = [{ id: '1', fileName: 'a.png', mediaType: 'image/png', sizeBytes: undefined, dataBase64: 'abc' }];
    const result = buildAttachmentPayload(items);
    expect(result[0]).to.not.have.property('sizeBytes');
  });

  it('includes sizeBytes when it is a number', () => {
    const items = [{ id: '1', fileName: 'a.png', mediaType: 'image/png', sizeBytes: 42, dataBase64: 'abc' }];
    const result = buildAttachmentPayload(items);
    expect(result[0].sizeBytes).to.equal(42);
  });
});

describe('buildSlashMessage', () => {
  it('replaces the slash word with the skill id', () => {
    const result = buildSlashMessage('/writeBlog', 10, 0, 'writeBlog');
    expect(result).to.equal('/writeBlog');
  });

  it('preserves text before the word start', () => {
    const result = buildSlashMessage('hello /write', 12, 6, 'writeBlog');
    expect(result).to.equal('hello /writeBlog');
  });

  it('preserves text after the cursor', () => {
    const result = buildSlashMessage('/write world', 6, 0, 'writeBlog');
    expect(result).to.equal('/writeBlog world');
  });
});

describe('NxChat _onSlashSelect', () => {
  it('passes attachments and requestedSkills when file items are pending', () => {
    const fileItem = {
      id: 'f1',
      fileName: 'photo.jpg',
      mediaType: 'image/jpeg',
      sizeBytes: 500,
      dataBase64: 'base64data',
      type: 'image',
    };
    const { chat, calls } = makeChat([fileItem]);

    chat._onSlashSelect('writeBlog');

    expect(calls).to.have.lengthOf(1);
    const [, , opts] = calls[0];
    expect(opts.requestedSkills).to.deep.equal(['writeBlog']);
    expect(opts.attachments).to.have.lengthOf(1);
    expect(opts.attachments[0].id).to.equal('f1');
    expect(opts.attachments[0].dataBase64).to.equal('base64data');
  });

  it('does not include attachments key when no file items are pending', () => {
    const contextItem = { id: 'c1', label: 'paragraph', type: 'selection' };
    const { chat, calls } = makeChat([contextItem]);

    chat._onSlashSelect('writeBlog');

    const [, , opts] = calls[0];
    expect(opts.requestedSkills).to.deep.equal(['writeBlog']);
    expect(opts).to.not.have.property('attachments');
  });

  it('passes context items (no dataBase64) as the second argument', () => {
    const contextItem = { id: 'c1', label: 'paragraph', type: 'selection' };
    const fileItem = { id: 'f1', fileName: 'doc.pdf', mediaType: 'application/pdf', dataBase64: 'pdfdata', type: 'file' };
    const { chat, calls } = makeChat([contextItem, fileItem]);

    chat._onSlashSelect('summarize');

    const [, contextItems] = calls[0];
    expect(contextItems).to.have.lengthOf(1);
    expect(contextItems[0].id).to.equal('c1');
  });

  it('clears _items after sendMessage is called', () => {
    const fileItem = { id: 'f1', fileName: 'a.png', mediaType: 'image/png', dataBase64: 'abc', type: 'image' };
    const { chat } = makeChat([fileItem]);

    chat._onSlashSelect('writeBlog');

    expect(chat._items).to.deep.equal([]);
  });

  it('clears _items even if there were no file items', () => {
    const contextItem = { id: 'c1', label: 'paragraph', type: 'selection' };
    const { chat } = makeChat([contextItem]);

    chat._onSlashSelect('writeBlog');

    expect(chat._items).to.deep.equal([]);
  });
});
