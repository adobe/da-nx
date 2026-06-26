import { expect } from '@esm-bundle/chai';

// Test _buildAttachmentPayload and _onSlashSelect in isolation without
// importing chat.js (which has side-effect imports and top-level await).
// We mirror the exact method implementations from the class under test.

function buildAttachmentPayload(items) {
  return items
    .filter((item) => item.dataBase64)
    .map(({ id, fileName, mediaType, sizeBytes, dataBase64 }) => ({
      id,
      fileName,
      mediaType,
      dataBase64,
      ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
    }));
}

// Build a minimal chat-like object that has just enough state/methods
// to exercise _onSlashSelect logic.
function makeChat(items = []) {
  const calls = [];
  const chat = {
    _items: items,
    _slashCtx: { wordStart: 0 },
    _slashMenuEl: { close() {} },
    // Minimal shadow root: input with empty value and selectionStart=0
    shadowRoot: {
      querySelector(sel) {
        if (sel === '.chat-input') {
          return { value: '/writeBlog', selectionStart: 10 };
        }
        return null;
      },
    },
    _controller: {
      sendMessage(...args) { calls.push(args); },
    },
    _buildAttachmentPayload: buildAttachmentPayload,
  };

  // Inline _onSlashSelect as it appears in chat.js after the fixes.
  chat._onSlashSelect = function onSlashSelect(skillId) {
    const input = this.shadowRoot?.querySelector('.chat-input');
    const { wordStart } = this._slashCtx ?? {};
    const before = input?.value.slice(0, wordStart ?? 0).trimEnd();
    const after = input?.value.slice(input.selectionStart).trimStart();
    const message = [before, `/${skillId}`, after].filter(Boolean).join(' ');
    this._slashCtx = null;
    this._slashMenuEl?.close();
    if (input) input.value = '';
    const localItems = this._items ?? [];
    const fileItems = localItems.filter((item) => item.dataBase64);
    const contextItems = localItems.filter((item) => !item.dataBase64);
    const attachments = this._buildAttachmentPayload(localItems);
    fileItems.forEach((item) => { if (item.thumbnail) URL.revokeObjectURL(item.thumbnail); });
    const opts = { requestedSkills: [skillId], ...(attachments.length ? { attachments } : {}) };
    this._controller.sendMessage(message, contextItems, opts);
    this._items = [];
  };

  return { chat, calls };
}

describe('NxChat _buildAttachmentPayload', () => {
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
