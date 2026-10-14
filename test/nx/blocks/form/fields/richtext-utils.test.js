/* eslint-disable no-script-url */
import { expect } from '@esm-bundle/chai';
import * as pm from './mocks/pm.js';
import { convertJsonToHtml, convertHtmlToJson } from '../../../../../nx/deps/da-sc-sdk/dist/index.js';
import {
  SCHEMA_SPEC,
  safeHref,
  parseRichText,
  serializeRichText,
  getActiveMarks,
  getListType,
  getLinkAt,
  getLinkDraft,
  applyLink,
  removeLink,
  toggleList,
  indentList,
  outdentList,
  getBlockType,
  setBlock,
  isInBlockquote,
  toggleBlockquote,
  BLOCK_TYPES,
  insertHardBreak,
  buildKeymap,
} from '../../../../../nx/blocks/form/fields/richtext-utils.js';

const schema = new pm.Schema(SCHEMA_SPEC);
const parse = (value) => parseRichText({ pm, schema, value });
const roundTrip = (value) => serializeRichText(parse(value));

function stateFor(value, { from, to } = {}) {
  const doc = parse(value);
  const state = pm.EditorState.create({ doc, schema });
  if (from === undefined) return state;
  const selection = pm.TextSelection.create(doc, from, to ?? from);
  return state.apply(state.tr.setSelection(selection));
}

function run(command, state) {
  let next = state;
  const handled = command(state, (tr) => { next = state.apply(tr); });
  return { handled, state: next, html: serializeRichText(next.doc) };
}

