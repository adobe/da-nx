import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';
import { toEvalFindings } from '../../../../../nx2/blocks/chat-ao/artifacts/page-evaluation.js';
import { toUiArtifact } from '../../../../../nx2/blocks/chat-ao/utils/episodes.js';
import { EVAL_EVENT } from '../../../../../nx2/utils/evaluation-events.js';

const FIXTURES = new URL('../../../../../nx2/blocks/chat-ao/dev/fixtures/', import.meta.url);
const loadFixture = async (name) => (await fetch(new URL(name, FIXTURES).href)).json();

const mount = (uiArtifact) => {
  const host = document.createElement('div');
  document.body.append(host);
  render(renderUiArtifact(uiArtifact), host);
  return host;
};

const withItems = (items, extra = {}) => ({
  sections: [{ key: 'f', label: 'Failures', tone: 'negative', items }],
  ...extra,
});

describe('toEvalFindings', () => {
  it('builds one finding per suggestion item across sections, in order, with evidence passed through', () => {
    const data = {
      sections: [
        {
          items: [
            { id: 'a', title: 'A', description: 'da' },
            {
              id: 'b',
              title: 'B',
              description: 'db',
              suggestion: {
                label: 'lb',
                assetType: 'text',
                issue: 'ib',
                suggested: 'sb',
                context: { category: 'c' },
                evidence: [{ anchorType: 'text', anchorText: 'q', replacement: 'r' }],
              },
            },
          ],
        },
        { items: [{ id: 'c', title: 'C', check: { label: 'x' } }, { id: 'd', title: 'D', suggestion: {} }] },
      ],
    };

    expect(toEvalFindings(data)).to.deep.equal([
      {
        id: 'b',
        title: 'B',
        description: 'db',
        label: 'lb',
        assetType: 'text',
        issue: 'ib',
        suggested: 'sb',
        context: { category: 'c' },
        evidence: [{ anchorType: 'text', anchorText: 'q', replacement: 'r' }],
      },
      { id: 'd', title: 'D', evidence: [] },
    ]);
  });

  it('falls back to <sectionIndex>-<itemIndex> when an item has no id', () => {
    const findings = toEvalFindings({
      sections: [{ items: [{ title: 'x' }] }, { items: [{ title: 'y' }, { title: 'z', suggestion: {} }] }],
    });
    expect(findings.map((f) => f.id)).to.deep.equal(['1-1']);
  });

  it('returns [] for missing data', () => {
    expect(toEvalFindings(undefined)).to.deep.equal([]);
    expect(toEvalFindings({})).to.deep.equal([]);
  });

  ['frescopa-draft.artifact.json', 'frescopa-draft.nested.artifact.json'].forEach((file) => {
    it(`derives the seven failures from ${file}`, async () => {
      const { components } = toUiArtifact(await loadFixture(file));
      const data = components[0].props ?? components[0];
      const findings = toEvalFindings(data);

      expect(findings.map((f) => f.id)).to.deep.equal([
        'fail-header_copy', 'fail-tone_of_voice', 'fail-body_copy', 'fail-eyebrow',
        'fail-superlative_claims', 'fail-call_to_action', 'fail-image_brand_alignment',
      ]);
      expect(new Set(findings.map((f) => f.id)).size).to.equal(findings.length);

      const byId = Object.fromEntries(findings.map((f) => [f.id, f]));
      expect(byId['fail-header_copy'].evidence[0]).to.include({
        anchorType: 'text', anchorText: 'Born from a passion for exceptional coffee.',
      });
      expect(byId['fail-header_copy'].evidence[0].replacement).to.be.a('string');
      expect(byId['fail-tone_of_voice'].evidence[0].anchorText)
        .to.equal(byId['fail-header_copy'].evidence[0].anchorText);
      expect(byId['fail-eyebrow'].evidence[0]).to.deep.equal({ anchorType: 'text', anchorText: 'Our Story' });
      expect(byId['fail-call_to_action'].evidence).to.deep.equal([]);
      expect(byId['fail-image_brand_alignment'].evidence[0].anchorType).to.equal('image');
      expect(byId['fail-image_brand_alignment'].evidence[0].src).to.contain('media_179c2472c582176bc491cf55256cfd8e9635aa0f5.png');
      expect(byId['fail-header_copy'].context).to.have.property('category');
    });
  });
});

