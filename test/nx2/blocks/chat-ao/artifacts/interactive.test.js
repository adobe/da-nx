import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';
import { renderAssistantMessageBody } from '../../../../../nx2/blocks/chat-ao/renderers.js';

const FALLBACK = 'Read the proposal summary.';
const action = {
  event: { name: 'editor.viewDiff', context: { pagePath: { path: '/pages/home/path' } } },
};

function mount({ component = 'ActionButton', fields = {}, onAction } = {}) {
  const host = document.createElement('div');
  render(renderUiArtifact({
    id: 'proposal-artifact',
    textFallback: FALLBACK,
    components: [{ id: 'root', component, label: 'View diff', ...fields }],
  }, { onAction }), host);
  return host;
}

describe('artifact buttons', () => {
  it('supplies the owning artifact so hosts can resolve component references', () => {
    const artifact = {
      id: 'proposal',
      components: [
        { id: 'root', component: 'ActionButton', label: 'View diff', action },
        { id: 'proposal-path', component: 'Text', text: '/org/site/.da/index.html', visible: false },
      ],
    };
    const host = document.createElement('div');
    let received;
    render(renderUiArtifact(artifact, {
      onAction: (event, owner) => { received = { event, owner }; },
    }), host);
    host.querySelector('button').click();
    expect(received.owner).to.equal(artifact);
    expect(received.event.artifactId).to.equal(artifact.id);
    expect(host.textContent).not.to.include('/org/site/.da/index.html');
  });

  it('keeps named actions outside the host allowlist disabled', () => {
    const host = document.createElement('div');
    const artifact = {
      components: [{ id: 'root', component: 'ActionButton', label: 'View diff', action }],
    };
    let calls = 0;
    const onAction = () => { calls += 1; };
    render(renderUiArtifact(artifact, { onAction, actionNames: [] }), host);
    host.querySelector('button').click();
    expect(host.querySelector('button').disabled).to.equal(true);
    expect(calls).to.equal(0);
    render(renderUiArtifact(artifact, { onAction, actionNames: ['editor.viewDiff'] }), host);
    host.querySelector('button').click();
    expect(host.querySelector('button').disabled).to.equal(false);
    expect(calls).to.equal(1);
  });

  ['Button', 'ActionButton'].forEach((component) => {
    it(`renders ${component} labels safely and keeps buttons without actions disabled`, () => {
      const label = '<img src=x onerror=alert(1)>';
      const host = mount({ component, fields: { label, icon: 'Layers', tooltip: 'Review changes' } });
      const button = host.querySelector('button');
      expect(button.textContent.trim()).to.equal(label);
      expect(button.disabled).to.equal(true);
      expect(button.type).to.equal('button');
      expect(button.title).to.equal('Review changes');
      expect(button.querySelector('svg').getAttribute('aria-hidden')).to.equal('true');
      expect(button.querySelector('path').namespaceURI).to.equal('http://www.w3.org/2000/svg');
      expect(host.querySelector('img')).to.equal(null);
    });

    it(`passes ${component} named actions and identity to the host without resolving bindings`, () => {
      const calls = [];
      const host = mount({ component, fields: { action }, onAction: (value) => calls.push(value) });
      const button = host.querySelector('button');
      expect(button.disabled).to.equal(false);
      button.click();
      expect(calls).to.deep.equal([{
        artifactId: 'proposal-artifact',
        componentId: 'root',
        name: 'editor.viewDiff',
        context: { pagePath: { path: '/pages/home/path' } },
      }]);
      calls[0].context.pagePath.path = '/changed';
      expect(action.event.context.pagePath.path).to.equal('/pages/home/path');
    });

    it(`does not dispatch ${component} actions when disabled or without a host callback`, () => {
      let calls = 0;
      const host = mount({
        component, fields: { action, isDisabled: true }, onAction: () => { calls += 1; },
      });
      host.querySelector('button').click();
      expect(calls).to.equal(0);
      expect(mount({ component, fields: { action } }).querySelector('button').disabled).to.equal(true);
    });

    it(`supports ${component} icon-only accessible labels and literal visibility`, () => {
      const host = mount({
        component, fields: { label: '', ariaLabel: 'Reset page', icon: 'Delete' },
      });
      expect(host.querySelector('button').getAttribute('aria-label')).to.equal('Reset page');
      expect(mount({ component, fields: { visible: false } }).textContent.trim()).to.equal('');
    });
  });

  it('uses native anchors for safe Button URLs and removes navigation when disabled', () => {
    const fields = { href: 'https://example.com/preview', openInNewTab: true };
    const anchor = mount({ component: 'Button', fields }).querySelector('a');
    expect(anchor.getAttribute('href')).to.equal(fields.href);
    expect(anchor.target).to.equal('_blank');
    expect(anchor.rel).to.equal('noopener noreferrer');
    expect(mount({
      component: 'Button', fields: { ...fields, openInNewTab: false },
    }).querySelector('a').target).to.equal('_self');
    const disabled = mount({ component: 'Button', fields: { ...fields, isDisabled: true } });
    expect(disabled.querySelector('a')).to.equal(null);
    expect(disabled.querySelector('button').disabled).to.equal(true);
  });

  it('supports Button variants and ActionButton notification counts', () => {
    ['accent', 'genai', 'negative', 'premium', 'primary', 'secondary'].forEach((variant) => {
      const button = mount({ component: 'Button', fields: { variant } }).querySelector('button');
      expect(button.classList.contains(`ui-artifact-button-${variant}`)).to.equal(true);
    });
    expect(mount({ fields: { notificationBadge: 3 } })
      .querySelector('.ui-artifact-button-badge').textContent).to.equal('3');
  });

  it('rejects unsafe URLs, unsupported function calls and malformed action contexts', () => {
    [
      { href: '/relative' }, { href: 'data:text/html,test' },
      { href: 'https://[invalid' }, { href: { path: '/url' } },
      { href: 'https://example.com/', action },
      { action: { call: 'sendToChat', args: { text: 'Do something' } } },
      { action: null }, { action: { event: { name: '' } } },
      { action: { event: { name: 'editor.viewDiff', context: { page: '/home' } } } },
      { action: { event: { name: 'editor.viewDiff', context: { page: { path: '/x', call: 'bad' } } } } },
      { action: { event: { name: 'editor.viewDiff' }, call: 'bad' } },
      { label: '' }, { label: { path: '/title' } }, { type: 'submit' }, { type: 'reset' },
      { icon: '__proto__' }, { icon: '<svg>' }, { variant: 'unknown' },
      { isDisabled: 'false' }, { visible: { path: '/visible' } },
    ].forEach((fields) => {
      const host = mount({ component: 'Button', fields });
      expect(host.querySelector('.ui-artifact-fallback')?.textContent, JSON.stringify(fields))
        .to.equal(FALLBACK);
      expect(host.querySelector('button, a')).to.equal(null);
    });
  });

  it('rejects ActionButton navigation and invalid badges instead of ignoring them', () => {
    [{ href: 'https://example.com/' }, { notificationBadge: -1 }, { notificationBadge: { path: '/count' } }]
      .forEach((fields) => {
        expect(mount({ fields }).querySelector('.ui-artifact-fallback').textContent).to.equal(FALLBACK);
      });
  });

  it('updates the handler and disabled state without retaining stale actions', () => {
    const host = document.createElement('div');
    const components = [{ id: 'root', component: 'Button', label: 'Accept changes', action }];
    const calls = [];
    render(renderUiArtifact({ components }, { onAction: () => calls.push('old') }), host);
    render(renderUiArtifact({ components }, { onAction: () => calls.push('new') }), host);
    host.querySelector('button').click();
    expect(calls).to.deep.equal(['new']);
    render(renderUiArtifact({ components }), host);
    expect(host.querySelector('button').disabled).to.equal(true);
    host.querySelector('button').click();
    expect(calls).to.deep.equal(['new']);
  });
});

