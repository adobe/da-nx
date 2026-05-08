import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { mdToDocDom, docDomToAemHtml } from '../../../nx/utils/converters.js';

describe('mdToDocDom', () => {
  it('Returns a Document with a body', () => {
    const dom = mdToDocDom('# Hello');
    expect(dom).to.be.instanceOf(Document);
    expect(dom.body).to.exist;
  });

  it('Converts headings to h1-h6', () => {
    const md = '# h1\n\n## h2\n\n### h3\n\n#### h4\n\n##### h5\n\n###### h6\n';
    const dom = mdToDocDom(md);
    expect(dom.querySelector('h1').textContent).to.equal('h1');
    expect(dom.querySelector('h2').textContent).to.equal('h2');
    expect(dom.querySelector('h3').textContent).to.equal('h3');
    expect(dom.querySelector('h4').textContent).to.equal('h4');
    expect(dom.querySelector('h5').textContent).to.equal('h5');
    expect(dom.querySelector('h6').textContent).to.equal('h6');
  });

  it('Converts paragraph text', () => {
    const dom = mdToDocDom('Hello world\n');
    const p = dom.querySelector('p');
    expect(p).to.exist;
    expect(p.textContent).to.equal('Hello world');
  });

  it('Converts unordered lists', () => {
    const md = '- one\n- two\n- three\n';
    const dom = mdToDocDom(md);
    const items = dom.querySelectorAll('ul > li');
    expect(items.length).to.equal(3);
    expect(items[0].textContent.trim()).to.equal('one');
    expect(items[2].textContent.trim()).to.equal('three');
  });

  it('Converts inline formatting (strong, em, del, code)', () => {
    const md = '**bold** *italic* ~~strike~~ `code`\n';
    const dom = mdToDocDom(md);
    expect(dom.querySelector('strong').textContent).to.equal('bold');
    expect(dom.querySelector('em').textContent).to.equal('italic');
    expect(dom.querySelector('del').textContent).to.equal('strike');
    expect(dom.querySelector('code').textContent).to.equal('code');
  });

  it('Preserves raw inline HTML (sup, sub, u)', () => {
    const md = '<sup>Super</sup> <sub>Sub</sub> <u>Under</u>\n';
    const dom = mdToDocDom(md);
    expect(dom.querySelector('sup').textContent).to.equal('Super');
    expect(dom.querySelector('sub').textContent).to.equal('Sub');
    expect(dom.querySelector('u').textContent).to.equal('Under');
  });

  it('Converts blockquotes', () => {
    const dom = mdToDocDom('> Quote\n');
    const bq = dom.querySelector('blockquote');
    expect(bq).to.exist;
    expect(bq.textContent.trim()).to.equal('Quote');
  });

  it('Converts fenced code blocks', () => {
    const md = '```\n// Code Block\n```\n';
    const dom = mdToDocDom(md);
    const pre = dom.querySelector('pre');
    expect(pre).to.exist;
    expect(pre.querySelector('code').textContent).to.include('// Code Block');
  });

  it('Converts grid tables to <table>', () => {
    const md = [
      '+----------+----------+',
      '| Column 1 | Column 2 |',
      '+----------+----------+',
      '| A        | B        |',
      '+----------+----------+',
      '',
    ].join('\n');
    const dom = mdToDocDom(md);
    expect(dom.querySelector('table')).to.exist;
    expect(dom.body.textContent).to.include('Column 1');
    expect(dom.body.textContent).to.include('Column 2');
  });

  it('Normalizes CRLF and CR line breaks', () => {
    const crlf = mdToDocDom('# hi\r\n\r\nworld\r\n');
    expect(crlf.querySelector('h1').textContent).to.equal('hi');
    expect(crlf.querySelector('p').textContent).to.equal('world');

    const cr = mdToDocDom('# hi\r\rworld\r');
    expect(cr.querySelector('h1').textContent).to.equal('hi');
    expect(cr.querySelector('p').textContent).to.equal('world');
  });

  it('Rewrites .hlx.page links to .aem.live', () => {
    const md = '[link](https://main--site--owner.hlx.page/foo)\n';
    const dom = mdToDocDom(md);
    const a = dom.querySelector('a');
    expect(a.getAttribute('href')).to.equal('https://main--site--owner.aem.live/foo');
  });

  it('Rewrites .hlx.live links to .aem.live', () => {
    const md = '[link](https://main--site--owner.hlx.live/foo)\n';
    const dom = mdToDocDom(md);
    expect(dom.querySelector('a').getAttribute('href')).to.equal('https://main--site--owner.aem.live/foo');
  });

  it('Rewrites .aem.page links to .aem.live', () => {
    const md = '[link](https://main--site--owner.aem.page/foo)\n';
    const dom = mdToDocDom(md);
    expect(dom.querySelector('a').getAttribute('href')).to.equal('https://main--site--owner.aem.live/foo');
  });

  it('Removes #width hash from image src', () => {
    const md = '![alt](https://example.aem.live/image.png#width=100)\n';
    const dom = mdToDocDom(md);
    const img = dom.querySelector('img');
    expect(img.getAttribute('src')).to.equal('https://example.aem.live/image.png');
  });

  it('Leaves image src without #width untouched', () => {
    const md = '![alt](https://example.aem.live/image.png)\n';
    const dom = mdToDocDom(md);
    expect(dom.querySelector('img').getAttribute('src')).to.equal('https://example.aem.live/image.png');
  });

  describe('main.md fixture', () => {
    let dom;

    before(async () => {
      const md = await readFile({ path: './mocks/main.md' });
      dom = mdToDocDom(md);
    });

    it('Produces the top-level heading', () => {
      const h1 = dom.querySelector('h1');
      expect(h1).to.exist;
      expect(h1.textContent).to.equal('List Test');
    });

    it('Produces a three-item list', () => {
      const items = dom.querySelectorAll('ul > li');
      expect(items.length).to.equal(3);
      expect(items[0].textContent).to.include('Item 1');
      expect(items[0].textContent).to.include('Blah blah blah');
      expect(items[1].textContent.trim()).to.equal('Item 2');
      expect(items[2].textContent.trim()).to.equal('Item 3');
    });

    it('Produces a grid table', () => {
      expect(dom.querySelector('table')).to.exist;
      expect(dom.body.textContent).to.include('My Table');
      expect(dom.body.textContent).to.include('Column 1');
      expect(dom.body.textContent).to.include('Column 2');
    });

    it('Preserves sup, sub, and u inline HTML', () => {
      expect(dom.querySelector('sup')).to.exist;
      expect(dom.querySelector('sub')).to.exist;
      expect(dom.querySelector('u')).to.exist;
    });

    it('Produces strong, em, and del elements', () => {
      expect(dom.querySelector('strong')).to.exist;
      expect(dom.querySelector('em')).to.exist;
      expect(dom.querySelector('del')).to.exist;
    });

    it('Produces a standalone <del> from ~~Strikethrough~~', () => {
      const del = [...dom.querySelectorAll('del')].find((d) => d.textContent === 'Strikethrough');
      expect(del).to.exist;
      expect(del.parentElement.tagName).to.equal('P');
      expect(del.children.length).to.equal(0);
    });

    it('Produces a blockquote', () => {
      const bq = dom.querySelector('blockquote');
      expect(bq).to.exist;
      expect(bq.textContent.trim()).to.equal('Quote');
    });

    it('Produces inline code and a fenced code block', () => {
      const codes = dom.querySelectorAll('code');
      expect(codes.length).to.be.at.least(2);
      expect(dom.querySelector('pre > code').textContent).to.include('// Code Block');
      const inlineCode = [...codes].find((c) => c.textContent === 'Inline Code');
      expect(inlineCode).to.exist;
      expect(inlineCode.parentElement.tagName).to.equal('P');
    });

    it('Produces h2 through h6', () => {
      ['h2', 'h3', 'h4', 'h5', 'h6'].forEach((tag) => {
        const el = dom.querySelector(tag);
        expect(el, `expected ${tag}`).to.exist;
        expect(el.textContent).to.equal(tag);
      });
    });
  });

  // Ported from https://github.com/adobe/helix-importer-ui/blob/main/test/md2html.test.js.
  // Helix asserts full HTML-string equality against their pipeline, which differs from ours
  // (heading ID slugger, image URL rewriting by hash). We port the input shapes and assert
  // structural equivalents our pipeline should produce.
  describe('helix-importer-ui coverage', () => {
    it('Resolves image reference syntax ([alt][id] + [id]: url)', async () => {
      const md = await readFile({ path: './mocks/simple.md' });
      const dom = mdToDocDom(md);
      const img = dom.querySelector('img');
      expect(img).to.exist;
      expect(img.getAttribute('src')).to.equal('https://dummyimage.com/300');
      expect(img.getAttribute('alt')).to.equal('hello alt text.');
    });

    it('Preserves escaped pipes (\\|) inside grid table cells', async () => {
      const md = await readFile({ path: './mocks/table.md' });
      const dom = mdToDocDom(md);
      const cells = dom.querySelectorAll('table td');
      expect(cells.length).to.equal(2);
      expect(cells[1].textContent).to.equal('Protección a la infancia | Palladium Hotel Group');
    });

    it('Supports GFM tasklists', () => {
      const md = '- [x] done\n- [ ] todo\n';
      const dom = mdToDocDom(md);
      const inputs = dom.querySelectorAll('li input[type="checkbox"]');
      expect(inputs.length).to.equal(2);
      expect(inputs[0].hasAttribute('checked')).to.equal(true);
      expect(inputs[1].hasAttribute('checked')).to.equal(false);
    });

    it('Supports GFM footnotes', () => {
      const md = 'Text[^1]\n\n[^1]: A footnote\n';
      const dom = mdToDocDom(md);
      expect(dom.querySelector('sup > a[href="#user-content-fn-1"]')).to.exist;
      expect(dom.querySelector('section.footnotes')).to.exist;
    });

    it('Does NOT autolink bare URLs (remarkGfmNoLink)', () => {
      const dom = mdToDocDom('Visit https://example.com today\n');
      const p = dom.querySelector('p');
      expect(p.textContent).to.equal('Visit https://example.com today');
      expect(p.querySelector('a')).to.equal(null);
    });
  });
});

