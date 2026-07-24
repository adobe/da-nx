import { expect } from '@esm-bundle/chai';
import {
  registerPanelSection,
  getSectionAtPosition,
  wasPanelOpen,
  PANEL_EVENT,
} from '../../../nx2/utils/panel.js';

const PANEL_STORAGE_KEY = 'nx-panels';

// createPanel() mounts asides relative to `main`, and setPanelsGrid() reads
// document.head — neither exists by default in the test page.
before(() => {
  if (!document.querySelector('main')) document.body.append(document.createElement('main'));
});

// panelSections is a module-level registry that's never cleared (no
// unregister API), so it accumulates entries across every test in this file.
// Assertions below only ever check "did *my* registered section's onShow
// fire", never "is this the only aside in the DOM" — that stays robust to
// whatever else has been registered by earlier tests.
afterEach(() => {
  document.querySelectorAll('aside.panel').forEach((el) => el.remove());
  localStorage.removeItem(PANEL_STORAGE_KEY);
});

function flush() {
  return new Promise((r) => { setTimeout(r, 0); });
}

describe('getSectionAtPosition', () => {
  // Must run before anything else in this file registers a section, since
  // the registry only ever grows.
  it('returns undefined when no section is registered at a position', () => {
    expect(getSectionAtPosition('before')).to.be.undefined;
    expect(getSectionAtPosition('after')).to.be.undefined;
  });

  it('returns the section name registered at a given position', () => {
    registerPanelSection('gsap-chat', {
      position: 'before',
      getContent: async () => document.createElement('div'),
    });
    registerPanelSection('gsap-tools', {
      position: 'after',
      getContent: async () => document.createElement('div'),
    });
    expect(getSectionAtPosition('before')).to.equal('gsap-chat');
    expect(getSectionAtPosition('after')).to.equal('gsap-tools');
  });
});

describe('wasPanelOpen', () => {
  it('returns false when nothing is persisted for that section', () => {
    expect(wasPanelOpen('chat')).to.be.false;
  });

  it('returns true for a persisted entry', () => {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ chat: { width: '400px' } }));
    expect(wasPanelOpen('chat')).to.be.true;
  });
});

describe('PANEL_EVENT wiring', () => {
  it('opens the named section and forwards id/options to its onShow', async () => {
    const calls = [];
    registerPanelSection('event-open', {
      position: 'before',
      getContent: async () => document.createElement('div'),
      onShow: (aside, id, options) => calls.push({ aside, id, options }),
    });

    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, {
      detail: { section: 'event-open', id: 'my-id', options: { text: 'hi' } },
    }));
    await flush();

    expect(calls.length).to.equal(1);
    expect(calls[0].id).to.equal('my-id');
    expect(calls[0].options).to.deep.equal({ text: 'hi' });
    expect(calls[0].aside).to.exist;
  });

  it('is a no-op when the section name is not registered', async () => {
    // No throw expected — just confirming an unknown section is silently ignored.
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, {
      detail: { section: 'does-not-exist' },
    }));
    await flush();
    expect(document.querySelectorAll('aside.panel').length).to.equal(0);
  });

  it('closes the named section, hiding its aside', async () => {
    registerPanelSection('event-close', {
      position: 'after',
      getContent: async () => document.createElement('div'),
    });

    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, {
      detail: { section: 'event-close' },
    }));
    await flush();
    const aside = document.querySelector('aside.panel[data-position="after"]');
    expect(aside.hidden).to.be.false;

    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, {
      detail: { section: 'event-close' },
    }));
    await flush();
    expect(aside.hidden).to.be.true;
  });

  it('persists and clears state under the section name, not position', async () => {
    registerPanelSection('event-persist', {
      position: 'before',
      getContent: async () => document.createElement('div'),
    });

    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, {
      detail: { section: 'event-persist' },
    }));
    await flush();

    expect(wasPanelOpen('event-persist')).to.be.true;
    const aside = document.querySelector('aside.panel[data-position="before"]');
    expect(aside.dataset.section).to.equal('event-persist');

    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, {
      detail: { section: 'event-persist' },
    }));
    await flush();

    expect(wasPanelOpen('event-persist')).to.be.false;
  });
});
