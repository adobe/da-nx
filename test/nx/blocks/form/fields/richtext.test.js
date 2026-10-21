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

async function openMenu(el, source = 'bar') {
  const sr = el.shadowRoot;
  sr.querySelector(`[data-more="${source}"]`).click();
  await until(() => sr.querySelector('.form-richtext-menu [data-tool]'));
  const menu = sr.querySelector('.form-richtext-menu');
  // Concurrent test pages steal window focus, which would light-dismiss the menu.
  window.removeEventListener('blur', menu._onWindowBlur);
  await el.updateComplete;
}

// Concurrent test pages can blur the window, so re-assert focus before reading focus state.
async function refocus(el) {
  content(el).dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
  await el.updateComplete;
}

async function pressed(el, id) {
  await refocus(el);
  return tool(el, id).getAttribute('aria-pressed');
}

// Pins the focused state for tests that wait across several frames.
async function holdFocus(el) {
  Object.defineProperty(el, '_focused', { get: () => true, set: () => {} });
  el.requestUpdate();
  await el.updateComplete;
}

const floating = (el) => el.shadowRoot.querySelector('.form-richtext-bubble');
const floatingTool = (el, id) => floating(el).querySelector(`[data-tool="${id}"]`);
const visibleIds = (root) => [...root.querySelectorAll('[data-tool]:not(.is-hidden)')]
  .map((button) => button.dataset.tool);

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
    expect(await pressed(el, 'strong')).to.equal('true');
    await openMenu(el);
    tool(el, 'ordered_list').click();
    expect(el.value).to.equal('<ol><li><strong>text</strong></li></ol>');
  });

  it('toggles every mark on and off from the toolbar', async () => {
    const marks = {
      strong: 'strong', em: 'em', code: 'code', u: 'u', s: 's', sup: 'sup', sub: 'sub',
    };
    const el = await mount({ value: '<p>text</p>' });
    el.focus();
    await openMenu(el);
    for (const [id, tag] of Object.entries(marks)) {
      selectAll(el);
      tool(el, id).click();
      expect(el.value, id).to.equal(`<p><${tag}>text</${tag}></p>`);
      await el.updateComplete; // eslint-disable-line no-await-in-loop
      expect(await pressed(el, id), id).to.equal('true');
      tool(el, id).click();
      expect(el.value, id).to.equal('<p>text</p>');
      await el.updateComplete; // eslint-disable-line no-await-in-loop
      expect(await pressed(el, id), id).to.equal('false');
    }
  });

  it('toggles and switches both list types from the toolbar', async () => {
    const el = await mount({ value: '<p>text</p>' });
    el.focus();
    await openMenu(el);
    selectAll(el);
    tool(el, 'bullet_list').click();
    expect(el.value).to.equal('<ul><li>text</li></ul>');
    await el.updateComplete;
    expect(await pressed(el, 'bullet_list')).to.equal('true');
    tool(el, 'ordered_list').click();
    expect(el.value).to.equal('<ol><li>text</li></ol>');
    await el.updateComplete;
    expect(await pressed(el, 'bullet_list')).to.equal('false');
    expect(await pressed(el, 'ordered_list')).to.equal('true');
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
    await openMenu(el);
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
    expect(await pressed(el, 'blockquote')).to.equal('true');
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
    const underline = () => tool(el, 'u').getAttribute('aria-pressed');
    expect(underline()).to.equal('false');
    expect(picker.value).to.equal('paragraph');
    el.focus();
    await el.updateComplete;
    expect(underline()).to.equal('true');
    expect(picker.value).to.equal('heading-1');
    el._view.dom.blur();
    await el.updateComplete;
    expect(underline()).to.equal('false');
    expect(tool(el, 'unlink').classList.contains('is-hidden')).to.be.true;
  });

  it('disables the block type picker inside lists', async () => {
    const el = await mount({ value: '<ul><li>text</li></ul>' });
    content(el).dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
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
    expect(await pressed(el, 'link')).to.equal('true');
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
    await openMenu(el);
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
    await openMenu(el);
    expect(await pressed(el, 'bullet_list')).to.equal('true');
    tool(el, 'bullet_list').click();
    await el.updateComplete;
    expect(el.value).to.equal('<p>a</p><p>b</p><ul><li>c</li></ul>');
  });

  it('has no indent buttons, since Tab nests list items', async () => {
    const el = await mount({ value: '<ul><li>a</li></ul>' });
    await openMenu(el);
    expect(tool(el, 'indent')).to.equal(null);
    expect(tool(el, 'outdent')).to.equal(null);
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

  it('undoes and redoes from the toolbar', async () => {
    const el = await mount({ value: '<p>text</p>' });
    expect(tool(el, 'undo').disabled).to.be.true;
    expect(tool(el, 'redo').disabled).to.be.true;
    expect(tool(el, 'undo').hasAttribute('aria-pressed')).to.be.false;
    selectAll(el);
    tool(el, 'strong').click();
    await el.updateComplete;
    expect(tool(el, 'undo').disabled).to.be.false;
    tool(el, 'undo').click();
    expect(el.value).to.equal('<p>text</p>');
    await el.updateComplete;
    expect(tool(el, 'undo').disabled).to.be.true;
    expect(tool(el, 'redo').disabled).to.be.false;
    tool(el, 'redo').click();
    expect(el.value).to.equal('<p><strong>text</strong></p>');
    await el.updateComplete;
    expect(tool(el, 'redo').disabled).to.be.true;
  });

  it('hides undo and redo when the host has no history', async () => {
    const { history, undo, redo, ...noHistory } = pm; // eslint-disable-line no-unused-vars
    const el = await mount({ value: '<p>text</p>', loader: async () => noHistory, width: '900px' });
    expect(tool(el, 'undo').classList.contains('is-hidden')).to.be.true;
    expect(tool(el, 'redo').classList.contains('is-hidden')).to.be.true;
    expect(tool(el, 'redo').nextElementSibling.classList.contains('is-hidden')).to.be.true;
    await until(() => el._overflowAt === 9);
    expect(tool(el, 'code').classList.contains('is-overflow')).to.be.false;
  });

  it('orders the bar and keeps lists, quote and scripts in the more menu', async () => {
    const el = await mount({ value: '<p>Hi</p>', width: '900px' });
    const sr = el.shadowRoot;
    await until(() => el._overflowAt === 9);
    const barTools = [...sr.querySelectorAll('.form-richtext-toolbar > [data-tool]')].map((b) => b.dataset.tool);
    expect(barTools).to.deep.equal(['undo', 'redo', 'strong', 'em', 'u', 's', 'link', 'unlink', 'code']);
    const picker = sr.querySelector('.form-richtext-toolbar > .form-richtext-block');
    expect(picker.previousElementSibling.classList.contains('form-richtext-sep')).to.be.true;
    expect(picker.previousElementSibling.previousElementSibling).to.equal(tool(el, 'redo'));
    await openMenu(el);
    const menuTools = [...sr.querySelectorAll('.form-richtext-menu [data-tool]')].map((b) => b.dataset.tool);
    expect(menuTools).to.deep.equal(['ordered_list', 'bullet_list', 'blockquote', 'sup', 'sub']);
  });

  it('moves bar tools that do not fit into the more menu', async () => {
    const el = await mount({ value: '<p>Hi</p>', width: '260px' });
    const sr = el.shadowRoot;
    await until(() => el._overflowAt < 9);
    expect(el._overflowAt).to.be.above(0);
    expect(tool(el, 'link').classList.contains('is-overflow')).to.be.true;
    expect(tool(el, 'strong').classList.contains('is-overflow')).to.be.false;
    const more = sr.querySelector('.form-richtext-more');
    expect(more.getAttribute('aria-expanded')).to.equal('false');

    el.focus();
    await openMenu(el);
    const menu = sr.querySelector('.form-richtext-menu');
    expect(more.getAttribute('aria-expanded')).to.equal('true');
    const menuTools = [...menu.querySelectorAll('[data-tool]')].map((b) => b.dataset.tool);
    expect(menuTools).to.include('link');
    expect(menuTools).to.include('ordered_list');
    expect(menuTools).to.not.include('strong');

    menu.querySelector('[data-tool="ordered_list"]').click();
    await el.updateComplete;
    expect(el.value).to.equal('<ol><li>Hi</li></ol>');
    expect(el._menuSource).to.equal('bar');

    menu.close();
    await el.updateComplete;
    expect(more.getAttribute('aria-expanded')).to.equal('false');

    el.style.width = '900px';
    await until(() => el._overflowAt === 9);
    await el.updateComplete;
    expect(sr.querySelector('.form-richtext-more')).to.not.equal(null);
    expect(tool(el, 'link').classList.contains('is-overflow')).to.be.false;
  });

  it('opens the link dialog from the more menu', async () => {
    const el = await mount({ value: '<p>site</p>', width: '260px' });
    const sr = el.shadowRoot;
    await until(() => el._overflowAt < 9);
    el.focus();
    selectAll(el);
    sr.querySelector('.form-richtext-more').click();
    await until(() => sr.querySelector('.form-richtext-menu [data-tool="link"]'));
    const { dialog, field, button } = await openLinkDialog(
      el,
      () => sr.querySelector('.form-richtext-menu [data-tool="link"]').click(),
    );
    expect(el._menuSource).to.be.undefined;
    expect(field('link-text').value).to.equal('site');
    field('link-href').value = '/page';
    button('Save').click();
    await el.updateComplete;
    expect(el.value).to.equal('<p><a href="/page">site</a></p>');
    expect(dialog.isConnected).to.be.false;
  });

  it('shows the floating toolbar only for a focused, non-empty selection', async () => {
    const el = await mount({ value: '<p>Some text</p>' });
    await refocus(el);
    expect(floating(el)).to.equal(null);
    selectAll(el);
    await refocus(el);
    expect(floating(el)).to.not.equal(null);
    content(el).dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(floating(el)).to.equal(null);
    const view = el._view;
    view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(view.state.doc, 2)));
    await refocus(el);
    expect(floating(el)).to.equal(null);
  });

  it('floats above the selection, or below it next to the toolbar', async () => {
    const value = [1, 2, 3, 4, 5].map((n) => `<p>Line ${n}</p>`).join('');
    const el = await mount({ value, width: '400px' });
    await holdFocus(el);
    const view = el._view;
    const select = async (from, to) => {
      view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(view.state.doc, from, to)));
      await el.updateComplete;
      return floating(el).getBoundingClientRect();
    };
    const frame = el.shadowRoot.querySelector('.form-richtext').getBoundingClientRect();
    const last = await select(33, 37);
    expect(last.bottom).to.be.at.most(view.coordsAtPos(33).top);
    expect(last.left).to.be.at.least(frame.left);
    expect(last.right).to.be.at.most(frame.right);
    const first = await select(1, 5);
    const toolbar = el.shadowRoot.querySelector('.form-richtext-toolbar').getBoundingClientRect();
    expect(first.top).to.be.at.least(view.coordsAtPos(5).bottom);
    expect(first.top).to.be.at.least(toolbar.bottom);
  });

  it('formats from the floating toolbar without adding tab stops', async () => {
    const el = await mount({ value: '<p>text</p>' });
    await holdFocus(el);
    selectAll(el);
    await el.updateComplete;
    expect(visibleIds(floating(el))).to.deep.equal(['strong', 'em', 'u', 's', 'link', 'code']);
    expect([...floating(el).querySelectorAll('button')].every((b) => b.tabIndex === -1)).to.be.true;
    floatingTool(el, 'strong').click();
    expect(el.value).to.equal('<p><strong>text</strong></p>');
    await el.updateComplete;
    expect(floatingTool(el, 'strong').getAttribute('aria-pressed')).to.equal('true');
  });

  it('offers unlink in the floating toolbar only inside a link', async () => {
    const el = await mount({ value: '<p><a href="/a">site</a></p>' });
    await holdFocus(el);
    selectAll(el);
    await el.updateComplete;
    expect(visibleIds(floating(el))).to.include('unlink');
    floatingTool(el, 'unlink').click();
    expect(el.value).to.equal('<p>site</p>');
    await el.updateComplete;
    expect(visibleIds(floating(el))).to.not.include('unlink');
  });

  it('hides the floating toolbar while the link dialog is open', async () => {
    const el = await mount({ value: '<p>site</p>' });
    await holdFocus(el);
    selectAll(el);
    await el.updateComplete;
    const { button } = await openLinkDialog(el, () => floatingTool(el, 'link').click());
    expect(floating(el)).to.equal(null);
    button('Cancel').click();
    await el.updateComplete;
    expect(floating(el)).to.not.equal(null);
  });

  it('opens only the menu groups from the floating toolbar', async () => {
    const el = await mount({ value: '<p>site</p>', width: '260px' });
    await until(() => el._overflowAt < 9);
    await holdFocus(el);
    selectAll(el);
    await el.updateComplete;
    await openMenu(el, 'bubble');
    const menu = el.shadowRoot.querySelector('.form-richtext-menu');
    expect(el._menuSource).to.equal('bubble');
    expect(floating(el).querySelector('[data-more]').getAttribute('aria-expanded')).to.equal('true');
    expect(visibleIds(menu)).to.deep.equal(['ordered_list', 'bullet_list', 'blockquote', 'sup', 'sub']);
    menu.querySelector('[data-tool="bullet_list"]').click();
    expect(el.value).to.equal('<ul><li>site</li></ul>');
    const view = el._view;
    const { doc, selection } = view.state;
    view.dispatch(view.state.tr.setSelection(pm.TextSelection.create(doc, selection.to)));
    await until(() => el._menuSource === undefined);
    expect(el._menuSource).to.be.undefined;
  });

  it('reports a load failure', async () => {
    const el = await mount({ loader: async () => { throw new Error('offline'); } });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.form-field-error').textContent).to.contain('could not be loaded');
    expect(tool(el, 'strong').disabled).to.be.true;
  });
});