// md2da in Helix corresponds to mdToDocDom + docDomToAemHtml in this repo:
// the DOM is further post-processed into DA's block/section markup.
describe('DA pipeline (mdToDocDom + docDomToAemHtml)', () => {
  it('Wraps content in a section div and pictures images', async () => {
    const md = await readFile({ path: './mocks/simple.md' });
    const html = docDomToAemHtml(mdToDocDom(md));
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const section = dom.body.querySelector(':scope > div');
    expect(section).to.exist;
    expect(section.querySelector('h1').textContent).to.equal('Simple md file');
    const picture = section.querySelector('picture');
    expect(picture).to.exist;
    expect(picture.querySelector('img').getAttribute('src')).to.equal('https://dummyimage.com/300');
  });

  it('Converts a metadata grid table into a div.metadata block', async () => {
    const md = await readFile({ path: './mocks/table.md' });
    const html = docDomToAemHtml(mdToDocDom(md));
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const meta = dom.querySelector('div.metadata');
    expect(meta).to.exist;
    expect(dom.querySelector('table')).to.equal(null);
    const row = meta.querySelector(':scope > div');
    const cols = row.querySelectorAll(':scope > div');
    expect(cols.length).to.equal(2);
    expect(cols[0].textContent).to.equal('Title');
    expect(cols[1].textContent).to.equal('Protección a la infancia | Palladium Hotel Group');
  });
});