describe('artifact Divider and layout', () => {
  it('renders accessible horizontal and vertical separators and respects visibility', () => {
    ['horizontal', 'vertical'].forEach((orientation) => {
      const divider = mount({ component: 'Divider', fields: { orientation } })
        .querySelector('[role="separator"]');
      expect(divider.getAttribute('aria-orientation')).to.equal(orientation);
    });
    expect(mount({ component: 'Divider' }).querySelector('[role="separator"]')
      .getAttribute('aria-orientation')).to.equal('horizontal');
    expect(mount({ component: 'Divider', fields: { visible: false } }).textContent.trim()).to.equal('');
    [{ orientation: 'diagonal' }, { visible: 'false' }].forEach((fields) => {
      expect(mount({ component: 'Divider', fields }).querySelector('.ui-artifact-fallback').textContent)
        .to.equal(FALLBACK);
    });
  });

  ['Row', 'Column'].forEach((component) => {
    it(`applies ${component} layout fields from the supplied proposal JSON`, () => {
      const host = mount({
        component,
        fields: {
          width: 'full', gap: 8, padding: 16, align: 'center', justify: 'space-between', wrap: 'wrap',
        },
      });
      const { style } = host.querySelector(`.ui-artifact-${component.toLowerCase()}`);
      expect(style.width).to.equal('100%');
      expect(style.gap).to.equal('8px');
      expect(style.padding).to.equal('16px');
      expect(style.alignItems).to.equal('center');
      expect(style.justifyContent).to.equal('space-between');
      expect(style.flexWrap).to.equal('wrap');
    });

    it(`rejects invalid ${component} layout values and does not apply arbitrary CSS`, () => {
      [
        { width: '100%;position:fixed' }, { width: 0 }, { width: Infinity },
        { gap: -1 }, { padding: { path: '/padding' } }, { gap: 3 },
        { align: 'unknown' }, { justify: 'unknown' }, { wrap: 'unknown' },
      ].forEach((fields) => {
        expect(mount({ component, fields }).querySelector('.ui-artifact-fallback').textContent)
          .to.equal(FALLBACK);
      });
      const host = mount({ component, fields: { style: { position: 'fixed' } } });
      expect(host.querySelector(`.ui-artifact-${component.toLowerCase()}`).style.position).to.equal('');
    });
  });

  it('clears inline layout overrides on rerender so default spacing is restored', () => {
    const host = document.createElement('div');
    const update = (fields) => render(renderUiArtifact({
      components: [{ id: 'root', component: 'Row', ...fields }],
    }), host);
    update({ width: 320, padding: 0, gap: 4 });
    expect(host.querySelector('.ui-artifact-row').style.width).to.equal('320px');
    expect(host.querySelector('.ui-artifact-row').style.padding).to.equal('0px');
    update({});
    expect(host.querySelector('.ui-artifact-row').getAttribute('style')).to.equal('');
  });
});

