import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { statusFor } from '../../../nx/blocks/loc/connectors/lionbridge/index.js';

async function loadMock(name) {
  const text = await readFile({ path: `./mocks/${name}.json` });
  return JSON.parse(text);
}

let allCompleted;
let langPartial;
let langRejected;
let langCanceled;

before(async () => {
  [allCompleted, langPartial, langRejected, langCanceled] = await Promise.all([
    loadMock('all-completed'),
    loadMock('lang-partial'),
    loadMock('lang-rejected'),
    loadMock('lang-canceled'),
  ]);
});

describe('statusFor', () => {
  it('should return translated when all requests reach REVIEW_TRANSLATION (fr-FR)', () => {
    const result = statusFor(allCompleted, 'fr-FR', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return translated when all requests reach REVIEW_TRANSLATION (de-DE)', () => {
    const result = statusFor(allCompleted, 'de-DE', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return in progress when a lang has not reached a ready status', () => {
    const result = statusFor(langPartial, 'fr-FR', 1);
    expect(result.status).to.equal('in progress');
    expect(result.translated).to.equal(0);
  });

  it('should return translated for a lang that is ready, independent of others', () => {
    const result = statusFor(langPartial, 'de-DE', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return in progress for an empty requests array', () => {
    const result = statusFor([], 'de-DE', 1);
    expect(result.status).to.equal('in progress');
    expect(result.translated).to.equal(0);
  });

  it('should return error when a lang request was rejected', () => {
    const result = statusFor(langRejected, 'fr-FR', 1);
    expect(result.status).to.equal('error');
    expect(result.translated).to.equal(0);
  });

  it('should not be affected by another language being rejected', () => {
    const result = statusFor(langRejected, 'de-DE', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return canceled when a lang request was cancelled', () => {
    const result = statusFor(langCanceled, 'fr-FR', 1);
    expect(result.status).to.equal('canceled');
    expect(result.translated).to.equal(0);
  });

  it('should return in progress when fileCount exceeds ready requests', () => {
    const result = statusFor(allCompleted, 'de-DE', 5);
    expect(result.status).to.equal('in progress');
    expect(result.translated).to.equal(1);
  });
});
