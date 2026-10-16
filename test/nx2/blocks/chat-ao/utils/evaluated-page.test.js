import { expect } from '@esm-bundle/chai';
import {
  pageIdentity, pageOfMessage, evaluatedPages,
} from '../../../../../nx2/blocks/chat-ao/utils/evaluated-page.js';

const PREVIEW = 'https://main--frescopa--exp-workspace.preview.da.live/drafts/ramirezc/index';

describe('pageIdentity', () => {
  it('is the same for the editor, preview, live and aem.page URLs of a page', () => {
    const key = 'exp-workspace/frescopa/drafts/ramirezc';
    expect(pageIdentity(PREVIEW)).to.equal(key);
    expect(pageIdentity('https://da.live/canvas#/exp-workspace/frescopa/drafts/ramirezc/index')).to.equal(key);
    expect(pageIdentity('https://main--frescopa--exp-workspace.aem.page/drafts/ramirezc/')).to.equal(key);
    expect(pageIdentity('https://main--frescopa--exp-workspace.aem.live/drafts/ramirezc.html?x=1#y')).to.equal(key);
  });

  it('tells pages apart and handles the site root and other hosts', () => {
    expect(pageIdentity('https://main--frescopa--exp-workspace.aem.page/')).to.equal('exp-workspace/frescopa');
    expect(pageIdentity(PREVIEW)).to.not.equal(pageIdentity(`${PREVIEW}2`));
    expect(pageIdentity('https://example.com/a/b/')).to.equal('example.com/a/b');
    expect(pageIdentity('not a url')).to.equal('');
  });
});

describe('pageOfMessage / evaluatedPages', () => {
  it('prefers the "Evaluated URL:" line, else the first URL, ignoring trailing punctuation', () => {
    const action = `Hero failure: Generate suggestion\n<!--nx:details-->\nPage: https://da.live/canvas#/o/s/x\nEvaluated URL: ${PREVIEW}\n`;
    expect(pageOfMessage(action)).to.deep.equal({ href: PREVIEW, key: 'exp-workspace/frescopa/drafts/ramirezc' });
    expect(pageOfMessage(`Evaluate ${PREVIEW}.`).href).to.equal(PREVIEW);
    expect(pageOfMessage('hello')).to.equal(null);
  });

  it('gives each message the page of the nearest earlier user message that names one', () => {
    const messages = [
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: `Evaluate ${PREVIEW}` },
      { role: 'assistant', uiArtifact: {} },
      { role: 'user', content: 'thanks, shorter please' },
      { role: 'assistant', uiArtifact: {} },
      { role: 'user', content: 'Evaluate https://example.com/other' },
      { role: 'assistant', uiArtifact: {} },
    ];
    expect(evaluatedPages(messages).map((p) => p?.key)).to.deep.equal([
      undefined,
      'exp-workspace/frescopa/drafts/ramirezc',
      'exp-workspace/frescopa/drafts/ramirezc',
      'exp-workspace/frescopa/drafts/ramirezc',
      'exp-workspace/frescopa/drafts/ramirezc',
      'example.com/other',
      'example.com/other',
    ]);
    expect(evaluatedPages(undefined)).to.deep.equal([]);
  });
});
