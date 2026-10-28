import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../nx2/scripts/nx.js';
import { PANEL_EVENT, registerPanelSection } from '../../../../nx2/utils/panel.js';
import { calls, installFetch, restoreFetch } from '../../../../nx2/test/mocks/fetch.js';

await setConfig({ hostnames: [] });
await import('../../../../nx2/blocks/sidenav/sidenav.js');

describe('sidenav chat action', () => {
  let sidenav;
  let main;
  let originalHref;
  let storageDescriptor;
  let org;
  let checks;
  let siteNumber = 0;

  const setFlags = (flags) => {
    restoreFetch();
    installFetch({
      body: JSON.stringify({
        flags: { data: Object.entries(flags).map(([key, value]) => ({ key, value })) },
      }),
    });
  };

  const navigate = async (hash) => {
    history.replaceState(null, '', `${originalHref.split('#')[0]}${hash}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await checks.at(-1);
    await sidenav.updateComplete;
  };

  beforeEach(async () => {
    storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const storage = new Map();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: (key) => storage.delete(key),
      },
    });
    originalHref = window.location.href;
    siteNumber += 1;
    org = `rail-org-${siteNumber}`;
    history.replaceState(null, '', `${originalHref.split('#')[0]}#/${org}/enabled`);
    setFlags({ 'ew.enabled': 'true' });
    checks = [];
    main = document.createElement('main');
    document.body.append(main);
    sidenav = document.createElement('nx-sidenav');
    const syncChatEnabled = sidenav.syncChatEnabled.bind(sidenav);
    sidenav.syncChatEnabled = (state) => {
      const check = syncChatEnabled(state);
      checks.push(check);
      return check;
    };
    sidenav.loadNav = async () => {
      sidenav._navLinks = ['Home', 'Apps'].map((text) => ({
        text,
        href: `${window.location.origin}/${text.toLowerCase()}`,
        icon: document.createElement('span'),
      }));
    };
    document.body.append(sidenav);
    await checks.at(-1);
    await sidenav.updateComplete;
  });

  afterEach(() => {
    sidenav.remove();
    main.remove();
    document.querySelectorAll('aside.panel').forEach((panel) => panel.remove());
    history.replaceState(null, '', originalHref);
    restoreFetch();
    Object.defineProperty(window, 'localStorage', storageDescriptor);
  });

  it('adds an accessible action above Home only after chat is registered', async () => {
    expect(sidenav.shadowRoot.querySelector('button')).to.equal(null);
    let loaded = 0;
    registerPanelSection('chat', {
      position: 'before',
      getContent: async () => {
        loaded += 1;
        return document.createElement('div');
      },
    });
    await sidenav.updateComplete;
    const button = sidenav.shadowRoot.querySelector('button');
    expect(button.getAttribute('aria-label')).to.equal('Open chat');
    expect(button.getAttribute('title')).to.equal('Chat');
    expect(button.type).to.equal('button');
    expect(button.querySelector('.icon').getAttribute('aria-hidden')).to.equal('true');
    expect(button.closest('li').nextElementSibling.querySelector('a').textContent).to.equal('Home');
    expect(loaded).to.equal(0);
    expect([...sidenav.shadowRoot.querySelectorAll('a')].map((link) => link.textContent))
      .to.deep.equal(['Home', 'Apps']);
  });

  it('toggles and reuses the registered chat panel without changing navigation', async () => {
    sidenav._navLinks = sidenav._navLinks.map((link) => (
      link.text === 'Home' ? { ...link, href: window.location.href.split('#')[0] } : link
    ));
    const content = document.createElement('div');
    let loaded = 0;
    let shown;
    const events = [];
    registerPanelSection('chat', {
      position: 'before',
      getContent: async () => {
        loaded += 1;
        return content;
      },
      onShow: () => shown(),
    });
    await sidenav.updateComplete;
    const button = sidenav.shadowRoot.querySelector('button');
    const home = sidenav.shadowRoot.querySelector('a').closest('li');
    expect(home.classList.contains('is-active')).to.equal(true);
    expect(button.getAttribute('aria-expanded')).to.equal('false');
    expect(sidenav._chatPanelState).to.equal('closed');
    const hrefBeforeOpen = window.location.href;
    const onOpen = (event) => events.push(event.detail);
    document.addEventListener(PANEL_EVENT.OPEN, onOpen);
    try {
      const open = () => new Promise((resolve) => {
        shown = resolve;
        button.click();
      });
      await open();
      await sidenav.updateComplete;
      const panel = document.querySelector('aside.panel[data-section="chat"]');
      expect(panel.querySelector('.panel-body').firstElementChild).to.equal(content);
      expect(panel.hidden).to.equal(false);
      expect(button.getAttribute('aria-label')).to.equal('Close chat');
      expect(button.getAttribute('aria-expanded')).to.equal('true');
      expect(button.closest('li').classList.contains('is-active')).to.equal(true);
      expect(home.classList.contains('is-active')).to.equal(true);
      button.click();
      await sidenav.updateComplete;
      expect(panel.hidden).to.equal(true);
      expect(button.getAttribute('aria-label')).to.equal('Open chat');
      expect(button.getAttribute('aria-expanded')).to.equal('false');
      expect(button.closest('li').classList.contains('is-active')).to.equal(false);
      expect(home.classList.contains('is-active')).to.equal(true);
      await open();
      await sidenav.updateComplete;
      expect(panel.hidden).to.equal(false);
      expect(button.getAttribute('aria-expanded')).to.equal('true');
      expect(home.classList.contains('is-active')).to.equal(true);
      expect(document.querySelector('aside.panel[data-section="chat"]')).to.equal(panel);
      expect(loaded).to.equal(1);
      expect(events).to.deep.equal([{ section: 'chat' }, { section: 'chat' }]);
      expect(window.location.href).to.equal(hrefBeforeOpen);

      content.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true }));
      await sidenav.updateComplete;
      expect(button.getAttribute('aria-label')).to.equal('Open chat');
      expect(button.getAttribute('aria-expanded')).to.equal('false');
      expect(button.closest('li').classList.contains('is-active')).to.equal(false);
      expect(home.classList.contains('is-active')).to.equal(true);
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, onOpen);
    }
  });

  it('coalesces rapid clicks and waits for the panel to open before marking Chat active', async () => {
    let release;
    let shown;
    let loaded = 0;
    const content = new Promise((resolve) => { release = resolve; });
    const opened = new Promise((resolve) => { shown = resolve; });
    registerPanelSection('chat', {
      position: 'before',
      getContent: () => {
        loaded += 1;
        return content;
      },
      onShow: shown,
    });
    await sidenav.updateComplete;
    const button = sidenav.shadowRoot.querySelector('button');
    button.click();
    button.click();
    expect(loaded).to.equal(1);
    await sidenav.updateComplete;
    expect(button.getAttribute('aria-expanded')).to.equal('false');
    expect(getComputedStyle(button.closest('li')).visibility).to.equal('visible');

    release(document.createElement('div'));
    await opened;
    await sidenav.updateComplete;
    expect(button.getAttribute('aria-expanded')).to.equal('true');
    expect(document.querySelectorAll('aside.panel[data-section="chat"]')).to.have.length(1);
    button.click();
    await sidenav.updateComplete;
    expect(document.querySelector('aside.panel[data-section="chat"]').hidden).to.equal(true);
    expect(button.getAttribute('aria-expanded')).to.equal('false');
  });

  it('reveals restored Chat directly in its active style without collapsing its rail slot', async () => {
    sidenav.remove();
    localStorage.setItem('nx-panels', JSON.stringify({ chat: { width: '400px' } }));
    let release;
    let shown;
    const content = new Promise((resolve) => { release = resolve; });
    const opened = new Promise((resolve) => { shown = resolve; });
    registerPanelSection('chat', {
      position: 'before',
      getContent: () => content,
      onShow: shown,
    });
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat' } }));
    document.body.append(sidenav);
    await checks.at(-1);
    await sidenav.updateComplete;

    const button = sidenav.shadowRoot.querySelector('button');
    const item = button.closest('li');
    expect(sidenav._chatPanelState).to.equal('restoring');
    expect(getComputedStyle(item).visibility).to.equal('hidden');
    expect(item.getBoundingClientRect().height).to.be.greaterThan(0);
    expect(button.getAttribute('aria-expanded')).to.equal('false');

    release(document.createElement('div'));
    await opened;
    await sidenav.updateComplete;
    expect(item.classList.contains('is-active')).to.equal(true);
    expect(getComputedStyle(item).visibility).to.equal('visible');
    expect(button.getAttribute('aria-expanded')).to.equal('true');
  });

  it('tracks externally opened chat and resynchronizes visibility on reconnect', async () => {
    let shown;
    const opened = new Promise((resolve) => { shown = resolve; });
    registerPanelSection('chat', {
      position: 'before',
      getContent: async () => document.createElement('div'),
      onShow: shown,
    });
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat' } }));
    await opened;
    await sidenav.updateComplete;
    expect(sidenav.shadowRoot.querySelector('button').getAttribute('aria-expanded')).to.equal('true');

    sidenav.remove();
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'chat' } }));
    expect(sidenav._chatPanelState).to.equal('open');
    document.body.append(sidenav);
    await checks.at(-1);
    await sidenav.updateComplete;
    expect(sidenav.shadowRoot.querySelector('button').getAttribute('aria-expanded')).to.equal('false');
  });

  it('does not inject an unrelated action when the fragment has no Home entry', async () => {
    sidenav._navLinks = sidenav._navLinks.filter(({ text }) => text !== 'Home');
    await sidenav.updateComplete;
    expect(sidenav.shadowRoot.querySelector('button')).to.equal(null);
    expect(sidenav.shadowRoot.querySelector('a').textContent).to.equal('Apps');
  });

  it('shows chat at org level and below without rechecking flags for child paths', async () => {
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);
    const requestCount = calls.length;
    await navigate(`#/${org}/enabled/folder/document.html`);
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);
    expect(calls).to.have.length(requestCount);

    await navigate(`#/${org}`);
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);
    await navigate('');
    expect(sidenav.shadowRoot.querySelector('button')).to.equal(null);
    expect(calls).to.have.length(requestCount);

    await navigate(`#/${org}/enabled`);
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);
  });

  [true, false].forEach((allowed) => {
    it(`preserves the rail slot and focus while checking an ${allowed ? 'enabled' : 'disabled'} site`, async () => {
      const button = sidenav.shadowRoot.querySelector('button');
      const home = sidenav.shadowRoot.querySelector('a');
      const homeTop = home.getBoundingClientRect().top;
      button.focus();
      const fetchDefault = window.fetch;
      let release;
      const delayed = new Promise((resolve) => { release = resolve; });
      window.fetch = (url, options) => {
        const href = url.toString();
        if (href.includes('/checking/') && !href.includes('/ping/')) return delayed;
        return fetchDefault(url, options);
      };
      const opens = [];
      const onOpen = (event) => opens.push(event);
      document.addEventListener(PANEL_EVENT.OPEN, onOpen);
      const pending = navigate(`#/${org}/checking`);
      try {
        await sidenav.updateComplete;
        expect(sidenav.shadowRoot.querySelector('button')).to.equal(button);
        expect(getComputedStyle(button.closest('li')).visibility).to.equal('visible');
        expect(home.getBoundingClientRect().top).to.equal(homeTop);
        expect(sidenav.shadowRoot.activeElement).to.equal(button);
        expect(button.getAttribute('aria-disabled')).to.equal('true');
        button.click();
        expect(opens).to.have.length(0);

        release(new Response(JSON.stringify({
          flags: {
            data: [
              { key: 'ew.enabled', value: 'true' },
              { key: 'ew.disableChat', value: allowed ? 'false' : 'true' },
            ],
          },
        })));
        await pending;
        if (allowed) {
          expect(sidenav.shadowRoot.querySelector('button')).to.equal(button);
          expect(sidenav.shadowRoot.activeElement).to.equal(button);
          expect(button.getAttribute('aria-disabled')).to.equal('false');
        } else {
          expect(sidenav.shadowRoot.querySelector('button')).to.equal(null);
        }
      } finally {
        release(new Response('{}'));
        await pending;
        document.removeEventListener(PANEL_EVENT.OPEN, onOpen);
      }
    });
  });

  it('hides chat on disabled sites even when the host registration persists', async () => {
    setFlags({ 'ew.enabled': 'true', 'ew.disableChat': 'true' });
    await navigate(`#/${org}/disabled`);
    expect(sidenav._hasChatPanel).to.equal(true);
    expect(sidenav.shadowRoot.querySelector('button')).to.equal(null);
    await navigate(`#/${org}/enabled`);
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);
  });

  it('honors org chat-disable flags and site overrides even with EW user opt-in', async () => {
    localStorage.setItem('nx2:ew-user-enabled', 'true');
    setFlags({ 'ew.disableChat': 'true' });
    await navigate(`#/${org}-disabled`);
    expect(sidenav._hasChatPanel).to.equal(true);
    expect(sidenav.shadowRoot.querySelector('button')).to.equal(null);

    setFlags({ 'ew.disableChat': 'false' });
    await navigate(`#/${org}-disabled/override`);
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);

    await navigate(`#/${org}-disabled`);
    expect(sidenav.shadowRoot.querySelector('button')).to.equal(null);

    setFlags({});
    await navigate(`#/${org}-allowed`);
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);
  });

  it('requires EW at org level while honoring user opt-in', async () => {
    setFlags({ 'ew.enabled': 'false' });
    await navigate(`#/${org}-legacy`);
    expect(sidenav.shadowRoot.querySelector('button')).to.equal(null);

    localStorage.setItem('nx2:ew-user-enabled', 'true');
    await navigate(`#/${org}-opt-in`);
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);
  });

  it('requires EW while honoring its user opt-in and the site chat-disable flag', async () => {
    setFlags({ 'ew.enabled': 'false' });
    await navigate(`#/${org}/legacy`);
    expect(sidenav.shadowRoot.querySelector('button')).to.equal(null);

    localStorage.setItem('nx2:ew-user-enabled', 'true');
    await navigate(`#/${org}/opt-in`);
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);

    setFlags({ 'ew.enabled': 'false', 'ew.disableChat': 'true' });
    await navigate(`#/${org}/opt-in-disabled`);
    expect(sidenav.shadowRoot.querySelector('button')).to.equal(null);
  });

  it('ignores a stale site disable flag after returning to org scope', async () => {
    const fetchDefault = window.fetch;
    let release;
    const delayed = new Promise((resolve) => { release = resolve; });
    window.fetch = (url, options) => {
      const href = url.toString();
      if (href.includes('/slow/') && !href.includes('/ping/')) return delayed;
      return fetchDefault(url, options);
    };
    const pending = navigate(`#/${org}/slow`);
    expect(sidenav._chatEnabled).to.equal(true);
    await navigate(`#/${org}`);
    release(new Response(JSON.stringify({
      flags: {
        data: [
          { key: 'ew.enabled', value: 'true' },
          { key: 'ew.disableChat', value: 'true' },
        ],
      },
    })));
    await pending;
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);
  });

  it('unsubscribes on disconnect and resolves the current org or site on reconnect', async () => {
    sidenav.remove();
    const checkCount = checks.length;
    await navigate(`#/${org}`);
    expect(checks).to.have.length(checkCount);
    document.body.append(sidenav);
    await checks.at(-1);
    await sidenav.updateComplete;
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);

    await navigate(`#/${org}/enabled`);
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);
    sidenav.remove();
    document.body.append(sidenav);
    await checks.at(-1);
    await sidenav.updateComplete;
    expect(sidenav.shadowRoot.querySelector('button')).not.to.equal(null);
  });
});
