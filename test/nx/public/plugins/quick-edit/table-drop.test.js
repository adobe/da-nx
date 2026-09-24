import { expect } from '@esm-bundle/chai';
import {
  handleRemoteTableDrag, nearestTableDropAnchor, setupTableDropListeners,
} from '../../../../../nx/public/plugins/quick-edit/src/table-drop.js';

describe('quick-edit HTML drop', () => {
  let main;
  let block;
  let paragraph;
  let sent;

  beforeEach(() => {
    document.body.innerHTML = `<main>
      <div data-block-index="5"><p data-prose-index="9">Inside a block</p></div>
      <p data-prose-index="30">Outside a block</p>
    </main>`;
    main = document.querySelector('main');
    block = main.querySelector('[data-block-index]');
    paragraph = main.querySelector('[data-prose-index="30"]');
    block.getBoundingClientRect = () => ({
      top: 10, bottom: 110, left: 5, width: 200, height: 100,
    });
    paragraph.getBoundingClientRect = () => ({
      top: 120, bottom: 140, left: 5, width: 200, height: 20,
    });
    sent = [];
    setupTableDropListeners({ readOnly: false, port: { postMessage: (msg) => sent.push(msg) } });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    setupTableDropListeners(null);
  });

  it('chooses before/after boundaries and anchors nested content to the outer block', () => {
    expect(nearestTableDropAnchor(main, 20)).to.include({
      kind: 'block', index: 5, side: 'before',
    });
    expect(nearestTableDropAnchor(main, 105)).to.include({
      kind: 'block', index: 5, side: 'after',
    });
    expect(nearestTableDropAnchor(main, 135)).to.include({
      kind: 'text', index: 30, side: 'after',
    });
    const inner = block.querySelector('[data-prose-index]');
    expect(nearestTableDropAnchor(main, 130, inner)).to.include({
      kind: 'block', index: 5, side: 'after',
    });
  });

  it('shows a non-layout-shifting line and sends the HTML payload', () => {
    const transfer = new DataTransfer();
    transfer.setData('text/html', '<table><tr><td>Hero</td></tr></table>');
    const drag = new DragEvent('dragover', {
      bubbles: true, cancelable: true, clientY: 105, dataTransfer: transfer,
    });
    block.dispatchEvent(drag);
    expect(drag.defaultPrevented).to.equal(true);
    const line = document.querySelector('#qe-table-drop-indicator');
    expect(line.style.top).to.equal('110px');
    expect(line.parentElement).to.equal(document.body);

    block.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, clientY: 105, dataTransfer: transfer,
    }));
    expect(document.querySelector('#qe-table-drop-indicator')).to.equal(null);
    expect(sent).to.deep.equal([{
      type: 'table-drop',
      payload: {
        html: '<table><tr><td>Hero</td></tr></table>',
        anchor: { kind: 'block', index: 5 },
        side: 'after',
      },
    }]);
  });

  it('accepts paragraph HTML and ignores empty HTML, files, and read-only pages', () => {
    const text = new DataTransfer();
    text.setData('text/html', '<p>Just text</p>');
    block.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, clientY: 20, dataTransfer: text,
    }));
    expect(sent).to.deep.equal([{
      type: 'table-drop',
      payload: { html: '<p>Just text</p>', anchor: { kind: 'block', index: 5 }, side: 'before' },
    }]);

    const empty = new DataTransfer();
    empty.setData('text/html', ' ');
    block.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, clientY: 20, dataTransfer: empty,
    }));
    expect(sent).to.have.length(1);

    const files = new DataTransfer();
    files.setData('text/html', '<table><tr><td>Not a file drop</td></tr></table>');
    files.items.add(new File(['image'], 'image.png', { type: 'image/png' }));
    const fileDrag = new DragEvent('dragover', {
      bubbles: true, cancelable: true, clientY: 20, dataTransfer: files,
    });
    block.dispatchEvent(fileDrag);
    expect(fileDrag.defaultPrevented).to.equal(false);
    expect(document.querySelector('#qe-table-drop-indicator')).to.equal(null);

    setupTableDropListeners({ readOnly: true, port: { postMessage: (msg) => sent.push(msg) } });
    const drag = new DragEvent('dragover', {
      bubbles: true, cancelable: true, clientY: 20, dataTransfer: text,
    });
    block.dispatchEvent(drag);
    expect(drag.defaultPrevented).to.equal(false);
    expect(document.querySelector('#qe-table-drop-indicator')).to.equal(null);
  });

  it('clears the insertion line when the drag leaves the iframe', () => {
    const transfer = new DataTransfer();
    transfer.setData('text/html', '<table></table>');
    block.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, clientY: 105, dataTransfer: transfer,
    }));
    expect(document.querySelector('#qe-table-drop-indicator')).not.to.equal(null);
    document.dispatchEvent(new DragEvent('dragleave', { relatedTarget: null }));
    expect(document.querySelector('#qe-table-drop-indicator')).to.equal(null);
  });

  it('uses the same insertion line and HTML transaction for a host-relayed drag', () => {
    const { elementFromPoint } = document;
    document.elementFromPoint = () => paragraph;
    try {
      const html = '<table><tr><td>Hero</td></tr></table>';
      handleRemoteTableDrag({ phase: 'over', x: 20, y: 135 });
      expect(document.querySelector('#qe-table-drop-indicator').style.top).to.equal('140px');
      handleRemoteTableDrag({ phase: 'drop', x: 20, y: 135, html });
      expect(document.querySelector('#qe-table-drop-indicator')).to.equal(null);
      expect(sent).to.deep.equal([{
        type: 'table-drop',
        payload: { html, anchor: { kind: 'text', index: 30 }, side: 'after' },
      }]);
      handleRemoteTableDrag({ phase: 'drop', x: 20, y: 135, html: '<h2>Heading</h2>' });
      expect(sent[1]).to.deep.equal({
        type: 'table-drop',
        payload: { html: '<h2>Heading</h2>', anchor: { kind: 'text', index: 30 }, side: 'after' },
      });
      handleRemoteTableDrag({ phase: 'drop', x: 20, y: 135, html: '' });
      expect(sent).to.have.length(2);
      setupTableDropListeners({ readOnly: true, port: { postMessage: (msg) => sent.push(msg) } });
      handleRemoteTableDrag({ phase: 'over', x: 20, y: 135 });
      expect(document.querySelector('#qe-table-drop-indicator')).to.equal(null);
    } finally {
      document.elementFromPoint = elementFromPoint;
    }
  });
});
