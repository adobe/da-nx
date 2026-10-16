import { expect } from '@esm-bundle/chai';
import {
  canSuggest, shortElementName, toEvalGroup, suggestTitle, buildFallbackMessage,
} from '../../../../../nx2/blocks/chat-ao/artifacts/suggest-element.js';
import { parseActionMessage } from '../../../../../nx2/blocks/chat-ao/utils/action-message.js';

describe('shortElementName', () => {
  it('keeps simple names and names the block plus kind for outline labels', () => {
    expect(shortElementName('Hero')).to.equal('Hero');
    expect(shortElementName('Section 1 › cards (tiles) — Heading 5')).to.equal('Cards (tiles) heading 5');
    expect(shortElementName('Section 1 › hero — Heading 1: “Born from a passion”')).to.equal('Hero heading 1');
    expect(shortElementName('Section 7 › reward (light, left) — Button')).to.equal('Reward (light, left) button');
  });

  it('uses the kind alone for default content and does not repeat a block kind', () => {
    expect(shortElementName('Section 1 › Default content — Heading 1')).to.equal('Heading 1');
    expect(shortElementName('Section 2 › Image — Image')).to.equal('Image');
    expect(shortElementName('Footer — Paragraph')).to.equal('Footer paragraph');
    expect(shortElementName('')).to.equal('Element');
  });
});

describe('canSuggest', () => {
  const items = [{ title: 'T', suggestion: { evidence: [] } }];
  it('is true for element sections with suggestions only', () => {
    expect(canSuggest({ key: 'el-hero', label: 'Hero', items })).to.equal(true);
    expect(canSuggest({ key: 'el-page', label: 'Whole page', items })).to.equal(false);
    expect(canSuggest({ key: 'el-x', label: 'Whole page', items })).to.equal(false);
    expect(canSuggest({ key: 'el-hero', label: 'Hero', items: [{ title: 'T', check: {} }] })).to.equal(false);
    expect(canSuggest(undefined)).to.equal(false);
  });
});

describe('fallback message', () => {
  const group = toEvalGroup({
    section: { key: 'el-h5', label: 'Section 1 › cards (tiles) — Heading 5' },
    findings: [
      {
        id: 'a',
        title: 'Brand Voice',
        issue: 'Stray number looks careless.',
        suggested: 'Curated Bundles',
        evidence: [{ anchorType: 'text', anchorText: 'Bundles 123', occurrence: 2 }],
      },
      { id: 'b', title: 'Vocabulary', description: 'Feels unfinished.', suggested: 'n/a', evidence: [] },
    ],
  });

  it('builds the group of the SUGGEST_ELEMENT event', () => {
    expect(group).to.include({ key: 'el-h5', name: 'Cards (tiles) heading 5' });
    expect(group.findings).to.have.length(2);
    expect(suggestTitle(group.name)).to.equal('Cards (tiles) heading 5 failure: Generate suggestion');
  });

  it('is an action message that names the skill, the element, the checks and the hints', () => {
    const text = buildFallbackMessage({ group, evaluatedUrl: 'https://main--s--o.preview.da.live/p' });
    const { title, body } = parseActionMessage(text);
    expect(title).to.equal('Cards (tiles) heading 5 failure: Generate suggestion');
    const lines = body.split('\n');
    expect(lines[0]).to.equal('/aem-governance-element-suggestions');
    expect(lines).to.include('Evaluated URL: https://main--s--o.preview.da.live/p');
    expect(lines).to.include('Element: Section 1 › cards (tiles) — Heading 5');
    expect(lines).to.include('Locate: text "Bundles 123", occurrence 2');
    expect(lines).to.include('Failing checks (2):');
    expect(lines).to.include('1. Brand Voice — Stray number looks careless. Hint: "Curated Bundles"');
    expect(lines).to.include('2. Vocabulary — Feels unfinished.');
    expect(lines.at(-1)).to.equal('Give 3 options, each fixing ALL failing checks.');
  });

  it('locates an image by file name and omits the URL line when unknown', () => {
    const imageGroup = toEvalGroup({
      section: { key: 'el-i', label: 'Section 1 › cards — Image' },
      findings: [{ id: 'i', title: 'Color', evidence: [{ anchorType: 'image', src: 'https://x/media_abc.png?width=750' }] }],
    });
    const { body } = parseActionMessage(buildFallbackMessage({ group: imageGroup }));
    expect(body).to.contain('Locate: image media_abc.png, occurrence 1');
    expect(body).to.not.contain('Evaluated URL');
  });
});
