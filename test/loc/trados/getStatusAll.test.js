import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { getSourceFileStatus, getLangStatus } from '../../../nx/blocks/loc/connectors/trados/index.js';

async function loadMock(name) {
  const text = await readFile({ path: `./mocks/${name}.json` });
  return JSON.parse(text);
}

let allCompleted;
let sourceFailed;
let sourceCanceled;
let langPartial;
let langFailed;

before(async () => {
  [allCompleted, sourceFailed, sourceCanceled, langPartial, langFailed] = await Promise.all([
    loadMock('all-completed'),
    loadMock('source-failed'),
    loadMock('source-canceled'),
    loadMock('lang-partial'),
    loadMock('lang-failed'),
  ]);
});

// --- getSourceFileStatus ---

describe('getSourceFileStatus', () => {
  it('should return null when all source tasks completed', () => {
    expect(getSourceFileStatus(allCompleted.items)).to.be.null;
  });

  it('should return null for empty tasks array', () => {
    expect(getSourceFileStatus([])).to.be.null;
  });

  it('should return null when no source tasks exist (only lang tasks)', () => {
    const langOnly = allCompleted.items.filter((t) => t.input.type === 'targetFile');
    expect(getSourceFileStatus(langOnly)).to.be.null;
  });

  it('should return error when a source task failed', () => {
    expect(getSourceFileStatus(sourceFailed.items)).to.equal('error');
  });

  it('should return canceled when a source task is canceled', () => {
    expect(getSourceFileStatus(sourceCanceled.items)).to.equal('canceled');
  });

  it('should prioritize failed over canceled', () => {
    // Combine both failure modes into one task list
    const mixed = [...sourceFailed.items, ...sourceCanceled.items];
    expect(getSourceFileStatus(mixed)).to.equal('error');
  });
});

// --- getLangStatus ---

describe('getLangStatus', () => {
  it('should return translated when all file-delivery tasks completed (de-DE)', () => {
    const result = getLangStatus(allCompleted.items, 'de-DE', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return translated when all file-delivery tasks completed (fr-FR)', () => {
    const result = getLangStatus(allCompleted.items, 'fr-FR', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return in progress when delivery not complete for lang', () => {
    // lang-partial has de-DE delivered but fr-FR only through machine-translation
    const result = getLangStatus(langPartial.items, 'fr-FR', 1);
    expect(result.status).to.equal('in progress');
    expect(result.translated).to.equal(0);
  });

  it('should return translated for lang that is fully delivered', () => {
    const result = getLangStatus(langPartial.items, 'de-DE', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return in progress for empty tasks', () => {
    const result = getLangStatus([], 'de-DE', 1);
    expect(result.status).to.equal('in progress');
    expect(result.translated).to.equal(0);
  });

  it('should return error when a lang task failed', () => {
    // lang-failed has fr-FR machine-translation failed
    const result = getLangStatus(langFailed.items, 'fr-FR', 1);
    expect(result.status).to.equal('error');
    expect(result.translated).to.equal(0);
  });

  it('should not be affected by other language failures', () => {
    // de-DE should still be translated even though fr-FR failed
    const result = getLangStatus(langFailed.items, 'de-DE', 1);
    expect(result.status).to.equal('translated');
    expect(result.translated).to.equal(1);
  });

  it('should return translated count even on error', () => {
    // lang-failed has de-DE file-delivery completed but fr-FR failed
    const result = getLangStatus(langFailed.items, 'fr-FR', 1);
    expect(result.translated).to.equal(0);
  });

  it('should return in progress when fileCount exceeds delivered', () => {
    // all-completed has 1 file-delivery per lang, but we say there are 5 files
    const result = getLangStatus(allCompleted.items, 'de-DE', 5);
    expect(result.status).to.equal('in progress');
    expect(result.translated).to.equal(1);
  });
});
