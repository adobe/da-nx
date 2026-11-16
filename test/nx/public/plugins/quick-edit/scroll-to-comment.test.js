import { expect } from '@esm-bundle/chai';
import loadQuickEdit from '../../../../../nx/public/plugins/quick-edit/quick-edit.js';
import { MESSAGE_TYPES } from '../../../../../nx/utils/message-types.js';

const BLOCKS = '<main>'
  + '<div data-block-index="0" style="height:1000px">A</div>'
  + '<div data-block-index="1" style="height:1000px">B</div>'
  + '<div data-block-index="2" style="height:1000px">C</div>'
  + '</main>';

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('quick-edit scroll to comment', () => {
  it('scrolls after a pending body render and is not pulled back by it', async function testScroll() {
    this.timeout(5000);
    const originalUrl = new URL(window.location.href);
    const channel = new MessageChannel();
    const events = [];
    const { scrollIntoView } = Element.prototype;
    const { scrollBy, scrollTo } = window;
    let finishReload;

    try {
      document.body.style.margin = '0';
      document.body.innerHTML = BLOCKS;
      const url = new URL(originalUrl);
      url.searchParams.set('controller', 'parent');
      window.history.replaceState({}, '', url);

      loadQuickEdit({}, () => new Promise((resolve) => {
        events.push('reload-start');
        finishReload = () => {
          events.push('reload-end');
          resolve();
        };
      }));
      const ready = new Promise((resolve) => { channel.port2.onmessage = resolve; });
      const init = new MessageEvent('message', {
        data: { type: MESSAGE_TYPES.INIT, payload: { config: { canWrite: false } } },
        ports: [channel.port1],
      });
      Object.defineProperty(init, 'source', { value: window.parent });
      window.dispatchEvent(init);
      await ready;

      Element.prototype.scrollIntoView = function record() {
        events.push(`scroll-to-${this.getAttribute('data-block-index')}`);
      };
      window.scrollBy = () => events.push('restore');
      window.scrollTo = () => events.push('restore');

      channel.port2.postMessage({ type: MESSAGE_TYPES.SET_BODY, payload: { body: `<html><body>${BLOCKS}</body></html>` } });
      await wait(20);
      channel.port2.postMessage({ type: MESSAGE_TYPES.SCROLL_TO_POS, payload: { proseIndex: 2 } });
      await wait(20);
      finishReload();
      await wait(100);

      expect(events).to.deep.equal(['reload-start', 'reload-end', 'scroll-to-2']);
    } finally {
      Element.prototype.scrollIntoView = scrollIntoView;
      window.scrollBy = scrollBy;
      window.scrollTo = scrollTo;
      channel.port1.close();
      channel.port2.close();
      document.body.innerHTML = '';
      document.body.style.margin = '';
      window.history.replaceState({}, '', originalUrl);
    }
  });
});
