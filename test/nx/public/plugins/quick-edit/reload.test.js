import { expect } from '@esm-bundle/chai';
import loadQuickEdit from '../../../../../nx/public/plugins/quick-edit/quick-edit.js';
import { MESSAGE_TYPES } from '../../../../../nx/utils/message-types.js';
import { replaceChanges as replaceNxChanges } from '../../../../../nx/public/plugins/quick-edit/src/reload.js';
import { replaceChanges as replaceNx2Changes } from '../../../../../nx2/public/plugins/quick-edit/src/reload.js';

const implementations = [
  ['nx', replaceNxChanges],
  ['nx2', replaceNx2Changes],
];

describe('quick-edit reload', () => {
  it('replaces the requested scope and reloads the document', async () => {
    const originalBody = document.body.innerHTML;
    const originalUrl = new URL(window.location.href);
    const reloads = [];
    const channel = new MessageChannel();

    try {
      originalUrl.searchParams.set('controller', 'parent');
      window.history.replaceState({}, '', originalUrl);
      document.body.innerHTML = `
        <header>keep this header</header>
        <main><div></div></main>
        <footer>keep this footer</footer>
      `;

      const reload = new Promise((resolve) => {
        loadQuickEdit({ reloadScope: 'main' }, (doc) => {
          reloads.push(doc);
          resolve();
        });
      });
      const ready = new Promise((resolve) => {
        channel.port2.onmessage = resolve;
      });
      const init = new MessageEvent('message', {
        data: {
          type: MESSAGE_TYPES.INIT,
          payload: { config: { canWrite: false } },
        },
        ports: [channel.port1],
      });
      Object.defineProperty(init, 'source', { value: window });
      window.dispatchEvent(init);
      await ready;
      channel.port2.postMessage({
        type: MESSAGE_TYPES.SET_BODY,
        payload: {
          body: `
            <header>new header</header>
            <main><p>new content</p></main>
            <footer>new footer</footer>
          `,
        },
      });

      await reload;

      expect(document.body.querySelector('header').textContent).to.equal('keep this header');
      expect(document.body.querySelector('main').textContent).to.equal('new content');
      expect(document.body.querySelector('footer').textContent).to.equal('keep this footer');
      expect(reloads).to.have.length(1);
      expect(reloads[0]).to.equal(document);
    } finally {
      channel.port1.close();
      channel.port2.close();
      document.body.innerHTML = originalBody;
      window.history.replaceState({}, '', originalUrl);
    }
  });

  implementations.forEach(([name, replaceChanges]) => {
    describe(name, () => {
      it('replaces the requested scope and preserves the rest of the document', () => {
        const targetDocument = document.implementation.createHTMLDocument();
        targetDocument.body.innerHTML = `
          <header>keep this header</header>
          <main><div></div></main>
          <footer>keep this footer</footer>
        `;
        const doc = document.implementation.createHTMLDocument();
        doc.body.innerHTML = `
          <header>new header</header>
          <main><p>new content</p></main>
          <footer>new footer</footer>
        `;

        replaceChanges({ ctx: { reloadScope: 'main' }, doc, targetDocument });

        expect(targetDocument.body.querySelector('header').textContent).to.equal('keep this header');
        expect(targetDocument.body.querySelector('main').textContent).to.equal('new content');
        expect(targetDocument.body.querySelector('footer').textContent).to.equal('keep this footer');
      });

      it('replaces the whole document without a reload scope', () => {
        const targetDocument = document.implementation.createHTMLDocument();
        targetDocument.body.innerHTML = '<main>old content</main>';
        const doc = document.implementation.createHTMLDocument();
        doc.body.innerHTML = '<main>new content</main><footer>new footer</footer>';

        replaceChanges({ ctx: {}, doc, targetDocument });

        expect(targetDocument.body.innerHTML).to.equal(doc.body.innerHTML);
      });

      it('falls back to main when the requested scope is missing', () => {
        const targetDocument = document.implementation.createHTMLDocument();
        targetDocument.body.innerHTML = '<main>old content</main>';
        const doc = document.implementation.createHTMLDocument();
        doc.body.innerHTML = '<main>new content</main>';

        replaceChanges({ ctx: { reloadScope: '.missing' }, doc, targetDocument });

        expect(targetDocument.body.querySelector('main').textContent).to.equal('new content');
      });
    });
  });
});
