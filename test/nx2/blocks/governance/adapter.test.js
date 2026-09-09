import { expect } from '@esm-bundle/chai';
import { adaptEvaluation } from '../../../../nx2/blocks/governance/adapter.js';

const textCheck = ({
  title = 'Check', alignment = 'YES', reasoning = 'because', suggestions = null, category = 'Cat',
}) => ({
  check_title: title,
  alignment,
  reasoning,
  suggestions,
  category,
});

describe('governance adapter', () => {
  it('uses brand_name as the title, falling back to a default', () => {
    expect(adaptEvaluation({ brand_name: 'AstraZeneca' }).title).to.equal('AstraZeneca');
    expect(adaptEvaluation({}).title).to.equal('Page evaluation');
  });

  it('maps YES to a passing check item (View), NO+suggestions to a suggestion item', () => {
    const data = adaptEvaluation({
      text_evaluation: {
        evaluations: [
          textCheck({ title: 'Pass one', alignment: 'YES' }),
          textCheck({
            title: 'Fail one', alignment: 'NO', reasoning: 'wrong', suggestions: 'fix it',
          }),
        ],
      },
    });

    const failed = data.sections.find((s) => s.tone === 'negative');
    const passed = data.sections.find((s) => s.tone === 'positive');

    expect(passed.items[0].check).to.exist;
    expect(passed.items[0].suggestion).to.equal(undefined);
    expect(failed.items[0].suggestion).to.deep.include({ issue: 'wrong', suggested: 'fix it' });
    expect(failed.items[0].suggestion.context).to.deep.equal({ category: 'Cat', description: 'wrong' });
  });

  it('treats a failed check without suggestions as a check item, not a suggestion', () => {
    const data = adaptEvaluation({
      text_evaluation: { evaluations: [textCheck({ alignment: 'NO', suggestions: null })] },
    });
    const failed = data.sections.find((s) => s.tone === 'negative');
    expect(failed.items[0].suggestion).to.equal(undefined);
    expect(failed.items[0].check).to.exist;
  });

  it('maps unknown alignment to a Not applicable (neutral) section', () => {
    const data = adaptEvaluation({
      text_evaluation: { evaluations: [textCheck({ alignment: 'N/A' })] },
    });
    const na = data.sections.find((s) => s.tone === 'neutral');
    expect(na.label).to.equal('Not applicable');
    expect(na.items).to.have.length(1);
  });

  it('folds image-evaluation checks in and uses the image basename as the asset label', () => {
    const data = adaptEvaluation({
      image_evaluations: [
        {
          source: 'https://x/en/.heart-failure/hf-inzidenz-b1865518.jpg?v=1',
          evaluations: [textCheck({ title: 'Brand color', alignment: 'YES' })],
        },
      ],
    });
    const passed = data.sections.find((s) => s.tone === 'positive');
    expect(passed.items[0].check.label).to.equal('hf-inzidenz-b1865518.jpg');
  });

  it('builds summary tiles with counts and omits empty sections / the n-a tile', () => {
    const data = adaptEvaluation({
      text_evaluation: {
        evaluations: [
          textCheck({ alignment: 'YES' }),
          textCheck({ alignment: 'YES' }),
          textCheck({ alignment: 'NO', suggestions: 'fix' }),
        ],
      },
    });

    expect(data.summary).to.deep.equal([
      { label: 'Failed', value: 1, tone: 'negative' },
      { label: 'Passed', value: 2, tone: 'positive' },
    ]);
    expect(data.sections.map((s) => s.tone)).to.deep.equal(['negative', 'positive']);
    expect(data.sections.find((s) => s.tone === 'negative').defaultOpen).to.equal(true);
  });

  it('returns empty summary counts and no sections for an empty response', () => {
    const data = adaptEvaluation({});
    expect(data.sections).to.have.length(0);
    expect(data.summary).to.deep.equal([
      { label: 'Failed', value: 0, tone: 'negative' },
      { label: 'Passed', value: 0, tone: 'positive' },
    ]);
  });
});
