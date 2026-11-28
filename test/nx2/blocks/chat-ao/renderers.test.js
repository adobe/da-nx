import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderMessages as renderAoMessages, renderPermissionCard } from '../../../../nx2/blocks/chat-ao/renderers.js';
import { renderMessages as renderChatMessages } from '../../../../nx2/blocks/chat/renderers/renderers.js';
import { getResponseCopies } from '../../../../nx2/blocks/shared/chat/copy-button.js';

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

  [
    ['governance__bga_create_brand_context_rule', 'Governance Bga Create Brand Context Rule'],
    ['read_file', 'Reading file'],
    ['bash', 'Running command'],
    ['constructor', 'constructor'],
    ['readFile', 'readFile'],
    ['read file', 'read file'],
    ['read_file content', 'read_file content'],
    [' read_file', ' read_file'],
    ['read_file ', 'read_file '],
    ['read_file\tcontent', 'read_file\tcontent'],
  ].forEach(([toolName, label]) => {
    it(`shows a human-readable approval label for ${toolName} and retains the identifier`, () => {
      const decisions = [];
      const host = mount({
        calls: [{ toolCallId: 'tc1', toolName }],
        decisions: {},
      }, (id, approved) => decisions.push({ id, approved }));
      const tool = host.querySelector('.permission-row-tool');
      expect(tool.textContent).to.equal(label);
      expect(tool.title).to.equal(toolName);
      host.querySelector('.permission-approve-btn').click();
      expect(decisions).to.deep.equal([{ id: 'tc1', approved: true }]);
    });
  });

  it('Escape rejects, regardless of which element (or none) currently has focus', () => {
    const decisions = [];
    const host = mount(pending, (id, approved) => decisions.push({ id, approved }));
    host.querySelector('.permission-row-buttons')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(decisions).to.deep.equal([{ id: 'tc1', approved: false }]);
  });

  describe('renderPermissionCard details', () => {
    let host;

    afterEach(() => host?.remove());

    [{ content: '<main>Full page HTML</main>' }, 'Raw tool arguments'].forEach((args) => {
      it(`hides ${typeof args} arguments until Details is expanded`, () => {
        const decisions = [];
        host = mount({
          calls: [{ toolCallId: 'tc1', toolName: 'some_tool', arguments: args }],
          decisions: {},
        }, (id, approved) => decisions.push({ id, approved }));
        document.body.append(host);

        const details = host.querySelector('details');
        const summary = details.querySelector('summary');
        const detail = details.querySelector('.permission-row-detail');
        expect(summary.textContent).to.equal('Details');
        const chevron = summary.firstElementChild;
        expect(chevron.tagName).to.equal('svg');
        expect(chevron.getAttribute('aria-hidden')).to.equal('true');
        expect(chevron.querySelector('use').getAttribute('href'))
          .to.match(/\/img\/icons\/s2-icon-chevronleft-10-n\.svg#icon$/);
        expect(chevron.nextSibling.textContent).to.equal('Details');
        expect(details.open).to.equal(false);
        expect(detail.checkVisibility()).to.equal(false);
        expect(host.querySelector('.permission-row-tool').textContent).to.equal('Some Tool');
        expect(host.querySelectorAll('.permission-row-buttons button').length).to.equal(2);

        summary.click();
        expect(details.open).to.equal(true);
        expect(detail.checkVisibility()).to.equal(true);
        if (typeof args === 'string') {
          expect(detail.textContent).to.equal(args);
        } else {
          expect(detail.querySelector('dt').textContent).to.equal('content');
          expect(detail.querySelector('dd').textContent).to.equal(args.content);
          expect(detail.querySelector('main')).to.equal(null);
        }
        expect(decisions).to.deep.equal([]);

        summary.click();
        expect(details.open).to.equal(false);
        expect(detail.checkVisibility()).to.equal(false);
        host.querySelector('.permission-approve-btn').click();
        expect(decisions).to.deep.equal([{ id: 'tc1', approved: true }]);
      });
    });

    [false, true].forEach((serialized) => {
      it(`renders ${serialized ? 'JSON-encoded' : 'object'} arguments as labeled values`, () => {
        const args = {
          brand_id: 'brand-123',
          name: 'No green bananas',
          count: 0,
          enabled: false,
          empty: '',
          missing: null,
          nested: { rule: 'Do not mention green bananas.' },
          categories: ['claims', 'content'],
        };
        host = mount({
          calls: [{
            toolCallId: 'tc1',
            toolName: 'some_tool',
            arguments: serialized ? JSON.stringify(args) : args,
          }],
          decisions: {},
        }, () => {});

        expect([...host.querySelectorAll('dt')].map((el) => el.textContent))
          .to.deep.equal(Object.keys(args));
        expect([...host.querySelectorAll('dd')].map((el) => el.textContent))
          .to.deep.equal([
            'brand-123', 'No green bananas', '0', 'false', '', 'null',
            '{\n  "rule": "Do not mention green bananas."\n}',
            '[\n  "claims",\n  "content"\n]',
          ]);
        expect(host.querySelector('details').open).to.equal(false);
      });
    });

    ['{"incomplete":', 'null', '42', '["one","two"]'].forEach((args) => {
      it(`preserves non-object or invalid JSON arguments: ${args}`, () => {
        host = mount({
          calls: [{ toolCallId: 'tc1', toolName: 'some_tool', arguments: args }],
          decisions: {},
        }, () => {});
        expect(host.querySelector('.permission-row-detail').textContent).to.equal(args);
        expect(host.querySelector('dl')).to.equal(null);
      });
    });

    it('omits Details when there are no arguments', () => {
      host = mount({
        calls: [{ toolCallId: 'tc1', toolName: 'some_tool' }],
        decisions: {},
      }, () => {});
      expect(host.querySelector('details')).to.equal(null);
      expect(host.querySelectorAll('.permission-row-buttons button').length).to.equal(2);
    });

    it('centers the chevron and keeps the disclosure close to the title', async () => {
      host = mount({
        calls: [{ toolCallId: 'tc1', toolName: 'some_tool', arguments: { content: 'Page HTML' } }],
        decisions: {},
      }, () => {});
      const style = document.createElement('style');
      style.textContent = await (await fetch('/nx2/blocks/chat-ao/chat-ao.css')).text();
      host.append(style);
      host.style.setProperty('--s2-spacing-100', '8px');
      document.body.append(host);

      const summary = host.querySelector('summary');
      const summaryRect = summary.getBoundingClientRect();
      const chevronRect = summary.querySelector('svg').getBoundingClientRect();
      const titleRect = host.querySelector('.permission-row-tool').getBoundingClientRect();
      expect(summaryRect.top - titleRect.bottom).to.equal(8);
      expect(chevronRect.top + chevronRect.height / 2)
        .to.be.closeTo(summaryRect.top + summaryRect.height / 2, 0.5);
      expect(getComputedStyle(summary).paddingTop).to.equal('0px');
      expect(getComputedStyle(summary).paddingBottom).to.equal('0px');

      const chevron = summary.querySelector('svg');
      const collapsed = new DOMMatrix(getComputedStyle(chevron).transform);
      expect(collapsed.a).to.be.closeTo(1, 0.001);
      expect(collapsed.b).to.be.closeTo(0, 0.001);

      summary.click();
      const expanded = new DOMMatrix(getComputedStyle(chevron).transform);
      expect(expanded.a).to.be.closeTo(0, 0.001);
      expect(expanded.b).to.be.closeTo(1, 0.001);
    });

    it('does not preserve template whitespace around structured details', async () => {
      host = mount({
        calls: [{
          toolCallId: 'tc1',
          toolName: 'some_tool',
          arguments: { rule: 'First line\nSecond line' },
        }],
        decisions: {},
      }, () => {});
      const style = document.createElement('style');
      style.textContent = await (await fetch('/nx2/blocks/chat-ao/chat-ao.css')).text();
      host.append(style);
      host.style.setProperty('--s2-spacing-100', '8px');
      document.body.append(host);
      host.querySelector('summary').click();

      const summaryRect = host.querySelector('summary').getBoundingClientRect();
      const listRect = host.querySelector('dl').getBoundingClientRect();
      const detailRect = host.querySelector('.permission-row-detail').getBoundingClientRect();
      expect(listRect.top - summaryRect.bottom).to.equal(8);
      expect(detailRect.bottom - listRect.bottom).to.equal(8);
      expect(getComputedStyle(host.querySelector('dd')).whiteSpace).to.equal('pre-wrap');
      expect(host.querySelector('dd').textContent).to.equal('First line\nSecond line');
    });
  });

  [
    ['AO', renderAoMessages, {
      role: 'assistant',
      toolCall: { toolCallId: 'tool-1', toolName: 'search', status: 'success', result: 'Private tool output' },
    }],
    ['classic', renderChatMessages, {
      toolCard: { toolName: 'search', detail: 'Private tool output', state: 'done' },
    }],
  ].forEach(([name, renderMessages, activity]) => {
    describe(`${name} assistant response copy`, () => {
      const user = (content) => ({ role: 'user', content });
      const assistant = (content) => ({ role: 'assistant', content });
      let writeText;
      let copied;

      beforeEach(() => {
        copied = [];
        writeText = navigator.clipboard.writeText;
        navigator.clipboard.writeText = async (text) => { copied.push(text); };
      });

      afterEach(() => {
        navigator.clipboard.writeText = writeText;
      });

      it('copies all assistant text once after the final activity, excluding user and tool content', () => {
        const host = document.createElement('div');
        render(renderMessages({
          messages: [
            user('Find my files'),
            assistant('I will **search** for your files.'),
            activity,
            assistant('Found [your file](https://example.com/file).'),
            activity,
          ],
        }), host);
        const buttons = host.querySelectorAll('.message-action-copy');
        expect(buttons).to.have.length(1);
        expect(host.lastElementChild.contains(buttons[0])).to.equal(true);
        buttons[0].click();
        expect(copied).to.deep.equal([
          'I will **search** for your files.\n\nFound [your file](https://example.com/file).',
        ]);
      });

      it('waits for the whole response, not an individual text chunk, to finish', () => {
        const host = document.createElement('div');
        const messages = [user('Search'), assistant('Starting the search.'), activity];
        render(renderMessages({ messages, thinking: true }), host);
        expect(host.querySelector('.message-action-copy')).to.equal(null);
        render(renderMessages({
          messages: [...messages, { ...assistant('Found'), streaming: true }],
        }), host);
        expect(host.querySelector('.message-action-copy')).to.equal(null);
        render(renderMessages({
          messages: [...messages, assistant('Found everything.')], thinking: true,
        }), host);
        expect(host.querySelector('.message-action-copy')).to.equal(null);
        render(renderMessages({ messages: [...messages, assistant('Found everything.')] }), host);
        expect(host.querySelectorAll('.message-action-copy')).to.have.length(1);
        host.querySelector('.message-action-copy').click();
        expect(copied).to.deep.equal(['Starting the search.\n\nFound everything.']);
      });

      it('keeps earlier responses copyable while the next response is in progress', () => {
        const host = document.createElement('div');
        const messages = [
          user('First question'), assistant('First answer.'),
          user('Second question'), assistant('Second answer.'), activity,
        ];
        render(renderMessages({ messages, thinking: true }), host);
        expect(host.querySelectorAll('.message-action-copy')).to.have.length(1);
        host.querySelector('.message-action-copy').click();
        expect(copied).to.deep.equal(['First answer.']);
        render(renderMessages({ messages }), host);
        expect(host.querySelectorAll('.message-action-copy')).to.have.length(2);
        host.querySelectorAll('.message-action-copy')[1].click();
        expect(copied).to.deep.equal(['First answer.', 'Second answer.']);
      });

      it('does not offer an empty copy action for tool-only or empty responses', () => {
        const host = document.createElement('div');
        render(renderMessages({ messages: [user('Search'), activity] }), host);
        expect(host.querySelector('.message-action-copy')).to.equal(null);
        expect(getResponseCopies({ messages: [user('Search'), assistant('  ')] }).size).to.equal(0);
      });

      it('supports restored response history and a single assistant greeting', () => {
        const host = document.createElement('div');
        render(renderMessages({ messages: [assistant('Welcome!')] }), host);
        host.querySelector('.message-action-copy').click();
        expect(copied).to.deep.equal(['Welcome!']);
        render(renderMessages({
          messages: [user('Search'), activity, assistant('First paragraph.'), assistant('Last paragraph.')],
        }), host);
        expect(host.querySelectorAll('.message-action-copy')).to.have.length(1);
        host.querySelector('.message-action-copy').click();
        expect(copied).to.deep.equal(['Welcome!', 'First paragraph.\n\nLast paragraph.']);
      });
    });
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