describe('proposal artifact composition', () => {
  it('renders all requested component types and routes nested actions through the assistant renderer', () => {
    const calls = [];
    const components = [
      {
        id: 'root', component: 'Column', width: 'full', padding: 16, gap: 8, children: ['header', 'divider', 'entry', 'accept'],
      },
      { id: 'header', component: 'Row', align: 'center', justify: 'space-between', children: ['title', 'count', 'collapse'] },
      { id: 'title', component: 'Text', text: 'Proposed changes', style: 'heading', size: 'sm' },
      {
        id: 'count', component: 'Badge', label: '1 of 1 included', variant: 'informative', fillStyle: 'subtle', size: 'S',
      },
      { id: 'collapse', component: 'ActionButton', label: 'Collapse', icon: 'ViewList' },
      { id: 'divider', component: 'Divider' },
      { id: 'entry', component: 'Column', gap: 4, children: ['page-title', 'path', 'actions'] },
      { id: 'page-title', component: 'Text', text: 'Home', style: 'ui', size: 'sm' },
      {
        id: 'path', component: 'Text', text: '/index.html', style: 'detail', size: 'xs', wrap: 'truncate',
      },
      { id: 'actions', component: 'Row', gap: 8, children: ['preview', 'diff', 'reset'] },
      {
        id: 'preview', component: 'Link', label: 'Preview', href: 'https://example.com/', openInNewTab: true, isQuiet: true,
      },
      { id: 'diff', component: 'ActionButton', label: 'View diff', icon: 'Layers', action },
      { id: 'reset', component: 'ActionButton', label: 'Reset page', icon: 'Delete' },
      { id: 'accept', component: 'Button', label: 'Accept changes', variant: 'accent' },
    ];
    const host = document.createElement('div');
    render(renderAssistantMessageBody({
      uiArtifact: { id: 'proposal', components },
    }, { onArtifactAction: (value) => calls.push(value) }), host);
    expect(host.querySelector('.ui-artifact-fallback')).to.equal(null);
    expect(host.querySelectorAll('button')).to.have.length(4);
    expect(host.querySelectorAll('button:disabled')).to.have.length(3);
    expect(host.querySelector('a').target).to.equal('_blank');
    expect(host.querySelector('h3').textContent).to.equal('Proposed changes');
    host.querySelector('button:not(:disabled)').click();
    expect(calls[0]).to.include({ artifactId: 'proposal', componentId: 'diff', name: 'editor.viewDiff' });
  });

  it('also routes named events from legacy nested components', () => {
    const calls = [];
    const host = document.createElement('div');
    render(renderUiArtifact({
      components: [{
        type: 'Column',
        children: [{
          id: 'legacy-button', type: 'ActionButton', props: { label: 'View diff', action },
        }],
      }],
    }, { onAction: (value) => calls.push(value) }), host);
    host.querySelector('button').click();
    expect(calls[0]).to.include({ componentId: 'legacy-button', name: 'editor.viewDiff' });
  });
});
