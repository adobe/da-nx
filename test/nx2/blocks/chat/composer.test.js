import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../nx2/scripts/nx.js';
import { loadStyle } from '../../../../nx2/utils/utils.js';

await setConfig({ hostnames: [] });
await import('../../../../nx2/blocks/chat-ao/input.js');

const [tokens, inputStyle, composerStyle] = await Promise.all([
  '../../../../nx2/styles/styles.css',
  '../../../../nx2/blocks/shared/chat/input.css',
  '../../../../nx2/blocks/shared/chat/composer.css',
].map((path) => loadStyle(new URL(path, import.meta.url).href)));

describe('shared expanded composer skin', () => {
  let host;
  let frame;
  let surface;
  let input;

  before(() => {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, tokens];
  });

  after(() => {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== tokens);
  });

  beforeEach(async () => {
    host = document.createElement('div');
    host.style.width = '664px';
    const root = host.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [inputStyle, composerStyle];
    root.innerHTML = `<div class="nx-chat-composer is-enabled">
      <div class="nx-chat-composer-surface" aria-hidden="true"></div>
      <nx-ao-input variant="expanded" showinputstatus></nx-ao-input>
    </div>`;
    document.body.append(host);
    frame = root.querySelector('.nx-chat-composer');
    surface = root.querySelector('.nx-chat-composer-surface');
    input = root.querySelector('nx-ao-input');
    await input.updateComplete;
  });

  afterEach(() => host.remove());

  it('preserves actual expanded S/M input sizes without affecting an unframed sibling', async () => {
    const unframed = document.createElement('div');
    host.shadowRoot.append(unframed);
    expect(getComputedStyle(unframed).padding).to.equal('0px');
    expect(frame.getBoundingClientRect().width).to.equal(664);
    expect(frame.getBoundingClientRect().height).to.equal(109);
    expect(getComputedStyle(frame).borderRadius).to.equal('24px');
    expect(getComputedStyle(frame, '::before').borderRadius).to.equal('30px');
    await input.setPrompt('Keep this draft');
    input.size = 'm';
    await input.updateComplete;
    expect(frame.getBoundingClientRect().height).to.equal(123);
    expect(input.shadowRoot.querySelector('.chat-send').getBoundingClientRect().width).to.equal(40);
    expect(input.draft).to.equal('Keep this draft');
    expect(getComputedStyle(frame).padding).to.equal('16px');
  });

  it('retains the themed ready and working artwork with independent shadow overrides', async () => {
    for (const scheme of ['light', 'dark']) {
      host.style.colorScheme = scheme;
      frame.className = 'nx-chat-composer is-enabled';
      expect(getComputedStyle(surface).backgroundImage).to.include('rgba(235, 238, 255, 0.16)');
      expect(getComputedStyle(surface, '::before').opacity).to.equal('0.12');
      expect(getComputedStyle(frame, '::after').opacity).to.equal('0.32');
      frame.className = 'nx-chat-composer is-processing';
      host.style.setProperty('--nx-chat-composer-working-shadow', 'none');
      expect(getComputedStyle(surface).boxShadow).to.equal('none');
      expect(getComputedStyle(frame, '::after').content).to.equal('""');
      frame.className = 'nx-chat-composer is-enabled';
      expect(getComputedStyle(surface).boxShadow).not.to.equal('none');
    }
  });

  it('scales expanded context pills without losing the draft or selection', async () => {
    await input.setPrompt('Keep this draft');
    input.addItem({ id: 'selection', label: 'Selected content' });
    const pills = input.shadowRoot.querySelector('nx-pills');
    await pills.updateComplete;
    expect(getComputedStyle(pills.shadowRoot.querySelector('.pill-label')).fontSize).to.equal('12px');
    input.size = 'm';
    await input.updateComplete;
    await pills.updateComplete;
    expect(getComputedStyle(pills.shadowRoot.querySelector('.pill-label')).fontSize).to.equal('14px');
    expect(input.draft).to.equal('Keep this draft');
    expect(input.items.map((item) => item.id)).to.deep.equal(['selection']);
  });

  it('shows a focus outline across the input shadow boundary in both themes without resizing', async () => {
    for (const scheme of ['light', 'dark']) {
      host.style.colorScheme = scheme;
      input.shadowRoot.querySelector('textarea').blur();
      expect(getComputedStyle(surface).outlineStyle).to.equal('none');
      const { width, height } = frame.getBoundingClientRect();
      await input.focusInput();
      const focused = getComputedStyle(surface);
      expect(focused.outlineStyle).to.equal('solid');
      expect(focused.outlineWidth).to.equal('2px');
      expect(focused.outlineOffset).to.equal('-2px');
      expect(frame.getBoundingClientRect().width).to.equal(width);
      expect(frame.getBoundingClientRect().height).to.equal(height);
    }
  });

  it('preserves focus and drop states and lets hosts override frame geometry', async () => {
    await input.focusInput();
    expect(getComputedStyle(frame, '::before').backdropFilter).to.equal('none');
    expect(getComputedStyle(frame, '::after').content).to.equal('none');
    frame.classList.add('is-dropzone');
    expect(getComputedStyle(surface).borderTopWidth).to.equal('2px');
    expect(getComputedStyle(surface).borderColor).to.equal('rgb(122, 106, 253)');
    expect(getComputedStyle(surface, '::before').content).to.equal('none');
    host.style.setProperty('--nx-chat-composer-radius', '20px');
    expect(getComputedStyle(frame).borderRadius).to.equal('20px');
    expect(getComputedStyle(frame, '::before').borderRadius).to.equal('26px');
  });
});
