import { expect } from '@esm-bundle/chai';
import { readFileAsBase64, buildAttachmentItems } from '../../../../../nx2/blocks/shared/chat/files.js';

function makeFile(content, name, type) {
  return new File([content], name, { type });
}

class FailingFileReader {
  readAsDataURL() {
    queueMicrotask(() => this.onerror?.());
  }
}

describe('readFileAsBase64', () => {
  it('resolves with the base64 payload, stripped of the data-url prefix', async () => {
    const base64 = await readFileAsBase64(makeFile('hello', 'a.txt', 'text/plain'));
    expect(atob(base64)).to.equal('hello');
  });

  it('rejects when the underlying FileReader errors', async () => {
    const origFileReader = window.FileReader;
    window.FileReader = FailingFileReader;
    try {
      let error;
      try {
        await readFileAsBase64(makeFile('x', 'a.txt'));
      } catch (e) {
        error = e;
      }
      expect(error).to.be.an('error');
    } finally {
      window.FileReader = origFileReader;
    }
  });
});

describe('buildAttachmentItems', () => {
  it('returns [] for an empty file list', async () => {
    expect(await buildAttachmentItems([])).to.deep.equal([]);
  });

  it('caps to maxFiles, keeping only the first ones', async () => {
    const files = [makeFile('a', 'a.txt'), makeFile('b', 'b.txt'), makeFile('c', 'c.txt')];

    const items = await buildAttachmentItems(files, { maxFiles: 2 });

    expect(items.map((i) => i.fileName)).to.deep.equal(['a.txt', 'b.txt']);
  });

  it('reduces the available slots by currentCount', async () => {
    const files = [makeFile('a', 'a.txt'), makeFile('b', 'b.txt')];

    const items = await buildAttachmentItems(files, { maxFiles: 3, currentCount: 2 });

    expect(items.map((i) => i.fileName)).to.deep.equal(['a.txt']);
  });

  it('returns [] when currentCount already meets or exceeds maxFiles', async () => {
    const files = [makeFile('a', 'a.txt')];

    expect(await buildAttachmentItems(files, { maxFiles: 2, currentCount: 2 })).to.deep.equal([]);
  });

  it('skips a file over maxFileSize rather than throwing', async () => {
    const files = [makeFile('small', 'small.txt'), makeFile('this-one-is-too-big', 'big.txt')];

    const items = await buildAttachmentItems(files, { maxFileSize: 6 });

    expect(items.map((i) => i.fileName)).to.deep.equal(['small.txt']);
  });

  it('silently drops a file that fails to read, rather than rejecting the whole batch', async () => {
    const origFileReader = window.FileReader;
    window.FileReader = FailingFileReader;
    try {
      const files = [makeFile('a', 'a.txt')];
      expect(await buildAttachmentItems(files)).to.deep.equal([]);
    } finally {
      window.FileReader = origFileReader;
    }
  });

  it('shapes an image file with a thumbnail and type "image"', async () => {
    const [item] = await buildAttachmentItems([makeFile('img', 'pic.png', 'image/png')]);

    expect(item.type).to.equal('image');
    expect(item.mediaType).to.equal('image/png');
    expect(item.thumbnail).to.be.a('string');
  });

  it('shapes a non-image file with type "file" and no thumbnail', async () => {
    const [item] = await buildAttachmentItems([makeFile('hello', 'a.txt', 'text/plain')]);

    expect(item.type).to.equal('file');
    expect(item).to.not.have.property('thumbnail');
  });
});
