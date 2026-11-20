import { expect } from '@esm-bundle/chai';
import * as standard from '../../nx/blocks/loc/dnt/dnt.js';
import * as glaas from '../../nx/blocks/loc/connectors/glaas/dnt.js';

const rule = (pattern) => ({ pattern, action: 'dnt-inline' });
const config = (rules) => ({ 'dnt-sheet-rules': { data: rules } });
const sheet = (values) => ({
  ':type': 'sheet',
  total: values.length,
  offset: 0,
  limit: values.length,
  data: values.map((Value) => ({ Key: 'message', Value })),
});
const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
const tokens = (doc) => [...doc.querySelectorAll('.dnt-text')]
  .map((el) => el.textContent);

[
  [
    'shared (including Google)', standard,
    (html) => standard.removeDnt({ html, org: 'org', site: 'site', ext: 'json' }),
  ],
  [
    'GLaaS', glaas,
    (html) => glaas.removeDnt(html, 'org', 'site', { fileType: 'json' }),
  ],
].forEach(([name, connector, remove]) => {
  describe(`${name} inline spreadsheet DNT`, () => {
    const add = (json, rules) => connector.addDnt(JSON.stringify(json), config(rules), { fileType: 'json', reset: true });

    it('protects repeated and balanced variables while leaving surrounding text translatable', async () => {
      const value = 'Only {inventory} of {count}; {{count}} {count}{TOTAL} [item] %%name%%';
      const json = sheet([value]);
      const html = await add(json, [
        rule('between({, })'), rule('between([, ])'), rule('between(%%, %%)'),
      ]);
      const doc = parse(html);
      expect(tokens(doc)).to.deep.equal([
        '{inventory}', '{count}', '{{count}}', '{count}', '{TOTAL}', '[item]', '%%name%%',
      ]);
      const cell = doc.querySelector('[key="Value"]');
      expect(cell.hasAttribute('translate')).to.equal(false);
      expect(cell.hasAttribute('data-inner-html')).to.equal(false);
      expect(cell.firstChild.textContent).to.equal('Only ');
      cell.firstChild.textContent = 'Solo ';
      const result = await remove(doc.documentElement.outerHTML);
      expect(JSON.parse(result)).to.deep.equal(sheet([value.replace('Only ', 'Solo ')]));
    });

    it('leaves unmatched and multiline delimiters untouched and resumes on the next line', async () => {
      const values = ['Unclosed {name', 'Unopened name}', '{broken\n{valid}', '%%broken'];
      const doc = parse(await add(sheet(values), [
        rule('between({, })'), rule('between(%%, %%)'),
      ]));
      expect(tokens(doc)).to.deep.equal(['{valid}']);
    });

    it('protects complete tokens inside unmatched openers while keeping balanced outer tokens intact', async () => {
      const cases = [
        ['Use { to start a token; {count} items remain', 'between({, })', ['{count}']],
        ['{{count}}', 'between({, })', ['{{count}}']],
        ['{{count}}', 'between({{, }})', ['{{count}}']],
        ['Use { here; {count} of {total} remain', 'between({, })', ['{count}', '{total}']],
        ['{broken {count}\n{total}', 'between({, })', ['{count}', '{total}']],
      ];
      for (const [value, pattern, expected] of cases) {
        const json = sheet([value]);
        const html = await add(json, [rule(pattern)]);
        const doc = parse(html);
        expect(tokens(doc)).to.deep.equal(expected);
        expect(doc.querySelector('.dnt-text .dnt-text')).to.equal(null);
        expect(JSON.parse(await remove(html))).to.deep.equal(json);
      }
    });

    it('ignores malformed inline rules for HTML but still rejects them for JSON using cached configuration', async () => {
      const invalidConfig = config([rule('between({)')]);
      const input = '<p>Plain page</p>';
      const html = await connector.addDnt(input, invalidConfig, { fileType: 'html', reset: true });
      expect(parse(html).querySelector('p').textContent).to.equal('Plain page');
      try {
        await connector.addDnt(JSON.stringify(sheet(['Hello {name}'])), invalidConfig, { fileType: 'json' });
        expect.fail('Expected invalid inline configuration to reject JSON preparation');
      } catch (error) {
        expect(error.message).to.include('Invalid dnt-inline rule');
      }
      const nextHtml = await connector.addDnt(input, invalidConfig, { fileType: 'html' });
      expect(parse(nextHtml).querySelector('p').textContent).to.equal('Plain page');
    });

    it('preserves cached inline rules across HTML and repeated JSON preparation', async () => {
      const inlineConfig = config([rule('between({, })')]);
      const input = '<p>Hello {name}</p>';
      const html = await connector.addDnt(input, inlineConfig, { fileType: 'html', reset: true });
      expect(tokens(parse(html))).to.deep.equal([]);
      for (let index = 0; index < 2; index += 1) {
        const jsonHtml = await connector.addDnt(JSON.stringify(sheet(['Hello {name}'])), inlineConfig, { fileType: 'json' });
        expect(tokens(parse(jsonHtml))).to.deep.equal(['{name}']);
      }
      const nextHtml = await connector.addDnt(input, inlineConfig, { fileType: 'html' });
      expect(tokens(parse(nextHtml))).to.deep.equal([]);
    });

    it('preserves literal delimiter case, parentheses, and HTML-sensitive token text', async () => {
      const value = 'Hello BEGIN(Name)END {a<&"b} begin(other)end';
      const json = sheet([value]);
      const html = await add(json, [rule('between(BEGIN(, )END)'), rule('between({, })')]);
      expect(tokens(parse(html))).to.deep.equal(['BEGIN(Name)END', '{a<&"b}']);
      expect(JSON.parse(await remove(html))).to.deep.equal(json);
    });

    it('does not nest wrappers for overlapping or duplicate rules', async () => {
      const doc = parse(await add(sheet(['Before {{count}} after']), [
        rule('between({, })'), rule('between({{, }})'), rule('between({, })'),
      ]));
      expect(tokens(doc)).to.deep.equal(['{{count}}']);
      expect(doc.querySelector('.dnt-text .dnt-text')).to.equal(null);
    });

    it('keeps existing whole-cell and row exclusions ahead of inline protection', async () => {
      const json = sheet(['https://example.com/{id}', 'Leave {name} alone', 'Hello {name}']);
      json.data[1][':translate'] = 'no';
      const doc = parse(await add(json, [
        { pattern: 'beginsWith(http:// || https://)', action: 'dnt' },
        rule('between({, })'),
      ]));
      expect(tokens(doc)).to.deep.equal(['{name}']);
      const first = doc.querySelector('[key="Value"]');
      expect(first.hasAttribute('translate') || first.hasAttribute('data-inner-html')).to.equal(true);
    });

    it('protects values across multiple sheets without changing excluded columns', async () => {
      const json = {
        ':type': 'multi-sheet',
        ':names': ['messages', 'more', 'dnt'],
        messages: sheet(['Hello {name}']),
        more: sheet(['Items {{count}}']),
        dnt: {
          total: 1,
          offset: 0,
          limit: 1,
          data: [{ 'dnt-sheet': '*', 'dnt-columns': 'Key' }],
        },
      };
      json.messages.data[0].Key = '{identifier}';
      const html = await add(json, [rule('between({, })')]);
      expect(tokens(parse(html))).to.deep.equal(['{name}', '{{count}}']);
      const result = JSON.parse(await remove(html));
      expect(result.messages.data).to.deep.equal(json.messages.data);
      expect(result.more.data).to.deep.equal(json.more.data);
    });

    it('round-trips pipe-separated cells without losing their segment structure', async () => {
      const json = sheet(['Hello {name} | Items {count}']);
      const html = await add(json, [rule('between({, })')]);
      expect(tokens(parse(html))).to.deep.equal(['{name}', '{count}']);
      expect(JSON.parse(await remove(html))).to.deep.equal(json);
    });

    it('rejects invalid inline rules with an actionable error', async () => {
      const patterns = ['contains({ || })', 'between({)', 'between(, })', 'between({, }, ])'];
      for (const pattern of patterns) {
        try {
          await add(sheet(['Hello {name}']), [rule(pattern)]);
          expect.fail(`Expected an error for ${pattern}`);
        } catch (error) {
          expect(error.message).to.include('dnt-inline');
          expect(error.message).to.include('between');
        }
      }
    });
  });

  describe('inline spreadsheet DNT with document-path exclusions', () => {
    const inlineConfig = {
      ...config([rule('between({, })')]),
      dnt: {
        data: [{ 'dnt-sheet': '/placeholders/shared:messages', 'dnt-columns': 'Key' }],
      },
    };
    const prepare = async (json, siteConfig, path) => {
      const html = await standard.addDnt(JSON.stringify(json), siteConfig, { fileType: 'json', path });
      return parse(html);
    };

    it('keeps path-excluded columns untouched while protecting tokens in other cells', async () => {
      const json = {
        ':type': 'multi-sheet',
        ':names': ['messages', 'other'],
        messages: sheet(['Items {count}']),
        other: sheet(['Hello {name}']),
      };
      json.messages.data[0].Key = '{identifier}';
      const matched = await prepare(json, inlineConfig, '/placeholders/shared.json');
      expect(matched.querySelector('[name="messages"] [key="Key"]').getAttribute('translate')).to.equal('no');
      expect(tokens(matched)).to.deep.equal(['{count}', '{name}']);
      const unmatched = await prepare(json, inlineConfig, '/placeholders/other.json');
      expect(tokens(unmatched)).to.deep.equal(['{identifier}', '{count}', '{name}']);
    });

    it('lets whole-tab and whole-document exclusions take precedence over inline protection', async () => {
      const json = {
        ':type': 'multi-sheet',
        ':names': ['messages', 'other'],
        messages: sheet(['Items {count}']),
        other: sheet(['Hello {name}']),
      };
      const exclude = (ref) => ({
        ...inlineConfig,
        dnt: { data: [{ 'dnt-sheet': ref, 'dnt-columns': '*' }] },
      });
      const tab = await prepare(json, exclude('/placeholders/shared:messages'), '/placeholders/shared.json');
      expect(tab.querySelector('[name="messages"]').getAttribute('translate')).to.equal('no');
      expect(tokens(tab)).to.deep.equal(['{name}']);
      const all = await prepare(json, exclude('/placeholders/shared'), '/placeholders/shared.json');
      expect(all.querySelector('[name="messages"]').getAttribute('translate')).to.equal('no');
      expect(all.querySelector('[name="other"]').getAttribute('translate')).to.equal('no');
      expect(tokens(all)).to.deep.equal([]);
    });

    it('resolves named single-tab exclusions without disabling inline protection in other columns', async () => {
      const json = { ...sheet(['Items {count}']), ':sheetname': 'messages' };
      json.data[0].Key = '{identifier}';
      const doc = await prepare(json, inlineConfig, '/placeholders/shared.json');
      expect(doc.querySelector('[name="default"] [key="Key"]').getAttribute('translate')).to.equal('no');
      expect(tokens(doc)).to.deep.equal(['{count}']);
      const result = await standard.removeDnt({
        html: doc.documentElement.outerHTML, org: 'org', site: 'site', ext: 'json',
      });
      expect(JSON.parse(result)).to.deep.equal(json);
    });
  });
});
