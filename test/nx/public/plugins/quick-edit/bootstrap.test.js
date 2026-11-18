import { expect } from '@esm-bundle/chai';
import loadQuickEdit, { claimBootstrap } from '../../../../../nx/public/plugins/quick-edit/quick-edit.js';
import {
  prepare, prepareDetached, getReloadEditable, createReload,
} from '../../../../../nx/public/plugins/quick-edit/quick-edit-init.js';
import { MESSAGE_TYPES } from '../../../../../nx/utils/message-types.js';

const query = (value) => `?quick-edit=${encodeURIComponent(value)}`;
const payloadOf = (search) => prepare(document.createElement('body'), search);

describe('prepare', () => {
  it('does nothing without the quick-edit param', () => {
    const body = document.createElement('body');
    expect(prepare(body, '?foo=bar')).to.equal(null);
    expect(body.classList.contains('quick-edit')).to.equal(false);
  });

  it('marks the body for quick-edit', () => {
    const body = document.createElement('body');
    prepare(body, '?quick-edit=on');
    expect(body.classList.contains('quick-edit')).to.equal(true);
  });

  it('defaults to an empty payload', () => {
    expect(payloadOf('?quick-edit=on')).to.deep.equal({});
    expect(payloadOf(query('{}'))).to.deep.equal({});
    expect(payloadOf(query('not json'))).to.deep.equal({});
    expect(payloadOf(query('null'))).to.deep.equal({});
  });

  it('keeps payload fields and unwraps detail', () => {
    expect(payloadOf(query('{"config":{"a":1}}')))
      .to.deep.equal({ config: { a: 1 } });
    expect(payloadOf(query('{"detail":{"config":{"canWrite":true}}}')))
      .to.deep.equal({ config: { canWrite: true } });
  });
});

describe('prepareDetached', () => {
  it('wraps an element in a section inside a detached main', () => {
    const el = document.createElement('p');
    const main = prepareDetached(el);
    expect(main.tagName).to.equal('MAIN');
    expect(main.isConnected).to.equal(false);
    expect(el.parentElement.parentElement).to.equal(main);
  });

  it('puts a section directly into the detached main', () => {
    const section = document.createElement('div');
    expect(prepareDetached(section, { isSection: true })).to.equal(section.parentElement);
  });
});

describe('getReloadEditable', () => {
  it('prefers the page hook over decorateMain and loadSections', () => {
    const reloadEditable = async () => {};
    expect(getReloadEditable({
      reloadEditable,
      decorateMain: () => { throw new Error('unexpected decoration'); },
      loadSections: () => { throw new Error('unexpected loading'); },
    })).to.equal(reloadEditable);
    expect(getReloadEditable({ reloadEditable })).to.equal(reloadEditable);
  });

  it('awaits decorateMain before loadSections and passes the same main', async () => {
    const calls = [];
    const main = document.createElement('main');
    const reloadEditable = getReloadEditable({
      decorateMain: async (el) => {
        expect(el).to.equal(main);
        await Promise.resolve();
        calls.push('decorate');
      },
      loadSections: (el) => {
        expect(el).to.equal(main);
        calls.push('load');
      },
    });
    await reloadEditable(main);
    expect(calls).to.deep.equal(['decorate', 'load']);
  });

  it('requires both default exports when there is no hook', () => {
    expect(getReloadEditable({ decorateMain: () => {} })).to.equal(undefined);
    expect(getReloadEditable({ loadSections: () => {} })).to.equal(undefined);
    expect(getReloadEditable({ reloadEditable: true })).to.equal(undefined);
    expect(getReloadEditable({ loadPage: () => {} })).to.equal(undefined);
  });
});

describe('createReload element scope', () => {
  const element = () => {
    const p = document.createElement('p');
    p.setAttribute('data-prose-index', '3');
    p.innerHTML = '<strong><a href="/a">Buy</a></strong>';
    return p;
  };
  const reloadElement = (utils, el) => {
    const reload = createReload(getReloadEditable(utils));
    return reload(document, { type: 'element', el });
  };

  it('runs the shared page hook on a detached main without requiring a return value', async () => {
    const el = element();
    const result = await reloadElement({
      reloadEditable: async (main) => {
        expect(main.tagName).to.equal('MAIN');
        expect(main.isConnected).to.equal(false);
        const p = main.querySelector('p');
        const replacement = p.cloneNode(true);
        replacement.className = 'custom';
        p.replaceWith(replacement);
      },
    }, el);
    expect(result).not.to.equal(el);
    expect(result.className).to.equal('custom');
    expect(result.getAttribute('data-prose-index')).to.equal('3');
  });

  it('decorates a detached main and returns the indexed element', async () => {
    const result = await reloadElement({
      decorateMain: async (main) => {
        const p = main.querySelector('p');
        const wrapper = document.createElement('div');
        wrapper.className = 'default-content-wrapper';
        p.replaceWith(wrapper);
        wrapper.append(p);
        p.className = 'button-wrapper';
      },
      loadSections: async () => {},
    }, element());
    expect(result.getAttribute('data-prose-index')).to.equal('3');
    expect(result.className).to.equal('button-wrapper');
  });
});