describe('richtext-utils', () => {
  describe('safeHref', () => {
    it('allows relative and safe schemes', () => {
      expect(safeHref(' /path ')).to.equal('/path');
      expect(safeHref('https://example.com')).to.equal('https://example.com');
      expect(safeHref('mailto:a@b.c')).to.equal('mailto:a@b.c');
      expect(safeHref('tel:+1')).to.equal('tel:+1');
      expect(safeHref('#top')).to.equal('#top');
    });

    it('rejects unsafe or empty values', () => {
      expect(safeHref('javascript:alert(1)')).to.equal(null);
      expect(safeHref(' java\nscript:alert(1)')).to.equal(null);
      expect(safeHref('data:text/html,x')).to.equal(null);
      expect(safeHref('')).to.equal(null);
      expect(safeHref(undefined)).to.equal(null);
    });
  });

  describe('parse and serialize', () => {
    it('keeps the canonical subset unchanged', () => {
      const html = '<p>A <strong>bold</strong>, <em>em</em>, <u>u</u>, <s>s</s> and <a href="https://x.y">link</a>.</p>'
        + '<ul><li>one<ol><li>nested</li></ol></li><li>two</li></ul><p>a<br>b</p>';
      expect(roundTrip(html)).to.equal(html);
    });

    it('normalizes equivalent tags', () => {
      expect(roundTrip('<p><b>b</b><i>i</i><strike>s</strike><del>d</del></p>'))
        .to.equal('<p><strong>b</strong><em>i</em><s>sd</s></p>');
    });

    it('keeps a trimmed link title', () => {
      expect(roundTrip('<p><a href="/a" title="  A  &quot;b&quot;\n c ">x</a><a href="/b" title=" ">y</a></p>'))
        .to.equal('<p><a href="/a" title="A &quot;b&quot; c">x</a><a href="/b">y</a></p>');
      expect(roundTrip('<p><a href="/a" title="t">x</a><a href="/a">y</a></p>'))
        .to.equal('<p><a href="/a" title="t">x</a><a href="/a">y</a></p>');
    });

    it('nests marks with links outermost', () => {
      expect(roundTrip('<p><strong><a href="/a">x</a></strong></p>'))
        .to.equal('<p><a href="/a"><strong>x</strong></a></p>');
      expect(roundTrip('<p><strong>a<em>b</em></strong><em>c</em></p>'))
        .to.equal('<p><strong>a<em>b</em></strong><em>c</em></p>');
    });

    it('drops unsafe links and active content', () => {
      expect(roundTrip('<p><a href="javascript:x()">t</a><img src=x onerror="x()"><script>x()</script></p>'))
        .to.equal('<p>t</p>');
    });

    it('flattens unsupported blocks into paragraphs', () => {
      expect(roundTrip('<section>Title</section><div>Body</div><pre>x</pre>'))
        .to.equal('<p>Title</p><p>Body</p><p>x</p>');
    });

    it('keeps headings and blockquotes', () => {
      const html = '<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>'
        + '<blockquote><p>Quote</p><h2>Head</h2><ul><li>item</li></ul><blockquote><p>Nested</p></blockquote></blockquote>';
      expect(roundTrip(html)).to.equal(html);
    });

    it('drops empty headings and blockquotes', () => {
      expect(roundTrip('<h2> </h2><blockquote><p><br></p></blockquote><p>a</p>')).to.equal('<p>a</p>');
    });

    it('keeps inline code, superscript and subscript', () => {
      const html = '<p><code>x()</code> E=mc<sup>2</sup> H<sub>2</sub>O <strong><code>b</code></strong></p>';
      expect(roundTrip(html)).to.equal(html);
    });

    it('does not combine superscript and subscript', () => {
      expect(roundTrip('<p><sup><sub>x</sub></sup></p>')).to.equal('<p><sub>x</sub></p>');
    });

    it('escapes text and attributes', () => {
      expect(roundTrip('<p>a &amp; &lt;b&gt; <a href="/?a=1&amp;b=&quot;2&quot;">l</a></p>'))
        .to.equal('<p>a &amp; &lt;b&gt; <a href="/?a=1&amp;b=&quot;2&quot;">l</a></p>');
    });

    it('converts plain text into paragraphs', () => {
      expect(roundTrip('line 1\nline 2\n\npara 2')).to.equal('<p>line 1<br>line 2</p><p>para 2</p>');
      expect(roundTrip('a < b')).to.equal('<p>a &lt; b</p>');
    });

    it('produces values the SDK keeps unchanged', () => {
      const schemaJson = { type: 'object', properties: { body: { type: 'string', 'x-semantic-type': 'rich-text' } } };
      const values = [
        '<h2>Title</h2><p><a href="/a"><strong>b<em>i</em></strong></a> <u>u</u><s>s</s></p>',
        '<blockquote><p>q<sup>1</sup></p><ol><li>a<ul><li>b</li></ul></li></ol></blockquote>',
        '<p>H<sub>2</sub>O <code>c</code><br>next</p>',
        '<p><a href="/a" title="A &quot;b&quot; &amp; &lt;c&gt;">l</a></p>',
      ];
      values.forEach((value) => {
        const body = roundTrip(value);
        const json = { metadata: { schemaName: 'x' }, data: { body } };
        const { html } = convertJsonToHtml({ json, schema: schemaJson });
        expect(convertHtmlToJson({ html, schema: schemaJson }).json.data.body).to.equal(body);
      });
    });

    it('serializes empty content as an empty string', () => {
      expect(roundTrip('')).to.equal('');
      expect(roundTrip(undefined)).to.equal('');
      expect(roundTrip('<p> </p><p><br></p><ul><li></li></ul>')).to.equal('');
    });

    it('trims edge whitespace and breaks', () => {
      expect(roundTrip('<p><br> a  b <br></p>')).to.equal('<p>a b</p>');
    });
  });

  describe('selection helpers', () => {
    it('reports marks across a range and at a caret', () => {
      const state = stateFor('<p><strong>ab</strong>cd</p>', { from: 1, to: 3 });
      expect([...getActiveMarks(state)]).to.deep.equal(['strong']);
      const caret = stateFor('<p><em>ab</em>cd</p>', { from: 2 });
      expect(getActiveMarks(caret).has('em')).to.be.true;
      expect(getActiveMarks(stateFor('<p>ab</p>', { from: 2 })).size).to.equal(0);
    });

    it('finds the closest list type', () => {
      expect(getListType(stateFor('<p>a</p>', { from: 1 }))).to.equal(null);
      expect(getListType(stateFor('<ol><li>a</li></ol>', { from: 3 })).name).to.equal('ordered_list');
    });

    it('reports the block type at the caret', () => {
      expect(getBlockType(stateFor('<p>a</p>', { from: 1 }))).to.equal('paragraph');
      expect(getBlockType(stateFor('<h3>a</h3>', { from: 1 }))).to.equal('heading-3');
      expect(BLOCK_TYPES.map((t) => t.value)).to.include('heading-6');
    });

    it('detects blockquotes around the caret', () => {
      expect(isInBlockquote(stateFor('<p>a</p>', { from: 1 }))).to.be.false;
      expect(isInBlockquote(stateFor('<blockquote><ul><li>a</li></ul></blockquote>', { from: 4 }))).to.be.true;
    });

    it('finds the full extent of a link around the caret', () => {
      const state = stateFor('<p>x <a href="/a">li<strong>nk</strong></a> y</p>', { from: 5 });
      expect(getLinkAt(state)).to.deep.equal({
        href: '/a', title: '', from: 3, to: 7,
      });
      expect(getLinkAt(stateFor('<p>plain</p>', { from: 2 }))).to.equal(null);
    });
  });

  describe('commands', () => {
    const link = ({ href, text, title }) => applyLink({
      pm, href, text, title,
    });

    it('drafts the link and text around the selection', () => {
      expect(getLinkDraft(stateFor('<p>x <a href="/a" title="T">li<strong>nk</strong></a> y</p>', { from: 5 })))
        .to.deep.equal({ href: '/a', title: 'T', text: 'link' });
      expect(getLinkDraft(stateFor('<p>hello there</p>', { from: 1, to: 6 })))
        .to.deep.equal({ href: '', title: '', text: 'hello' });
      expect(getLinkDraft(stateFor('<p>a</p><p>b</p>', { from: 1, to: 5 })).text).to.equal('a b');
    });

    it('links the selection and keeps its text and marks', () => {
      const state = stateFor('<p><strong>hello</strong> you</p>', { from: 1, to: 6 });
      const { html, state: next } = run(link({ href: 'https://a.b', text: 'hello' }), state);
      expect(html).to.equal('<p><a href="https://a.b"><strong>hello</strong></a> you</p>');
      expect(next.selection.from).to.equal(6);
    });

    it('links a multi-paragraph selection without merging it', () => {
      const state = stateFor('<p>a</p><p>b</p>', { from: 1, to: 5 });
      const { html } = run(link({ href: '/x', text: 'a b' }), state);
      expect(html).to.equal('<p><a href="/x">a</a></p><p><a href="/x">b</a></p>');
    });

    it('updates the whole link under the caret', () => {
      const state = stateFor('<p>x <a href="/old">li<strong>nk</strong></a> y</p>', { from: 4 });
      const { html } = run(link({ href: '/new', text: 'link' }), state);
      expect(html).to.equal('<p>x <a href="/new">li<strong>nk</strong></a> y</p>');
    });

    it('replaces the text when the display text changes', () => {
      const state = stateFor('<p>x <a href="/a"><em>old</em></a> y</p>', { from: 4 });
      const { html } = run(link({ href: '/b', text: ' new text ' }), state);
      expect(html).to.equal('<p>x <a href="/b"><em>new text</em></a> y</p>');
    });

    it('inserts the text or URL at the caret', () => {
      const state = stateFor('<p>go now</p>', { from: 4 });
      expect(run(link({ href: '/x', text: 'here' }), state).html)
        .to.equal('<p>go <a href="/x">here</a>now</p>');
      expect(run(link({ href: '/x', text: '  ' }), state).html)
        .to.equal('<p>go <a href="/x">/x</a>now</p>');
    });

    it('sets, updates and clears the link title', () => {
      const added = run(link({ href: '/a', text: 'ab', title: '  Hi  there ' }), stateFor('<p>ab</p>', { from: 1, to: 3 }));
      expect(added.html).to.equal('<p><a href="/a" title="Hi there">ab</a></p>');
      const caret = stateFor(added.html, { from: 2 });
      expect(run(link({ href: '/a', text: 'ab', title: 'New' }), caret).html)
        .to.equal('<p><a href="/a" title="New">ab</a></p>');
      expect(run(link({ href: '/a', text: 'ab', title: ' ' }), caret).html)
        .to.equal('<p><a href="/a">ab</a></p>');
    });

    it('refuses unsafe links', () => {
      const state = stateFor('<p>a</p>', { from: 1, to: 2 });
      expect(run(link({ href: 'javascript:x', text: 'a' }), state).handled).to.be.false;
      expect(link({ href: '/ok' })(state)).to.be.true;
    });

    it('removes a link', () => {
      const { handled, html } = run(removeLink, stateFor('<p><a href="/a">ab</a></p>', { from: 2 }));
      expect(handled).to.be.true;
      expect(html).to.equal('<p>ab</p>');
      expect(run(removeLink, stateFor('<p>ab</p>', { from: 2 })).handled).to.be.false;
    });

    it('toggles and switches lists', () => {
      const bullet = toggleList({ pm, name: 'bullet_list' });
      const ordered = toggleList({ pm, name: 'ordered_list' });
      const wrapped = run(bullet, stateFor('<p>a</p>', { from: 1 }));
      expect(wrapped.html).to.equal('<ul><li>a</li></ul>');
      const switched = run(ordered, wrapped.state);
      expect(switched.html).to.equal('<ol><li>a</li></ol>');
      expect(run(ordered, switched.state).html).to.equal('<p>a</p>');
    });

    it('wraps every selected block in its own list item', () => {
      const bullet = toggleList({ pm, name: 'bullet_list' });
      const ordered = toggleList({ pm, name: 'ordered_list' });
      expect(run(bullet, stateFor('<p>aa</p><p>bb</p><p>cc</p>', { from: 2, to: 6 })).html)
        .to.equal('<ul><li>aa</li><li>bb</li></ul><p>cc</p>');
      expect(run(bullet, stateFor('<h2>hh</h2><p>bb</p>', { from: 1, to: 6 })).html)
        .to.equal('<ul><li>hh</li><li>bb</li></ul>');
      expect(run(ordered, stateFor('<blockquote><p>a</p><p>b</p></blockquote>', { from: 2, to: 6 })).html)
        .to.equal('<blockquote><ol><li>a</li><li>b</li></ol></blockquote>');
      expect(run(bullet, stateFor('<p>a</p><blockquote><p>b</p></blockquote>', { from: 1, to: 6 })).handled)
        .to.be.false;
    });

    it('removes the list from every selected item', () => {
      const bullet = toggleList({ pm, name: 'bullet_list' });
      const list = '<ul><li>a</li><li>b</li><li>c</li><li>d</li></ul>';
      expect(run(bullet, stateFor(list, { from: 8, to: 14 })).html)
        .to.equal('<ul><li>a</li></ul><p>b</p><p>c</p><ul><li>d</li></ul>');
      expect(run(bullet, stateFor(list, { from: 3, to: 19 })).html)
        .to.equal('<p>a</p><p>b</p><p>c</p><p>d</p>');
      const nested = '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>';
      expect(run(bullet, stateFor(nested, { from: 3, to: 17 })).html).to.equal('<p>a</p><p>b</p><p>c</p>');
      expect(run(bullet, stateFor(nested, { from: 8 })).html)
        .to.equal('<ul><li>a</li></ul><p>b</p><ul><li>c</li></ul>');
    });

    it('indents and outdents list items', () => {
      const indent = indentList({ pm });
      const outdent = outdentList({ pm });
      const flat = '<ul><li>a</li><li>b</li></ul>';
      expect(indent(stateFor(flat, { from: 3 }))).to.be.false;
      expect(indent(stateFor('<p>a</p>', { from: 1 }))).to.be.false;
      expect(outdent(stateFor('<p>a</p>', { from: 1 }))).to.be.false;
      const nested = run(indent, stateFor(flat, { from: 8 }));
      expect(nested.html).to.equal('<ul><li>a<ul><li>b</li></ul></li></ul>');
      const lifted = run(outdent, nested.state);
      expect(lifted.html).to.equal(flat);
      expect(run(outdent, lifted.state).html).to.equal('<ul><li>a</li></ul><p>b</p>');
    });

    it('changes the block type', () => {
      const heading = run(setBlock({ pm, value: 'heading-2' }), stateFor('<p>a</p>', { from: 1 }));
      expect(heading.html).to.equal('<h2>a</h2>');
      expect(run(setBlock({ pm, value: 'paragraph' }), heading.state).html).to.equal('<p>a</p>');
      expect(run(setBlock({ pm, value: 'heading-7' }), heading.state).handled).to.be.false;
    });

    it('does not change list items into headings', () => {
      const state = stateFor('<ul><li>a</li></ul>', { from: 3 });
      expect(run(setBlock({ pm, value: 'heading-1' }), state).handled).to.be.false;
    });

    it('toggles a blockquote', () => {
      const quote = toggleBlockquote({ pm });
      const wrapped = run(quote, stateFor('<p>a</p><p>b</p>', { from: 1, to: 5 }));
      expect(wrapped.html).to.equal('<blockquote><p>a</p><p>b</p></blockquote>');
      expect(run(quote, wrapped.state).html).to.equal('<p>a</p><p>b</p>');
    });

    it('lifts only the selected block out of a blockquote', () => {
      const state = stateFor('<blockquote><p>a</p><p>b</p></blockquote>', { from: 2 });
      expect(run(toggleBlockquote({ pm }), state).html).to.equal('<p>a</p><blockquote><p>b</p></blockquote>');
    });

    it('inserts a hard break', () => {
      expect(run(insertHardBreak, stateFor('<p>ab</p>', { from: 2 })).html).to.equal('<p>a<br>b</p>');
    });

    it('builds a keymap with history only when available', () => {
      const keys = buildKeymap({ pm, schema });
      expect(keys['Mod-z']).to.equal(pm.undo);
      expect(keys['Mod-b']).to.be.a('function');
      ['Mod-e', 'Mod-.', 'Mod-,', 'Mod-Alt-0', 'Mod-Alt-6', 'Shift-Mod-9']
        .forEach((key) => expect(keys[key], key).to.be.a('function'));
      const noHistory = { ...pm, undo: undefined, redo: undefined };
      expect(buildKeymap({ pm: noHistory, schema })['Mod-z']).to.equal(undefined);
    });

    it('calls onLink for Mod-k', () => {
      let called = false;
      const keys = buildKeymap({ pm, schema, onLink: () => { called = true; } });
      expect(keys['Mod-k']()).to.be.true;
      expect(called).to.be.true;
      expect(buildKeymap({ pm, schema })['Shift-Mod-k']).to.equal(removeLink);
    });
  });
});
