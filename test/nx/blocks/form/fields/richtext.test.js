import { expect } from '@esm-bundle/chai';
import * as pm from './mocks/pm.js';
import FormRichtext from '../../../../../nx/blocks/form/fields/richtext.js';

const tick = () => new Promise((resolve) => { requestAnimationFrame(resolve); });

const until = (check, tries = 100) => (check() || !tries
  ? Promise.resolve()
  : new Promise((resolve) => { setTimeout(resolve, 20); }).then(() => until(check, tries - 1)));

async function mount({ value = '', loader = async () => pm, width, ...props } = {}) {
  FormRichtext.loadProseMirror = loader;
  const el = document.createElement('form-richtext');
  Object.assign(el, { value, ...props });
  if (width) el.style.width = width;
  document.body.append(el);
  await el.updateComplete;
  await tick();
  await el.updateComplete;
  return el;
}

const content = (el) => el.shadowRoot.querySelector('.form-richtext-content');
const tool = (el, id) => el.shadowRoot.querySelector(`[data-tool="${id}"]`);

function selectAll(el) {
  const view = el._view;
  const { doc } = view.state;
  view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(doc, 1, doc.content.size - 1)));
}

describe('form-richtext', () => {
  afterEach(() => {
    document.body.querySelectorAll('form-richtext').forEach((el) => el.remove());
  });

  it('renders the value into an accessible editor', async () => {
    const el = await mount({ value: '<p>Hello <strong>world</strong></p>', label: 'Body' });
    const editor = content(el);
    expect(editor.getAttribute('contenteditable')).to.equal('true');
    expect(editor.getAttribute('role')).to.equal('textbox');
    expect(editor.getAttribute('aria-labelledby')).to.equal('form-richtext-label');
    expect(editor.innerHTML).to.contain('<strong>world</strong>');
  });

  it('emits canonical HTML on input without resetting the editor', async () => {
    const el = await mount({ value: '<p>Hi</p>' });
    let emitted;
    el.addEventListener('input', (e) => { emitted = e.target.value; });
    const view = el._view;
    view.dispatch(view.state.tr.insertText('!', 3));
    expect(emitted).to.equal('<p>Hi!</p>');
    const stateAfterInput = view.state;
    await el.updateComplete;
    expect(view.state).to.equal(stateAfterInput);
  });

  it('replaces the document when the value changes externally', async () => {
    const el = await mount({ value: '<p>One</p>' });
    el.value = '<ul><li>Two</li></ul>';
    await el.updateComplete;
    expect(content(el).innerHTML).to.contain('<li>');
    expect(content(el).textContent).to.equal('Two');
  });

  it('applies marks and lists from the toolbar', async () => {
    const el = await mount({ value: '<p>text</p>' });
    selectAll(el);
    tool(el, 'strong').click();
    expect(el.value).to.equal('<p><strong>text</strong></p>');
    await el.updateComplete;
    expect(tool(el, 'strong').getAttribute('aria-pressed')).to.equal('true');
    tool(el, 'ordered_list').click();
    expect(el.value).to.equal('<ol><li><strong>text</strong></li></ol>');
  });

  it('toggles every mark on and off from the toolbar', async () => {
    const marks = {
      strong: 'strong', em: 'em', code: 'code', u: 'u', s: 's', sup: 'sup', sub: 'sub',
    };
    const el = await mount({ value: '<p>text</p>' });
    el.focus();
    for (const [id, tag] of Object.entries(marks)) {
      selectAll(el);
      tool(el, id).click();
      expect(el.value, id).to.equal(`<p><${tag}>text</${tag}></p>`);
      await el.updateComplete; // eslint-disable-line no-await-in-loop
      expect(tool(el, id).getAttribute('aria-pressed'), id).to.equal('true');
      tool(el, id).click();
      expect(el.value, id).to.equal('<p>text</p>');
      await el.updateComplete; // eslint-disable-line no-await-in-loop
      expect(tool(el, id).getAttribute('aria-pressed'), id).to.equal('false');
    }
  });

  it('toggles and switches both list types from the toolbar', async () => {
    const el = await mount({ value: '<p>text</p>' });
    el.focus();
    selectAll(el);
    tool(el, 'bullet_list').click();
    expect(el.value).to.equal('<ul><li>text</li></ul>');
    await el.updateComplete;
    expect(tool(el, 'bullet_list').getAttribute('aria-pressed')).to.equal('true');
    tool(el, 'ordered_list').click();
    expect(el.value).to.equal('<ol><li>text</li></ol>');
    await el.updateComplete;
    expect(tool(el, 'bullet_list').getAttribute('aria-pressed')).to.equal('false');
    expect(tool(el, 'ordered_list').getAttribute('aria-pressed')).to.equal('true');
    tool(el, 'ordered_list').click();
    expect(el.value).to.equal('<p>text</p>');
  });

  it('applies every block type from the picker', async () => {
    const el = await mount({ value: '<p>text</p>' });
    const picker = el.shadowRoot.querySelector('nx-picker');
    const pick = (value) => picker.dispatchEvent(new CustomEvent('change', { detail: { value } }));
    [1, 2, 3, 4, 5, 6].forEach((level) => {
      pick(`heading-${level}`);
      expect(el.value).to.equal(`<h${level}>text</h${level}>`);
    });
    pick('paragraph');
    expect(el.value).to.equal('<p>text</p>');
  });

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  function press(el, key, { shift = false, alt = false, mod = true } = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      shiftKey: shift,
      altKey: alt,
      ctrlKey: mod && !isMac,
      metaKey: mod && isMac,
      bubbles: true,
      cancelable: true,
    });
    content(el).dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('applies marks from keyboard shortcuts', async () => {
    const shortcuts = [
      ['b', 'strong'], ['i', 'em'], ['u', 'u'], ['e', 'code'], ['x', 's', { shift: true }],
      ['.', 'sup'], [',', 'sub'],
    ];
    const el = await mount({ value: '<p>text</p>' });
    shortcuts.forEach(([key, tag, opts]) => {
      selectAll(el);
      expect(press(el, key, opts), key).to.be.true;
      expect(el.value, key).to.equal(`<p><${tag}>text</${tag}></p>`);
      press(el, key, opts);
      expect(el.value, key).to.equal('<p>text</p>');
    });
  });

  it('changes blocks, lists and quotes from keyboard shortcuts', async () => {
    const el = await mount({ value: '<p>text</p>' });
    selectAll(el);
    press(el, '3', { alt: true });
    expect(el.value).to.equal('<h3>text</h3>');
    press(el, '0', { alt: true });
    expect(el.value).to.equal('<p>text</p>');
    press(el, '9', { shift: true });
    expect(el.value).to.equal('<blockquote><p>text</p></blockquote>');
    press(el, '9', { shift: true });
    expect(el.value).to.equal('<p>text</p>');
    press(el, '8', { shift: true });
    expect(el.value).to.equal('<ul><li>text</li></ul>');
    press(el, '7', { shift: true });
    expect(el.value).to.equal('<ol><li>text</li></ol>');
    press(el, '7', { shift: true });
    expect(el.value).to.equal('<p>text</p>');
  });

  it('indents and outdents list items with Tab', async () => {
    const el = await mount({ value: '<ul><li>a</li><li>b</li></ul>' });
    const view = el._view;
    view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(view.state.doc, 8)));
    expect(press(el, 'Tab', { mod: false })).to.be.true;
    expect(el.value).to.equal('<ul><li>a<ul><li>b</li></ul></li></ul>');
    press(el, 'Tab', { shift: true, mod: false });
    expect(el.value).to.equal('<ul><li>a</li><li>b</li></ul>');
  });

  it('removes a link and inserts a line break from the keyboard', async () => {
    const el = await mount({ value: '<p><a href="/a">site</a></p>' });
    const view = el._view;
    view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(view.state.doc, 3)));
    press(el, 'k', { shift: true });
    expect(el.value).to.equal('<p>site</p>');
    press(el, 'Enter', { shift: true, mod: false });
    expect(el.value).to.equal('<p>si<br>te</p>');
  });

  it('undoes and redoes changes from the keyboard', async () => {
    const el = await mount({ value: '<p>text</p>' });
    selectAll(el);
    tool(el, 'strong').click();
    expect(el.value).to.equal('<p><strong>text</strong></p>');
    expect(press(el, 'z')).to.be.true;
    expect(el.value).to.equal('<p>text</p>');
    press(el, 'z', { shift: true });
    expect(el.value).to.equal('<p><strong>text</strong></p>');
    press(el, 'z');
    press(el, 'y');
    expect(el.value).to.equal('<p><strong>text</strong></p>');
  });

  it('applies code, superscript, subscript and blockquote from the toolbar', async () => {
    const el = await mount({ value: '<p>text</p>' });
    selectAll(el);
    tool(el, 'code').click();
    expect(el.value).to.equal('<p><code>text</code></p>');
    tool(el, 'sup').click();
    expect(el.value).to.equal('<p><sup><code>text</code></sup></p>');
    tool(el, 'sub').click();
    expect(el.value).to.equal('<p><sub><code>text</code></sub></p>');
    tool(el, 'blockquote').click();
    expect(el.value).to.equal('<blockquote><p><sub><code>text</code></sub></p></blockquote>');
    await el.updateComplete;
    expect(tool(el, 'blockquote').getAttribute('aria-pressed')).to.equal('true');
    tool(el, 'blockquote').click();
    expect(el.value).to.equal('<p><sub><code>text</code></sub></p>');
  });

  it('changes the block type from the picker', async () => {
    const el = await mount({ value: '<p>text</p>' });
    const picker = el.shadowRoot.querySelector('nx-picker');
    expect(picker.value).to.equal('paragraph');
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'heading-2' } }));
    expect(el.value).to.equal('<h2>text</h2>');
    await el.updateComplete;
    expect(picker.value).to.equal('heading-2');
    expect(picker.inert).to.be.false;
  });

  it('reflects the selection in the toolbar only while focused', async () => {
    const el = await mount({ value: '<h1><u>Title</u></h1><p><a href="/a">x</a></p>' });
    const picker = el.shadowRoot.querySelector('nx-picker');
    expect(tool(el, 'u').getAttribute('aria-pressed')).to.equal('false');
    expect(picker.value).to.equal('paragraph');
    el.focus();
    await el.updateComplete;
    expect(tool(el, 'u').getAttribute('aria-pressed')).to.equal('true');
    expect(picker.value).to.equal('heading-1');
    el._view.dom.blur();
    await el.updateComplete;
    expect(tool(el, 'u').getAttribute('aria-pressed')).to.equal('false');
    expect(tool(el, 'unlink').classList.contains('is-hidden')).to.be.true;
  });

  it('disables the block type picker inside lists', async () => {
    const el = await mount({ value: '<ul><li>text</li></ul>' });
    el.focus();
    await el.updateComplete;
    const picker = el.shadowRoot.querySelector('nx-picker');
    expect(picker.inert).to.be.true;
    expect(picker.closest('.form-richtext-block').classList.contains('is-disabled')).to.be.true;
  });

  it('keeps the selection when a toolbar button is pressed', async () => {
    const el = await mount({ value: '<p>text</p>' });
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    tool(el, 'em').dispatchEvent(event);
    expect(event.defaultPrevented).to.be.true;
  });

  async function openLinkDialog(el, trigger = () => tool(el, 'link').click()) {
    trigger();
    const find = () => el.shadowRoot.querySelector('nx-link-dialog');
    for (let i = 0; i < 50 && !find(); i += 1) await tick(); // eslint-disable-line no-await-in-loop
    const dialog = find();
    await dialog?.updateComplete;
    const field = (name) => dialog.shadowRoot.querySelector(`[name="${name}"]`);
    const button = (label) => [...dialog.shadowRoot.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === label);
    return { dialog, field, button };
  }

  it('adds a link from the shared link dialog', async () => {
    const el = await mount({ value: '<p>site</p>' });
    selectAll(el);
    let closes = 0;
    el.addEventListener('close', () => { closes += 1; });
    const { dialog, field, button } = await openLinkDialog(el);
    expect(dialog.open).to.be.true;
    expect(field('link-href').value).to.equal('');
    expect(field('link-text').value).to.equal('site');
    expect(field('link-title').value).to.equal('');
    expect(tool(el, 'link').getAttribute('aria-pressed')).to.equal('true');
    field('link-href').value = 'https://example.com';
    field('link-title').value = 'Example';
    button('Save').click();
    await el.updateComplete;
    expect(el.value).to.equal('<p><a href="https://example.com" title="Example">site</a></p>');
    expect(el.shadowRoot.querySelector('nx-link-dialog')).to.equal(null);
    expect(closes).to.equal(0);
  });

  it('edits the link under the caret with Mod-K', async () => {
    const el = await mount({ value: '<p>a <a href="/a" title="Old">site</a></p>' });
    const view = el._view;
    view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(view.state.doc, 5)));
    const key = new KeyboardEvent('keydown', {
      key: 'k', ctrlKey: !isMac, metaKey: isMac, bubbles: true, cancelable: true,
    });
    const { field, button } = await openLinkDialog(el, () => content(el).dispatchEvent(key));
    expect(key.defaultPrevented).to.be.true;
    expect(field('link-href').value).to.equal('/a');
    expect(field('link-text').value).to.equal('site');
    expect(field('link-title').value).to.equal('Old');
    field('link-text').value = 'page';
    button('Save').click();
    expect(el.value).to.equal('<p>a <a href="/a" title="Old">page</a></p>');
  });

  it('rejects unsafe links in the dialog and keeps the content', async () => {
    const el = await mount({ value: '<p><a href="/a">site</a></p>' });
    selectAll(el);
    const { dialog, field, button } = await openLinkDialog(el);
    field('link-href').value = 'ftp://x';
    button('Save').click();
    await dialog.updateComplete;
    expect(dialog.shadowRoot.querySelector('.nx-input-error-msg').textContent).to.contain('relative');
    expect(el.value).to.equal('<p><a href="/a">site</a></p>');
    button('Cancel').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-link-dialog')).to.equal(null);
  });

  it('removes a link from the toolbar', async () => {
    const el = await mount({ value: '<p><a href="/a">site</a> x</p>' });
    el.focus();
    const view = el._view;
    view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(view.state.doc, 8)));
    await el.updateComplete;
    expect(tool(el, 'unlink').disabled).to.be.true;
    expect(tool(el, 'unlink').classList.contains('is-hidden')).to.be.true;
    expect(getComputedStyle(tool(el, 'unlink')).display).to.equal('none');
    view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(view.state.doc, 2)));
    await el.updateComplete;
    expect(tool(el, 'unlink').disabled).to.be.false;
    expect(tool(el, 'unlink').classList.contains('is-hidden')).to.be.false;
    expect(tool(el, 'unlink').hasAttribute('aria-pressed')).to.be.false;
    tool(el, 'unlink').click();
    await el.updateComplete;
    expect(el.value).to.equal('<p>site x</p>');
    expect(tool(el, 'unlink').disabled).to.be.true;
    expect(tool(el, 'unlink').classList.contains('is-hidden')).to.be.true;
  });

  it('creates a list from several selected rows', async () => {
    const el = await mount({ value: '<p>a</p><p>b</p>' });
    selectAll(el);
    tool(el, 'ordered_list').click();
    await el.updateComplete;
    expect(el.value).to.equal('<ol><li>a</li><li>b</li></ol>');
  });

  it('removes the list from every selected item', async () => {
    const el = await mount({ value: '<ul><li>a</li><li>b</li><li>c</li></ul>' });
    el.focus();
    const view = el._view;
    view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(view.state.doc, 3, 9)));
    await el.updateComplete;
    expect(tool(el, 'bullet_list').getAttribute('aria-pressed')).to.equal('true');
    tool(el, 'bullet_list').click();
    await el.updateComplete;
    expect(el.value).to.equal('<p>a</p><p>b</p><ul><li>c</li></ul>');
  });

  it('indents and outdents list items from the toolbar', async () => {
    const el = await mount({ value: '<p>x</p><ul><li>a</li><li>b</li></ul>' });
    el.focus();
    expect(tool(el, 'indent').disabled).to.be.true;
    expect(tool(el, 'outdent').disabled).to.be.true;
    const view = el._view;
    view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(view.state.doc, 6)));
    await el.updateComplete;
    expect(tool(el, 'indent').disabled).to.be.true;
    expect(tool(el, 'outdent').disabled).to.be.false;
    expect(tool(el, 'indent').hasAttribute('aria-pressed')).to.be.false;
    view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(view.state.doc, 11)));
    await el.updateComplete;
    tool(el, 'indent').click();
    await el.updateComplete;
    expect(el.value).to.equal('<p>x</p><ul><li>a<ul><li>b</li></ul></li></ul>');
    expect(tool(el, 'indent').disabled).to.be.true;
    tool(el, 'outdent').click();
    await el.updateComplete;
    expect(el.value).to.equal('<p>x</p><ul><li>a</li><li>b</li></ul>');
  });

  it('fires change when focus leaves after an edit', async () => {
    const el = await mount({ value: '<p>a</p>' });
    let changes = 0;
    el.addEventListener('change', () => { changes += 1; });
    const view = el._view;
    content(el).dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    expect(changes).to.equal(0);
    view.dispatch(view.state.tr.insertText('b', 2));
    content(el).dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    expect(changes).to.equal(1);
  });

  it('is read-only when disabled', async () => {
    const el = await mount({ value: '<p>a</p>', disabled: true });
    expect(content(el).getAttribute('contenteditable')).to.equal('false');
    expect(tool(el, 'strong').disabled).to.be.true;
  });

  it('shows the placeholder only while empty', async () => {
    const el = await mount({ value: '', placeholder: 'Write…' });
    expect(el.shadowRoot.querySelector('.form-richtext-placeholder').textContent).to.equal('Write…');
    el.value = '<p>x</p>';
    await el.updateComplete;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.form-richtext-placeholder')).to.equal(null);
  });

  it('renders the error and description like other fields', async () => {
    const el = await mount({ error: 'Required', description: 'Help' });
    expect(el.shadowRoot.querySelector('.form-field').classList.contains('has-error')).to.be.true;
    expect(content(el).getAttribute('aria-invalid')).to.equal('true');
    expect(el.shadowRoot.querySelector('.form-field-description')).to.equal(null);
  });

  it('recreates the editor when reconnected', async () => {
    const el = await mount({ value: '<p>a</p>' });
    el.remove();
    expect(el._view).to.equal(undefined);
    document.body.append(el);
    await el.updateComplete;
    expect(content(el).textContent).to.equal('a');
  });

  it('moves tools that do not fit into a more menu', async () => {
    const el = await mount({ value: '<p>Hi</p>', width: '260px' });
    const sr = el.shadowRoot;
    await until(() => sr.querySelector('.form-richtext-more'));
    const at = el._overflowAt;
    expect(at).to.be.above(0).and.below(14);
    expect(tool(el, 'link').classList.contains('is-overflow')).to.be.true;
    expect(tool(el, 'strong').classList.contains('is-overflow')).to.be.false;
    const more = sr.querySelector('.form-richtext-more');
    expect(more.getAttribute('aria-expanded')).to.equal('false');

    el.focus();
    more.click();
    await until(() => sr.querySelector('.form-richtext-menu [data-tool]'));
    const menu = sr.querySelector('.form-richtext-menu');
    expect(more.getAttribute('aria-expanded')).to.equal('true');
    const menuTools = [...menu.querySelectorAll('[data-tool]')].map((b) => b.dataset.tool);
    expect(menuTools).to.include('link');
    expect(menuTools).to.not.include('strong');

    menu.querySelector('[data-tool="ordered_list"]').click();
    await el.updateComplete;
    expect(el.value).to.equal('<ol><li>Hi</li></ol>');
    expect(el._menuOpen).to.be.true;

    menu.close();
    await el.updateComplete;
    expect(more.getAttribute('aria-expanded')).to.equal('false');

    el.style.width = '900px';
    await until(() => !sr.querySelector('.form-richtext-more'));
    await el.updateComplete;
    expect(sr.querySelector('.form-richtext-more')).to.equal(null);
    expect(tool(el, 'link').classList.contains('is-overflow')).to.be.false;
  });

  it('opens the link dialog from the more menu', async () => {
    const el = await mount({ value: '<p>site</p>', width: '260px' });
    const sr = el.shadowRoot;
    await until(() => sr.querySelector('.form-richtext-more'));
    el.focus();
    selectAll(el);
    sr.querySelector('.form-richtext-more').click();
    await until(() => sr.querySelector('.form-richtext-menu [data-tool="link"]'));
    const { dialog, field, button } = await openLinkDialog(
      el,
      () => sr.querySelector('.form-richtext-menu [data-tool="link"]').click(),
    );
    expect(el._menuOpen).to.be.false;
    expect(field('link-text').value).to.equal('site');
    field('link-href').value = '/page';
    button('Save').click();
    await el.updateComplete;
    expect(el.value).to.equal('<p><a href="/page">site</a></p>');
    expect(dialog.isConnected).to.be.false;
  });

  it('reports a load failure', async () => {
    const el = await mount({ loader: async () => { throw new Error('offline'); } });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.form-field-error').textContent).to.contain('could not be loaded');
    expect(tool(el, 'strong').disabled).to.be.true;
  });
});
