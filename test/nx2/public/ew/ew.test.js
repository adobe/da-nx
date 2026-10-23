import { expect } from '@esm-bundle/chai';

const SHARED = ['--nx-ui-text-heading', '--nx-ui-text-title', '--nx-ui-text-content', '--nx-ui-line-content'];

async function readTokens(href) {
  const sheet = new CSSStyleSheet();
  await sheet.replace(await (await fetch(href)).text());
  document.adoptedStyleSheets = [sheet];
  const read = () => Object.fromEntries(SHARED.map((name) => [
    name, getComputedStyle(document.body).getPropertyValue(name).trim(),
  ]));
  const s = read();
  document.body.classList.add('ui-size-m');
  const m = read();
  document.body.classList.remove('ui-size-m');
  document.adoptedStyleSheets = [];
  return { s, m };
}

describe('EW extension kit', () => {
  it('matches the EW ui-size text tokens in S and M', async () => {
    const ew = await readTokens('/nx2/styles/styles.css');
    const kit = await readTokens('/nx2/public/ew/ew.css');
    expect(kit.s).to.deep.equal(ew.s);
    expect(kit.m).to.deep.equal(ew.m);
    expect(kit.s['--nx-ui-text-content']).to.equal('14px');
    expect(kit.m['--nx-ui-text-content']).to.equal('16px');
  });
});
