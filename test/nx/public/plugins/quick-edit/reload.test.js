import { expect } from '@esm-bundle/chai';
import loadQuickEdit from '../../../../../nx/public/plugins/quick-edit/quick-edit.js';
import { MESSAGE_TYPES } from '../../../../../nx/utils/message-types.js';
import { replaceChanges as replaceNxChanges } from '../../../../../nx/public/plugins/quick-edit/src/reload.js';
import { replaceChanges as replaceNx2Changes } from '../../../../../nx2/public/plugins/quick-edit/src/reload.js';
import { restoreBlockIndices } from '../../../../../nx/public/plugins/quick-edit/src/dom-index.js';

const implementations = [
  ['nx', replaceNxChanges, { partialReload: true }],
  ['nx2', replaceNx2Changes, { reloadScope: 'main' }],
];

describe('quick-edit reload', () => {
  it('imports the nx2 entrypoint without invoking the loader', async () => {
    const errors = [];
    const onRejection = (e) => {
      errors.push(e.reason);
      e.preventDefault();
    };
    window.addEventListener('unhandledrejection', onRejection);
    try {
      const { default: loadNx2 } = await import('../../../../../nx2/public/plugins/quick-edit/quick-edit.js');
      await new Promise((resolve) => { setTimeout(resolve); });
      expect(loadNx2).to.be.a('function');
      expect(errors).to.deep.equal([]);
    } finally {
      window.removeEventListener('unhandledrejection', onRejection);
    }
  });

  it('automatically scopes partial reloads to main and reloads the document', async function testReload() {
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
        loadQuickEdit({}, (doc, replaced) => {
          reloads.push({ doc, replaced });
          resolve();
        }, { partialReload: true });
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
      // Closing the page with scroll-anchor frames pending stalls rAF in concurrent test pages.
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });

      expect(document.body.querySelector('header').textContent).to.equal('keep this header');
      expect(document.body.querySelector('main').textContent).to.equal('new content');
      expect(document.body.querySelector('footer').textContent).to.equal('keep this footer');
      expect(reloads).to.have.length(1);
      expect(reloads[0].doc).to.equal(document);
      expect(reloads[0].replaced).to.equal(undefined);
    } finally {
      channel.port1.close();
      channel.port2.close();
      document.body.innerHTML = originalBody;
      window.history.replaceState({}, '', originalUrl);
    }
  });

  implementations.forEach(([name, replaceChanges, ctx]) => {
    describe(name, () => {
      it('replaces main and preserves the rest of the document', () => {
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

        replaceChanges({ ctx, doc, targetDocument });

        expect(targetDocument.body.querySelector('header').textContent).to.equal('keep this header');
        expect(targetDocument.body.querySelector('main').textContent).to.equal('new content');
        expect(targetDocument.body.querySelector('footer').textContent).to.equal('keep this footer');
      });

      it('replaces the whole document by default', () => {
        const targetDocument = document.implementation.createHTMLDocument();
        targetDocument.body.innerHTML = '<main>old content</main>';
        const doc = document.implementation.createHTMLDocument();
        doc.body.innerHTML = '<main>new content</main><footer>new footer</footer>';

        replaceChanges({ ctx: {}, doc, targetDocument });

        expect(targetDocument.body.innerHTML).to.equal(doc.body.innerHTML);
      });

      it('clears main when the source has no main', () => {
        const targetDocument = document.implementation.createHTMLDocument();
        targetDocument.body.innerHTML = '<header>keep</header><main>old content</main>';
        const doc = document.implementation.createHTMLDocument();
        doc.body.innerHTML = '<header>new header</header>';

        replaceChanges({ ctx, doc, targetDocument });

        expect(targetDocument.body.querySelector('main').innerHTML).to.equal('');
        expect(targetDocument.body.querySelector('header').textContent).to.equal('keep');
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
        ctx: { partialReload: true },
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
      ctx: { partialReload: true },
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
      ctx: { partialReload: true },
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
      ctx: { partialReload: true },
      doc,
      rerenderScope: { type: 'block', sectionIndex: 0, blockIndex: 1 },
      targetDocument,
    });

    expect(targetDocument.body.querySelector('header').textContent).to.equal('keep');
    expect(targetDocument.querySelector('main').innerHTML).to.equal(doc.querySelector('main').innerHTML);
  });

  describe('kept DOM', () => {
    const PARTIAL = { partialReload: true };
    const create = (html) => {
      const target = document.implementation.createHTMLDocument();
      target.body.innerHTML = html;
      return target;
    };
    const liveBlock = ([name, index, prose, text]) => `<div class="${name}-wrapper">`
      + `<div class="${name} block" data-block-index="${index}"><p data-prose-index="${prose}">${text}</p></div></div>`;
    const rawBlock = ([name, index, prose, text]) => `<div class="${name}" data-block-index="${index}">`
      + `<p data-prose-index="${prose}">${text}</p></div>`;
    const indices = (target, attr) => [...target.querySelectorAll(`main [${attr}]`)]
      .map((el) => el.getAttribute(attr));

    it('re-keys the blocks after a block that changed size', () => {
      const targetDocument = create(`<header>h</header><main><div class="section">${
        [['cards', 10, 12, 'first'], ['cards', 20, 22, 'middle'], ['cards', 30, 32, 'last']].map(liveBlock).join('')
      }</div></main><footer>f</footer>`);
      const doc = create(`<main><div>${
        [['cards', 10, 12, 'first changed'], ['cards', 30, 32, 'middle'], ['cards', 40, 42, 'last']].map(rawBlock).join('')
      }</div></main>`);

      const replaced = replaceNxChanges({
        ctx: PARTIAL, doc, rerenderScope: { type: 'block', sectionIndex: 0, blockIndex: 0 }, targetDocument,
      });
      restoreBlockIndices(doc, targetDocument);

      expect(replaced.type).to.equal('block');
      expect(indices(targetDocument, 'data-block-index')).to.deep.equal(['10', '30', '40']);
      expect(indices(targetDocument, 'data-prose-index')).to.deep.equal(['12', '32', '42']);
      expect(targetDocument.querySelector('[data-block-index="30"]').textContent).to.equal('middle');
    });

    it('re-keys the sections after a removed section', () => {
      const targetDocument = create('<main>'
        + '<div class="section"><p data-prose-index="1">a</p></div>'
        + '<div class="section"><p data-prose-index="5">b</p></div>'
        + '<div class="section"><p data-prose-index="9">c</p></div></main>');
      const doc = create('<main><div><p data-prose-index="1">a</p></div>'
        + '<div><p data-prose-index="5">c</p></div></main>');

      replaceNxChanges({
        ctx: PARTIAL, doc, rerenderScope: { type: 'section-removed', sectionIndex: 1 }, targetDocument,
      });

      expect(targetDocument.querySelector('main').textContent).to.equal('ac');
      expect(indices(targetDocument, 'data-prose-index')).to.deep.equal(['1', '5']);
    });

    it('re-renders all of main when kept indices cannot be mapped', () => {
      const targetDocument = create('<header>h</header><main>'
        + '<div class="section"><p data-prose-index="1">a</p></div>'
        + '<div class="section"><p data-prose-index="10">b</p></div>'
        + '<div class="section"><p data-prose-index="20">c</p><p data-prose-index="30">d</p></div>'
        + '</main>');
      const doc = create('<main><div><p data-prose-index="1">a</p></div>'
        + '<div><p data-prose-index="10">b changed</p></div>'
        + '<div><p data-prose-index="25">c</p><p data-prose-index="40">d</p></div></main>');

      const replaced = replaceNxChanges({
        ctx: PARTIAL, doc, rerenderScope: { type: 'section', sectionIndex: 1 }, targetDocument,
      });

      expect(replaced).to.equal(undefined);
      expect(targetDocument.querySelector('main').innerHTML).to.equal(doc.querySelector('main').innerHTML);
      expect(targetDocument.querySelector('header').textContent).to.equal('h');
    });

    [undefined, false].forEach((partialReload) => {
      it(`replaces the whole body when partialReload is ${partialReload}`, () => {
        const targetDocument = create('<header>old</header><main><div class="section"><p>a</p></div><div class="section"><p>b</p></div></main><footer>old</footer>');
        const doc = create('<header>new</header><main><div><p>a</p></div><div><p>b changed</p></div></main><footer>new</footer>');

        const replaced = replaceNxChanges({
          ctx: { partialReload }, doc, rerenderScope: { type: 'section', sectionIndex: 1 }, targetDocument,
        });

        expect(replaced).to.equal(undefined);
        expect(targetDocument.body.innerHTML).to.equal(doc.body.innerHTML);
      });
    });

    implementations.forEach(([name, replaceChanges, ctx]) => {
      it(`${name} keeps header and footer when the page has no main yet`, () => {
        const targetDocument = create('<header>h</header><footer>f</footer>');
        const doc = create('<header>x</header><main><p>new</p></main><footer>y</footer>');

        replaceChanges({ ctx, doc, targetDocument });

        expect([...targetDocument.body.children].map((el) => el.localName))
          .to.deep.equal(['header', 'main', 'footer']);
        expect(targetDocument.body.textContent).to.equal('hnewf');
      });
    });
  });
});