describe('createReload', () => {
  const decorateMain = (main) => {
    [...main.children].forEach((section) => {
      section.classList.add('section');
      [...section.children].forEach((block) => {
        const wrapper = document.createElement('div');
        wrapper.className = `${block.className}-wrapper`;
        block.replaceWith(wrapper);
        wrapper.append(block);
        block.classList.add('block');
      });
    });
  };
  const loadSections = async () => {};

  beforeEach(() => {
    document.body.innerHTML = '<main><div class="section"><div class="hero-wrapper"><div class="hero"></div></div></div></main>';
  });
  afterEach(() => { document.body.innerHTML = ''; });

  it('decorates a replaced section detached by default', async () => {
    const reloadEditable = getReloadEditable({ decorateMain, loadSections });
    const reload = createReload(reloadEditable);
    const el = document.createElement('div');
    el.innerHTML = '<div class="cards"></div>';
    document.querySelector('main').append(el);
    await reload(document, { type: 'section', el });
    expect(document.querySelector('main > div.section:last-child > .cards-wrapper > .cards.block')).to.exist;
  });

  it('decorates a replaced block into a fresh wrapper by default', async () => {
    const reloadEditable = getReloadEditable({ decorateMain, loadSections });
    const reload = createReload(reloadEditable);
    const el = document.createElement('div');
    el.className = 'columns';
    document.querySelector('.hero').replaceWith(el);
    await reload(document, { type: 'block', el });
    expect(document.querySelector('.hero-wrapper')).to.equal(null);
    expect(document.querySelector('main > .section > .columns-wrapper > .columns.block')).to.exist;
  });

  it('inserts a block the page hook replaced instead of the original node', async () => {
    const reload = createReload(getReloadEditable({
      reloadEditable: async (main) => {
        const block = main.querySelector('.columns');
        const wrapper = document.createElement('div');
        wrapper.className = 'columns-wrapper';
        wrapper.innerHTML = '<div class="columns block custom"></div>';
        block.replaceWith(wrapper);
      },
    }));
    const el = document.createElement('div');
    el.className = 'columns';
    document.querySelector('.hero').replaceWith(el);
    await reload(document, { type: 'block', el });
    const section = document.querySelector('main > .section');
    expect(section.textContent).to.equal('');
    expect(section.children.length).to.equal(1);
    expect(section.querySelector(':scope > .columns-wrapper > .columns.block.custom')).to.exist;
  });

  it('uses the shared page hook for every scope without default exports', async () => {
    const calls = [];
    const reloadEditable = getReloadEditable({
      reloadEditable: async (main) => {
        calls.push(main.isConnected);
        decorateMain(main);
        await loadSections(main);
      },
    });
    const reload = createReload(reloadEditable);
    document.querySelector('main').innerHTML = '<div><div class="hero"></div></div>';
    await reload(document);
    const section = document.createElement('div');
    section.innerHTML = '<div class="cards"></div>';
    document.querySelector('main').append(section);
    await reload(document, { type: 'section', el: section });
    const block = document.createElement('div');
    block.className = 'columns';
    document.querySelector('.hero').replaceWith(block);
    await reload(document, { type: 'block', el: block });
    const el = document.createElement('p');
    el.setAttribute('data-prose-index', '3');
    const result = await reload(document, { type: 'element', el });

    expect(calls).to.deep.equal([true, false, false, false]);
    expect(result).to.equal(el);
    expect(document.querySelector('.cards-wrapper > .cards.block')).to.exist;
    expect(document.querySelector('.columns-wrapper > .columns.block')).to.exist;
    expect(document.querySelector('.hero-wrapper')).to.equal(null);
  });
});

describe('claimBootstrap', () => {
  const originalUrl = new URL(window.location.href);

  afterEach(() => window.history.replaceState({}, '', originalUrl));

  function sendInit() {
    const channel = new MessageChannel();
    const ready = new Promise((resolve) => {
      channel.port2.onmessage = () => resolve(true);
      setTimeout(() => resolve(false), 200);
    });
    const init = new MessageEvent('message', {
      data: { type: MESSAGE_TYPES.INIT, payload: { config: { canWrite: false } } },
      ports: [channel.port1],
    });
    Object.defineProperty(init, 'source', { value: window.parent });
    window.dispatchEvent(init);
    return ready.finally(() => {
      channel.port1.close();
      channel.port2.close();
    });
  }

  it('ignores other loaders once quick-edit-init owns loading', async () => {
    const url = new URL(originalUrl);
    url.searchParams.set('controller', 'parent');
    window.history.replaceState({}, '', url);
    claimBootstrap();

    loadQuickEdit({}, () => {}, { partialReload: true });
    expect(await sendInit()).to.equal(false);

    loadQuickEdit({}, () => {}, { bootstrap: true, partialReload: true });
    expect(await sendInit()).to.equal(true);
  });
});
