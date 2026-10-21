/* eslint-disable no-script-url */
import { expect } from '@esm-bundle/chai';
import * as pm from '../../fields/mocks/pm.js';
import { createEngine, convertJsonToHtml, convertHtmlToJson } from '../../../../../../nx/deps/da-sc-sdk/dist/index.js';
import { SCHEMA_SPEC, safeHref } from '../../../../../../nx/blocks/form/utils/rich-text/schema.js';
import { parseRichText, serializeRichText, getCanonicalChange } from '../../../../../../nx/blocks/form/utils/rich-text/html.js';

const schema = new pm.Schema(SCHEMA_SPEC);
const parse = (value) => parseRichText({ pm, schema, value });
const roundTrip = (value) => serializeRichText({ doc: parse(value) });

const sdkSchema = { type: 'object', properties: { body: { type: 'string', 'x-semantic-type': 'rich-text' } } };
const sdkStores = (body) => {
  const json = { metadata: { schemaName: 'x' }, data: { body } };
  const { model } = createEngine({ schema: sdkSchema, document: json }).getState();
  const { html } = convertJsonToHtml({ json, model });
  return convertHtmlToJson({ html, schema: sdkSchema }).json.data.body ?? '';
};
const rawHtml = (doc) => {
  const container = document.createElement('div');
  container.append(pm.DOMSerializer.fromSchema(schema).serializeFragment(doc.content));
  return container.innerHTML;
};

describe('rich-text html', () => {
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
      const values = [
        '<h2>Title</h2><p><a href="/a"><strong>b<em>i</em></strong></a> <u>u</u><s>s</s></p>',
        '<blockquote><p>q<sup>1</sup></p><ol><li>a<ul><li>b</li></ul></li></ol></blockquote>',
        '<p>H<sub>2</sub>O <code>c</code><br>next</p>',
        '<p><a href="/a" title="A &quot;b&quot; &amp; &lt;c&gt;">l</a></p>',
      ];
      values.forEach((value) => {
        const body = roundTrip(value);
        expect(sdkStores(body)).to.equal(body);
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

  describe('schema', () => {
    it('accepts relative, http(s), mailto and tel links', () => {
      ['/a', 'a/b', '#x', '?q=1', 'https://x.y', 'HTTP://x.y', 'mailto:a@b.c', 'tel:+1'].forEach((href) => {
        expect(safeHref(href)).to.equal(href);
      });
      expect(safeHref('  /a  ')).to.equal('/a');
    });

    it('rejects other schemes and empty values', () => {
      ['javascript:x()', ' java\tscript:x()', 'JAVASCRIPT:x()', 'data:text/html,x', 'vbscript:x', '', '  ', undefined, 1].forEach((href) => {
        expect(safeHref(href)).to.equal(null);
      });
    });

    it('drops unsafe links from markup that skips the sanitizer, like a paste', () => {
      const { body } = new DOMParser().parseFromString('<p><a href="javascript:x()">a</a><a href="/b" title=" T ">b</a></p>', 'text/html');
      const doc = pm.DOMParser.fromSchema(schema).parse(body);
      expect(serializeRichText({ doc })).to.equal('<p>a<a href="/b" title="T">b</a></p>');
    });
  });

  describe('canonical change', () => {
    const text = (value, marks = []) => ({ type: 'text', text: value, marks: marks.map((type) => (typeof type === 'string' ? { type } : type)) });
    const inline = (content) => content.map((item) => (typeof item === 'string' ? text(item) : item));
    const p = (...content) => ({ type: 'paragraph', content: inline(content) });
    const h = (level, ...content) => ({ type: 'heading', attrs: { level }, content: inline(content) });
    const br = { type: 'hard_break' };
    const li = (...content) => ({ type: 'list_item', content });
    const ul = (...content) => ({ type: 'bullet_list', content });
    const ol = (...content) => ({ type: 'ordered_list', content });
    const quote = (...content) => ({ type: 'blockquote', content });
    const link = (href, title = null) => ({ type: 'link', attrs: { href, title } });
    const docOf = (content) => schema.nodeFromJSON({ type: 'doc', content });
    const normalize = (doc) => {
      const change = getCanonicalChange({ pm, doc });
      return change ? doc.replace(change.from, change.to, change.slice) : doc;
    };
    const stored = (doc) => parse(serializeRichText({ doc }));

    const canonical = {
      'an empty field': [p()],
      'escaped characters': [p('<a> & "q" \'s\'')],
      'non-breaking spaces': [p('a\u00a0b')],
      'overlapping marks': [p(text('a', ['strong']), text('b', ['strong', 'em']), text('c', ['em']))],
      'stacked marks in a titled link': [p(text('x', [link('/a', 'T'), 'strong', 'code']))],
      'scripts in links': [p(text('x', [link('/a'), 'sup']))],
      'inner line breaks': [p('a', br, br, 'b'), ul(li(p('c', br, 'd')))],
      'nested lists': [ul(li(p('a'), ol(li(p('b'), ul(li(p(text('c', ['em']))))))))],
      'quotes with lists': [quote(p('q'), ul(li(p('i'))), quote(p('n')))],
      'heading marks': [h(3, text('H', ['u', 's']))],
      unicode: [p('emoji 😀 ümlaut')],
    };

    const transient = {
      'repeated spaces': [p('a  b')],
      tabs: [p('a\tb')],
      'edge spaces': [p(' a '), p(text('x  y', ['code']))],
      'empty blocks': [p('a'), p(), h(2), ul(li(p('b')), li(p()))],
      'edge line breaks': [p(br, 'a', br)],
      'marks on spaces': [p('a', text(' ', ['strong']), text(' ', [link('/x')]), 'b')],
      'a space after a break': [p('a', br, ' b')],
      'a leading space in a mark': [p(text(' a', ['strong']))],
      'a space split across a mark': [p('a ', text(' b', ['em']))],
      'a trailing space in a mark before a break': [p(text('a ', ['em']), br)],
    };

    const visibleText = (html) => new DOMParser()
      .parseFromString(html.replaceAll('<br>', '\n'), 'text/html')
      .body.textContent.replace(/\s+/g, ' ').trim();

    Object.entries({ ...canonical, ...transient }).forEach(([name, content]) => {
      it(`stores ${name} in a form the SDK and a reload keep`, () => {
        const doc = docOf(content);
        const value = serializeRichText({ doc });
        expect(sdkStores(value)).to.equal(value);
        expect(roundTrip(value)).to.equal(value);
        expect(visibleText(value)).to.equal(visibleText(sdkStores(rawHtml(doc))));
      });
    });

    Object.entries(canonical).forEach(([name, content]) => {
      it(`leaves ${name} unchanged`, () => {
        const doc = docOf(content);
        expect(getCanonicalChange({ pm, doc })).to.equal(null);
        expect(stored(doc).eq(doc)).to.be.true;
      });
    });

    Object.entries(transient).forEach(([name, content]) => {
      it(`replaces ${name} with what is stored`, () => {
        const doc = docOf(content);
        const shown = normalize(doc);
        expect(shown.eq(doc)).to.be.false;
        expect(shown.eq(stored(doc))).to.be.true;
        expect(stored(shown).eq(shown)).to.be.true;
        expect(serializeRichText({ doc: shown })).to.equal(serializeRichText({ doc }));
      });
    });

    it('replaces only the differing range', () => {
      const doc = docOf([p('keep'), p(), p('also')]);
      const { from, to } = getCanonicalChange({ pm, doc });
      expect(doc.textBetween(0, from)).to.equal('keep');
      expect(doc.textBetween(to, doc.content.size)).to.equal('also');
    });
  });
});
