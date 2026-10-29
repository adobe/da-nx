import { expect } from '@esm-bundle/chai';
import {
  registerPanelSection,
  subscribePanelSections,
  subscribePanelVisibility,
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

  it('shares a pending open without duplicating content or losing per-request options', async () => {
    let release;
    let loaded = 0;
    const content = document.createElement('div');
    const pending = new Promise((resolve) => { release = resolve; });
    const calls = [];
    registerPanelSection('event-concurrent', {
      position: 'before',
      getContent: () => {
        loaded += 1;
        return pending;
      },
      onShow: (aside, id) => calls.push({ aside, id }),
    });

    ['first', 'second'].forEach((id) => {
      document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, {
        detail: { section: 'event-concurrent', id },
      }));
    });
    expect(loaded).to.equal(1);
    expect(document.querySelector('aside.panel')).to.equal(null);
    release(content);
    await flush();

    const panels = document.querySelectorAll('aside.panel');
    expect(panels).to.have.length(1);
    expect(panels[0].querySelector('.panel-body').firstElementChild).to.equal(content);
    expect(calls.map(({ id }) => id)).to.have.members(['first', 'second']);
    expect(calls.every(({ aside }) => aside === panels[0])).to.equal(true);

    document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, {
      detail: { section: 'event-concurrent' },
    }));
    expect(panels[0].hidden).to.equal(true);
    document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, {
      detail: { section: 'event-concurrent', id: 'reopen' },
    }));
    await flush();
    expect(panels[0].hidden).to.equal(false);
    expect(calls.at(-1)).to.deep.equal({ aside: panels[0], id: 'reopen' });
    expect(loaded).to.equal(1);
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

describe('subscribePanelSections', () => {
  it('immediately reports existing sections and notifies on registration', () => {
    const calls = [];
    registerPanelSection('observer-existing', { position: 'before' });
    const unsubscribe = subscribePanelSections((sections) => calls.push(sections));
    try {
      expect(calls).to.have.length(1);
      expect(calls[0]).to.include('observer-existing');
      registerPanelSection('observer-added', { position: 'after' });
      expect(calls).to.have.length(2);
      expect(calls[1]).to.include('observer-added');
      expect(calls[0]).not.to.include('observer-added');
    } finally {
      unsubscribe();
    }
  });

  describe('subscribePanelVisibility', () => {
    it('reports restoration separately from actual visibility, including for late subscribers', async () => {
      localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({
        restoration: { width: '400px' },
      }));
      let release;
      const content = new Promise((resolve) => { release = resolve; });
      registerPanelSection('restoration', {
        position: 'before',
        getContent: () => content,
      });
      const calls = [];
      const unsubscribe = subscribePanelVisibility((visible, restoring) => {
        calls.push({ visible, restoring });
      });
      try {
        expect(calls).to.deep.equal([{ visible: [], restoring: [] }]);
        document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, {
          detail: { section: 'restoration' },
        }));
        expect(calls.at(-1)).to.deep.equal({ visible: [], restoring: ['restoration'] });

        const late = [];
        const unsubscribeLate = subscribePanelVisibility((visible, restoring) => {
          late.push({ visible, restoring });
        });
        unsubscribeLate();
        expect(late).to.deep.equal([{ visible: [], restoring: ['restoration'] }]);

        release(document.createElement('div'));
        await flush();
        expect(calls.at(-1)).to.deep.equal({ visible: ['restoration'], restoring: [] });
      } finally {
        unsubscribe();
      }
    });

    it('reports actual visibility on open, close and reopen and stops after unsubscribe', async () => {
      const calls = [];
      const unsubscribe = subscribePanelVisibility((sections) => calls.push(sections));
      try {
        registerPanelSection('visibility', {
          position: 'before',
          getContent: async () => document.createElement('div'),
        });
        expect(calls).to.deep.equal([[]]);

        document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, {
          detail: { section: 'visibility' },
        }));
        await flush();
        expect(calls).to.deep.equal([[], ['visibility']]);

        const current = [];
        const unsubscribeCurrent = subscribePanelVisibility((sections) => current.push(sections));
        unsubscribeCurrent();
        expect(current).to.deep.equal([['visibility']]);

        const aside = document.querySelector('aside.panel[data-section="visibility"]');
        aside.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE));
        expect(calls).to.deep.equal([[], ['visibility'], []]);

        document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, {
          detail: { section: 'visibility' },
        }));
        await flush();
        expect(calls).to.deep.equal([[], ['visibility'], [], ['visibility']]);

        unsubscribe();
        document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, {
          detail: { section: 'visibility' },
        }));
        expect(calls).to.have.length(4);
      } finally {
        unsubscribe();
      }
    });
  });

  it('stops notifying after unsubscribe and does not expose the registry to mutation', () => {
    const calls = [];
    const unsubscribe = subscribePanelSections((sections) => {
      calls.push(sections);
      sections.length = 0;
    });
    unsubscribe();
    registerPanelSection('observer-unsubscribed', { position: 'after' });
    expect(calls).to.have.length(1);
    const unsubscribeNext = subscribePanelSections((sections) => {
      expect(sections).to.include('observer-unsubscribed');
    });
    unsubscribeNext();
  });
});
