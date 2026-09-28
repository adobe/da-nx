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
  it('replaces the requested scope and reloads the document', async function testReload() {
    this.timeout(5000);
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
      Object.defineProperty(init, 'source', { value: window.parent });
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
      expect(reloads[0]).to.equal(undefined);
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

  describe('section count changes', () => {
    const live = (texts) => texts
      .map((t) => `<div class="section" data-section-status="loaded"><p>${t}</p></div>`).join('');
    const raw = (texts) => texts.map((t) => `<div><p>${t}</p></div>`).join('');
    const run = ({ before, after, type, sectionIndex }) => {
      const targetDocument = document.implementation.createHTMLDocument();
      targetDocument.body.innerHTML = `<main>${live(before)}</main>`;
      const doc = document.implementation.createHTMLDocument();
      doc.body.innerHTML = `<main>${raw(after)}</main>`;
      replaceNxChanges({
        ctx: { reloadScope: 'main' },
        doc,
        rerenderScope: { type, sectionIndex },
        targetDocument,
      });
      const sections = [...targetDocument.querySelectorAll('main > div')];
      return {
        texts: sections.map((s) => s.textContent),
        untouched: sections.map((s) => s.dataset.sectionStatus === 'loaded'),
      };
    };

    [2, 1].forEach((sectionIndex) => {
      it(`removes only the section at index ${sectionIndex}`, () => {
        const before = ['a', 'b', 'c', 'd'];
        const after = before.filter((_, i) => i !== sectionIndex);
        const { texts, untouched } = run({ before, after, type: 'section-removed', sectionIndex });
        expect(texts).to.deep.equal(after);
        expect(untouched.every(Boolean)).to.be.true;
      });
    });

    it('inserts only the added section', () => {
      const { texts, untouched } = run({ before: ['a', 'c'], after: ['a', 'b', 'c'], type: 'section-added', sectionIndex: 1 });
      expect(texts).to.deep.equal(['a', 'b', 'c']);
      expect(untouched).to.deep.equal([true, false, true]);
    });

    it('appends an added last section', () => {
      const { texts, untouched } = run({ before: ['a'], after: ['a', 'b'], type: 'section-added', sectionIndex: 1 });
      expect(texts).to.deep.equal(['a', 'b']);
      expect(untouched).to.deep.equal([true, false]);
    });

    it('re-renders main when a section scope does not match the section count', () => {
      const { texts, untouched } = run({ before: ['a', 'bc', 'd'], after: ['a', 'b', 'c', 'd'], type: 'section', sectionIndex: 1 });
      expect(texts).to.deep.equal(['a', 'b', 'c', 'd']);
      expect(untouched.some(Boolean)).to.be.false;
    });
  });

  it('replaces a changed section with its raw markup', () => {
    const targetDocument = document.implementation.createHTMLDocument();
    targetDocument.body.innerHTML = '<main><div class="section" data-section-status="loaded"><div class="default-content-wrapper"><p>one</p></div></div><div class="section" data-section-status="loaded"><div class="default-content-wrapper"><p>two</p></div></div></main>';
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<main><div><p>one</p></div><div class="highlight"><p>changed</p></div></main>';

    replaceNxChanges({
      ctx: { reloadScope: 'main' },
      doc,
      rerenderScope: { type: 'section', sectionIndex: 1 },
      targetDocument,
    });

    const sections = targetDocument.querySelectorAll('main > div');
    expect(sections[0].dataset.sectionStatus).to.equal('loaded');
    expect(sections[1].outerHTML).to.equal('<div class="highlight"><p>changed</p></div>');
  });

  it('replaces a changed block using the page-wide block index', () => {
    const targetDocument = document.implementation.createHTMLDocument();
    targetDocument.body.innerHTML = '<main>'
      + '<div class="section" data-section-status="loaded"><div class="default-content-wrapper"><p>a</p></div><div class="cards-wrapper"><div class="cards block" data-block-status="loaded"><p>one</p></div></div></div>'
      + '<div class="section" data-section-status="loaded"><div class="block-marker-wrapper"><p>meta</p></div><div class="columns-wrapper"><div class="columns block" data-block-status="loaded"><p>two</p></div></div></div>'
      + '</main>';
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<main>'
      + '<div><p>a</p><div class="cards" data-block-index="3"><p>one</p></div></div>'
      + '<div><div class="block-marker" data-prose-index="10"></div><div class="columns" data-block-index="20"><p>changed</p></div></div>'
      + '</main>';

    const replaced = replaceNxChanges({
      ctx: { reloadScope: 'main' },
      doc,
      rerenderScope: { type: 'block', sectionIndex: 1, blockIndex: 1 },
      targetDocument,
    });

    const [first, second] = targetDocument.querySelectorAll('main > div');
    expect(first.dataset.sectionStatus).to.equal('loaded');
    expect(first.querySelector('.cards').textContent).to.equal('one');
    expect(second.dataset.sectionStatus).to.equal('loaded');
    expect(replaced.type).to.equal('block');
    expect(replaced.el === second.querySelector('.columns')).to.be.true;
    expect(second.querySelector('.columns-wrapper').innerHTML)
      .to.equal('<div class="columns" data-block-index="20"><p>changed</p></div>');
  });

  it('falls back to the section when the block count changed', () => {
    const targetDocument = document.implementation.createHTMLDocument();
    targetDocument.body.innerHTML = '<header>keep</header><main><div class="section" data-section-status="loaded"><div class="cards-wrapper"><div class="cards block"><p>one</p></div></div></div></main>';
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<header>new</header><main><div><div class="cards" data-block-index="1"><p>one</p></div><div class="columns" data-block-index="9"><p>two</p></div></div></main>';

    replaceNxChanges({
      ctx: { reloadScope: 'main' },
      doc,
      rerenderScope: { type: 'block', sectionIndex: 0, blockIndex: 1 },
      targetDocument,
    });

    expect(targetDocument.body.querySelector('header').textContent).to.equal('keep');
    expect(targetDocument.querySelector('main').innerHTML).to.equal(doc.querySelector('main').innerHTML);
  });
});
