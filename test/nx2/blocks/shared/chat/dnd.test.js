import { expect } from '@esm-bundle/chai';
import { createFileDropHandlers } from '../../../../../nx2/blocks/shared/chat/dnd.js';

function makeEvent({ currentTarget, relatedTarget, files } = {}) {
  const calls = [];
  return {
    currentTarget,
    relatedTarget,
    dataTransfer: files ? { files } : undefined,
    preventDefault: () => calls.push('preventDefault'),
    calls,
  };
}

describe('createFileDropHandlers', () => {
  it('onDragEnter prevents default and reports dragging', () => {
    const dragging = [];
    const { onDragEnter } = createFileDropHandlers({
      onDragging: (v) => dragging.push(v),
      onFiles: () => {},
    });
    const e = makeEvent();

    onDragEnter(e);

    expect(e.calls).to.deep.equal(['preventDefault']);
    expect(dragging).to.deep.equal([true]);
  });

  it('onDragOver only prevents default', () => {
    const { onDragOver } = createFileDropHandlers({ onDragging: () => {}, onFiles: () => {} });
    const e = makeEvent();

    onDragOver(e);

    expect(e.calls).to.deep.equal(['preventDefault']);
  });

  it('onDragLeave reports not-dragging when leaving the container entirely', () => {
    const parent = document.createElement('div');
    const dragging = [];
    const { onDragLeave } = createFileDropHandlers({
      onDragging: (v) => dragging.push(v),
      onFiles: () => {},
    });

    onDragLeave(makeEvent({ currentTarget: parent, relatedTarget: null }));

    expect(dragging).to.deep.equal([false]);
  });

  it('onDragLeave is a no-op when moving to a child of the container', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.append(child);
    const dragging = [];
    const { onDragLeave } = createFileDropHandlers({
      onDragging: (v) => dragging.push(v),
      onFiles: () => {},
    });

    onDragLeave(makeEvent({ currentTarget: parent, relatedTarget: child }));

    expect(dragging).to.have.length(0);
  });

  it('onDrop is a no-op when the drop carries no files', async () => {
    const files = [];
    const { onDrop } = createFileDropHandlers({ onDragging: () => {}, onFiles: () => files.push('called') });

    await onDrop(makeEvent({ files: [] }));

    expect(files).to.have.length(0);
  });

  it('onDrop reports not-dragging and forwards all files when isAllowed is absent', async () => {
    const dragging = [];
    const received = [];
    const { onDrop } = createFileDropHandlers({
      onDragging: (v) => dragging.push(v),
      onFiles: (accepted) => received.push(accepted),
    });
    const dropped = [{ name: 'a.png' }, { name: 'b.txt' }];

    await onDrop(makeEvent({ files: dropped }));

    expect(dragging).to.deep.equal([false]);
    expect(received).to.deep.equal([dropped]);
  });

  it('onDrop filters dropped files through isAllowed before forwarding', async () => {
    const received = [];
    const { onDrop } = createFileDropHandlers({
      isAllowed: (f) => f.type === 'image/png',
      onDragging: () => {},
      onFiles: (accepted) => received.push(accepted),
    });
    const dropped = [{ name: 'a.png', type: 'image/png' }, { name: 'b.txt', type: 'text/plain' }];

    await onDrop(makeEvent({ files: dropped }));

    expect(received).to.deep.equal([[dropped[0]]]);
  });
});
