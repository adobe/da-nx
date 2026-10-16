import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderPermissionCard, renderUserMessageBody, renderAssistantMessageBody } from '../../../../nx2/blocks/chat-ao/renderers.js';

function mount(pending, onDecide) {
  const host = document.createElement('div');
  render(renderPermissionCard(pending, { onDecide }), host);
  return host;
}

describe('renderPermissionCard keydown', () => {
  const pending = {
    calls: [{ toolCallId: 'tc1', toolName: 'some_tool', arguments: {} }],
    decisions: {},
  };

  it('Escape rejects, regardless of which element (or none) currently has focus', () => {
    const decisions = [];
    const host = mount(pending, (id, approved) => decisions.push({ id, approved }));
    host.querySelector('.permission-row-buttons')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(decisions).to.deep.equal([{ id: 'tc1', approved: false }]);
  });

  it('does not intercept Enter at the wrapper — leaves it to native per-button activation', () => {
    const decisions = [];
    const host = mount(pending, (id, approved) => decisions.push({ id, approved }));
    host.querySelector('.permission-row-buttons')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(decisions).to.deep.equal([]);
  });

  it('ignores keys other than Enter/Escape', () => {
    const decisions = [];
    const host = mount(pending, (id, approved) => decisions.push({ id, approved }));
    host.querySelector('.permission-row-buttons')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    expect(decisions).to.deep.equal([]);
  });
});

describe('renderUserMessageBody', () => {
  const body = (msg) => {
    const host = document.createElement('div');
    render(renderUserMessageBody(msg), host);
    return host;
  };

  it('renders a plain message as it was', () => {
    const host = body({ role: 'user', content: 'Evaluate this page <b>now</b>' });
    expect(host.querySelector('.message-content').textContent.trim()).to.equal('Evaluate this page <b>now</b>');
    expect(host.querySelector('details')).to.equal(null);
  });

  it('shows only the title of an action message and keeps the instruction collapsed behind it', () => {
    const content = 'Hero failure: Generate suggestion\n<!--nx:details-->\n/aem-governance-element-suggestions\nElement: Hero';
    const host = body({ role: 'user', content });
    const details = host.querySelector('details.action-message.message-content');
    expect(details.open).to.equal(false);
    expect(details.querySelector('summary').textContent.trim()).to.equal('Hero failure: Generate suggestion');
    expect(details.querySelector('.action-message-body').textContent).to.equal('/aem-governance-element-suggestions\nElement: Hero');
    expect(host.textContent).to.not.contain('nx:details');
  });

  it('renders a restored message (same stored text) exactly like a live one', () => {
    const content = 'Title\n<!--nx:details-->\nbody';
    const live = body({ role: 'user', content, selectionContext: undefined });
    const restored = body({ role: 'user', content });
    expect(restored.innerHTML).to.equal(live.innerHTML);
  });
});

describe('renderAssistantMessageBody artifacts', () => {
  it('hands the artifact context to page-evaluation cards', async () => {
    const msg = {
      role: 'assistant',
      uiArtifact: { components: [{ id: 'root', component: 'PageEvaluationWithIcons', title: 'T', sections: [] }] },
    };
    const host = document.createElement('div');
    document.body.append(host);
    render(renderAssistantMessageBody(msg, { artifactCtx: { evaluatedUrl: 'https://example.com/x', busy: true } }), host);
    const card = host.querySelector('nx-page-eval');
    expect(card.evaluatedUrl).to.equal('https://example.com/x');
    expect(card.busy).to.equal(true);
    expect(card.evalKey).to.equal('example.com/x');
    host.remove();
  });
});