describe('page evaluation "View suggestions"', () => {
  const items = [
    {
      id: 'f1',
      title: 'Header copy',
      suggestion: { issue: 'generic', suggested: 'better', evidence: [{ anchorType: 'text', anchorText: 'q' }] },
    },
    { id: 'f2', title: 'Other', suggestion: { issue: 'i2' } },
  ];
  let events;
  let listener;
  let claim;

  const onFocus = (e) => {
    events.push(e);
    if (claim) e.preventDefault();
  };

  beforeEach(() => {
    events = [];
    claim = false;
    listener = onFocus;
    document.addEventListener(EVAL_EVENT.FOCUS_FINDING, listener);
  });

  afterEach(() => {
    document.removeEventListener(EVAL_EVENT.FOCUS_FINDING, listener);
    document.body.querySelectorAll('div').forEach((d) => d.querySelector('nx-page-eval') && d.remove());
  });

  const mountEval = async (data) => {
    const host = mount({ components: [{ id: 'root', component: 'PageEvaluationWithIcons', ...data }] });
    const el = host.querySelector('nx-page-eval');
    await el.updateComplete;
    return el;
  };

  const clickItem = (el, index) => {
    el.shadowRoot.querySelectorAll('.ui-artifact-pe-item-action')[index].click();
  };

  const waitFor = async (fn) => {
    for (let i = 0; i < 50 && !fn(); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 20); });
    }
  };

  it('dispatches a cancelable FOCUS_FINDING with the clicked id and all findings, and opens the dialog when unclaimed', async () => {
    const el = await mountEval(withItems(items));
    clickItem(el, 0);

    expect(events).to.have.length(1);
    const [event] = events;
    expect(event.cancelable).to.equal(true);
    expect(event.detail.findingId).to.equal('f1');
    expect(event.detail.findings.map((f) => f.id)).to.deep.equal(['f1', 'f2']);
    expect(event.detail.findings[0].evidence).to.deep.equal([{ anchorType: 'text', anchorText: 'q' }]);

    await waitFor(() => el._modal);
    await el.updateComplete;
    expect(el._modal.index).to.equal(0);
    expect(el.shadowRoot.querySelector('nx-dialog')).to.exist;
  });

  it('keeps the original dialog behavior for suggestions without resolvable evidence', async () => {
    const el = await mountEval(withItems(items));
    clickItem(el, 1);

    expect(events).to.have.length(0);
    await waitFor(() => el._modal);
    await el.updateComplete;
    expect(el._modal.kind).to.equal('suggestion');
    expect(el._modal.index).to.equal(1);
    expect(el.shadowRoot.querySelector('nx-dialog')).to.exist;
  });

  it('does nothing else when the host claims the event', async () => {
    claim = true;
    const el = await mountEval(withItems(items));
    clickItem(el, 0);
    await new Promise((r) => { setTimeout(r, 50); });
    await el.updateComplete;

    expect(events).to.have.length(1);
    expect(el._modal).to.equal(undefined);
    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
  });

  it('uses <section>-<item> as the finding id when the item has none', async () => {
    const el = await mountEval(withItems([{
      title: 'No id',
      suggestion: { issue: 'x', evidence: [{ anchorType: 'text', anchorText: 'q' }] },
    }]));
    clickItem(el, 0);
    expect(events[0].detail.findingId).to.equal('0-0');
  });

  it('keeps today\'s behaviour for check-only items: no event, dialog opens', async () => {
    const el = await mountEval(withItems([{ id: 'c1', title: 'Check', check: { label: 'Label' } }]));
    clickItem(el, 0);
    await waitFor(() => el._modal);

    expect(events).to.have.length(0);
    expect(el._modal.kind).to.equal('check');
  });
});
