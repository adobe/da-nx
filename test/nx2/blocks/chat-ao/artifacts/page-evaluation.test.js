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

describe('page evaluation "View failure"', () => {
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

  it('labels the button "View failure" for findings and marks the claimed one as selected', async () => {
    claim = true;
    const el = await mountEval(withItems(items));
    const buttons = [...el.shadowRoot.querySelectorAll('.ui-artifact-pe-item-action')];
    expect(buttons.map((b) => b.textContent.trim())).to.deep.equal(['View failure', 'View failure']);
    expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'false')).to.equal(true);

    clickItem(el, 0);
    await el.updateComplete;
    const after = [...el.shadowRoot.querySelectorAll('.ui-artifact-pe-item-action')];
    expect(after[0].classList.contains('selected')).to.equal(true);
    expect(after[0].getAttribute('aria-pressed')).to.equal('true');
    expect(after[1].classList.contains('selected')).to.equal(false);
  });

  it('does not select a finding the host did not claim', async () => {
    const el = await mountEval(withItems(items));
    clickItem(el, 0);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.ui-artifact-pe-item-action.selected')).to.equal(null);
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

describe('page evaluation layout', () => {
  afterEach(() => {
    document.body.querySelectorAll('div').forEach((d) => d.querySelector('nx-page-eval') && d.remove());
  });

  const mountEval = async (data) => {
    const host = mount({ components: [{ id: 'root', component: 'PageEvaluationWithIcons', ...data }] });
    const el = host.querySelector('nx-page-eval');
    await el.updateComplete;
    return el;
  };

  const suggestion = { issue: 'i' };
  const elementSection = (key, label, count, defaultOpen = true) => ({
    key,
    label,
    tone: 'negative',
    defaultOpen,
    items: Array.from({ length: count }, (_, i) => ({ id: `${key}-${i}`, title: `Check ${i}`, suggestion })),
  });

  it('groups element sections under one Failures card with a failures badge and a checks-failed line', async () => {
    const el = await mountEval({
      sections: [
        elementSection('el-a', 'Hero', 3),
        elementSection('el-b', 'Body', 1, false),
        { key: 'passes', label: 'Passes', tone: 'positive', items: [{ title: 'ok' }] },
      ],
    });
    const cards = el.shadowRoot.querySelectorAll('.ui-artifact-pe-section');
    expect(cards).to.have.length(2);
    expect(cards[0].querySelector('.ui-artifact-pe-section-label').textContent).to.equal('Failures');
    expect(cards[0].querySelector('.ui-artifact-pe-section-sublabel').textContent).to.equal('2 elements failed');
    expect(cards[0].open).to.equal(true);

    const rows = cards[0].querySelectorAll('.ui-artifact-pe-el');
    const text = (sel) => [...rows].map((r) => r.querySelector(sel).textContent);
    expect(text('.ui-artifact-pe-el-name')).to.deep.equal(['Hero', 'Body']);
    expect(text('.ui-artifact-pe-badge')).to.deep.equal(['3 failures', '1 failure']);
    expect(text('.ui-artifact-pe-el-sub')).to.deep.equal(['3 checks failed', '1 check failed']);
    expect(rows[0].open).to.equal(true);
    expect(rows[1].open).to.equal(false);

    expect(cards[1].querySelector('.ui-artifact-pe-section-label').textContent).to.equal('Passes');
    expect(cards[1].querySelector('.ui-artifact-pe-el')).to.equal(null);
  });

  it('keeps sections without an el- key as standalone cards', async () => {
    const el = await mountEval({ sections: [{ key: 'f', label: 'Failures', tone: 'negative', items: [{ title: 'x', suggestion }] }] });
    expect(el.shadowRoot.querySelectorAll('.ui-artifact-pe-section')).to.have.length(1);
    expect(el.shadowRoot.querySelector('.ui-artifact-pe-el')).to.equal(null);
    expect(el.shadowRoot.querySelector('.ui-artifact-pe-item-action').textContent.trim()).to.equal('View failure');
  });

  it('points the icon masks at existing public icon files', async () => {
    const el = await mountEval({ sections: [elementSection('el-a', 'Hero', 1)] });
    const names = ['close-circle', 'checkmark-circle', 'chevron-down', 'chevron-left'];
    await Promise.all(names.map(async (name) => {
      const value = el.style.getPropertyValue(`--nx-pe-icon-${name}`);
      const href = value.match(/url\("(.+)"\)/)?.[1];
      expect(href, name).to.be.a('string');
      expect((await fetch(href)).ok, href).to.equal(true);
    }));
  });
});

describe('page evaluation "Generate suggestion"', () => {
  const element = (key, label, suggestion = true) => ({
    key,
    label,
    tone: 'negative',
    defaultOpen: true,
    items: [
      {
        id: `${key}-0`,
        title: 'Brand Voice',
        description: 'Too loud.',
        ...(suggestion && {
          suggestion: {
            issue: 'Too loud.',
            suggested: 'Calmer',
            evidence: [{ anchorType: 'text', anchorText: 'LOUD HEADLINE' }],
          },
        }),
      },
    ],
  });
  const data = {
    title: 'Frescopa page evaluation',
    sections: [
      element('el-page', 'Whole page'),
      element('el-hero', 'Section 1 › hero — Heading 1'),
      element('el-plain', 'Plain', false),
    ],
  };
  const URL_A = 'https://main--frescopa--exp-workspace.preview.da.live/drafts/a';
  const URL_B = 'https://main--frescopa--exp-workspace.preview.da.live/drafts/b';

  let hosts;
  let suggestEvents;
  let prompts;
  let claim;
  let chatEvent;
  const onSuggest = (e) => {
    suggestEvents.push(e);
    if (claim) e.preventDefault();
  };
  const onPrompt = (e) => prompts.push(e.detail);

  before(async () => {
    ({ CHAT_EVENT: chatEvent } = await import('../../../../../nx2/utils/chat.js'));
  });

  beforeEach(() => {
    hosts = [];
    suggestEvents = [];
    prompts = [];
    claim = false;
    document.addEventListener(EVAL_EVENT.SUGGEST_ELEMENT, onSuggest);
    document.addEventListener(chatEvent.SET_PROMPT, onPrompt);
  });

  afterEach(() => {
    document.removeEventListener(EVAL_EVENT.SUGGEST_ELEMENT, onSuggest);
    document.removeEventListener(chatEvent.SET_PROMPT, onPrompt);
    hosts.forEach((h) => h.remove());
  });

  const mountCard = async (ctx = {}, props = data) => {
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    render(renderUiArtifact({ components: [{ id: 'root', component: 'PageEvaluationWithIcons', ...props }] }, ctx), host);
    const el = host.querySelector('nx-page-eval');
    await el.updateComplete;
    return el;
  };
  const buttons = (el) => [...el.shadowRoot.querySelectorAll('.ui-artifact-pe-generate')];
  const waitFor = async (fn) => {
    for (let i = 0; i < 50 && !fn(); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 20); });
    }
  };

  it('shows the button on failing elements with suggestions, not on "Whole page" or plain rows', async () => {
    const el = await mountCard();
    const rows = [...el.shadowRoot.querySelectorAll('.ui-artifact-pe-el')];
    expect(rows.map((r) => !!r.querySelector('.ui-artifact-pe-generate'))).to.deep.equal([false, true, false]);
    expect(buttons(el)[0].textContent.trim()).to.equal('Generate suggestion');
    expect(buttons(el)[0].closest('summary')).to.not.equal(null);
  });

  it('dispatches a cancelable SUGGEST_ELEMENT with the element group and keeps the row open', async () => {
    const el = await mountCard({ evaluatedUrl: URL_A });
    claim = true;
    buttons(el)[0].click();
    await el.updateComplete;

    expect(suggestEvents).to.have.length(1);
    const [event] = suggestEvents;
    expect(event.cancelable).to.equal(true);
    expect(event.detail.evaluatedUrl).to.equal(URL_A);
    expect(event.detail.group).to.include({ key: 'el-hero', label: 'Section 1 › hero — Heading 1', name: 'Hero heading 1' });
    expect(event.detail.group.findings.map((f) => f.id)).to.deep.equal(['el-hero-0']);
    expect(event.detail.group.findings[0]).to.include({ title: 'Brand Voice', issue: 'Too loud.', suggested: 'Calmer' });
    expect(event.detail.group.findings[0].evidence).to.deep.equal([{ anchorType: 'text', anchorText: 'LOUD HEADLINE' }]);
    expect(el.shadowRoot.querySelectorAll('.ui-artifact-pe-el')[1].open).to.equal(true);
    expect(prompts).to.have.length(0);
  });

  it('disables the button as "Generating suggestions…" so it cannot be clicked twice', async () => {
    const el = await mountCard();
    claim = true;
    buttons(el)[0].click();
    await el.updateComplete;
    const [btn] = buttons(el);
    expect(btn.disabled).to.equal(true);
    expect(btn.textContent.trim()).to.equal('Generating suggestions…');
    btn.click();
    expect(suggestEvents).to.have.length(1);
  });

  it('sends a plain action message through SET_PROMPT when no host claims the event', async () => {
    const el = await mountCard({ evaluatedUrl: URL_A });
    buttons(el)[0].click();
    await waitFor(() => prompts.length);

    expect(prompts).to.have.length(1);
    expect(prompts[0].autoSend).to.equal(true);
    const [title, marker, skill] = prompts[0].text.split('\n');
    expect(title).to.equal('Hero heading 1 failure: Generate suggestion');
    expect(marker).to.equal('<!--nx:details-->');
    expect(skill).to.equal('/aem-governance-element-suggestions');
    expect(prompts[0].text).to.contain(`Evaluated URL: ${URL_A}`);
    expect(prompts[0].text).to.contain('Locate: text "LOUD HEADLINE", occurrence 1');
  });

  it('frees the button again when the turn it started ends without a newer card', async () => {
    const el = await mountCard();
    claim = true;
    buttons(el)[0].click();
    await el.updateComplete;
    el.busy = true;
    await el.updateComplete;
    expect(buttons(el)[0].disabled).to.equal(true);
    el.busy = false;
    await el.updateComplete;
    expect(buttons(el)[0].disabled).to.equal(false);
    expect(buttons(el)[0].textContent.trim()).to.equal('Generate suggestion');
  });

  describe('a newer evaluation of the same page', () => {
    const standIn = (el) => el.shadowRoot.querySelector('.ui-artifact-pe-superseded');

    it('collapses the older card to one line and leaves the newest card as it is', async () => {
      const older = await mountCard({ evaluatedUrl: URL_A });
      expect(standIn(older)).to.equal(null);
      const newer = await mountCard({ evaluatedUrl: URL_A });
      await older.updateComplete;

      expect(standIn(older).textContent.trim()).to.equal('Superseded by a newer evaluation');
      expect(older.shadowRoot.querySelector('.ui-artifact-pe')).to.equal(null);
      expect(older.hasAttribute('superseded')).to.equal(true);
      expect(standIn(newer)).to.equal(null);
      expect(newer.shadowRoot.querySelector('.ui-artifact-pe')).to.not.equal(null);
    });

    it('keeps cards of other pages and treats the editor and preview URL as the same page', async () => {
      const a = await mountCard({ evaluatedUrl: URL_A });
      await mountCard({ evaluatedUrl: URL_B });
      await a.updateComplete;
      expect(standIn(a)).to.equal(null);

      await mountCard({ evaluatedUrl: 'https://da.live/canvas#/exp-workspace/frescopa/drafts/a' });
      await a.updateComplete;
      expect(standIn(a)).to.not.equal(null);
    });

    it('expands the old card on click and drops it back to a line on the next click', async () => {
      const older = await mountCard({ evaluatedUrl: URL_A });
      await mountCard({ evaluatedUrl: URL_A });
      await older.updateComplete;
      standIn(older).click();
      await older.updateComplete;
      expect(older.shadowRoot.querySelector('.ui-artifact-pe')).to.not.equal(null);
      expect(standIn(older).getAttribute('aria-expanded')).to.equal('true');
      standIn(older).click();
      await older.updateComplete;
      expect(older.shadowRoot.querySelector('.ui-artifact-pe')).to.equal(null);
    });

    it('resets the "Generating suggestions…" state of the card that was replaced', async () => {
      const older = await mountCard({ evaluatedUrl: URL_A });
      claim = true;
      buttons(older)[0].click();
      await older.updateComplete;
      expect(buttons(older)[0].disabled).to.equal(true);

      await mountCard({ evaluatedUrl: URL_A });
      await older.updateComplete;
      standIn(older).click();
      await older.updateComplete;
      expect(buttons(older)[0].disabled).to.equal(false);
    });

    it('lets the card\'s own url win and falls back to the title without any url', async () => {
      const first = await mountCard({}, { ...data, url: URL_A });
      await mountCard({ evaluatedUrl: URL_B }, { ...data, url: URL_A });
      await first.updateComplete;
      expect(standIn(first)).to.not.equal(null);

      const x = await mountCard({}, { ...data, title: 'Other site evaluation' });
      await mountCard({}, { ...data, title: 'Third site evaluation' });
      await x.updateComplete;
      expect(standIn(x)).to.equal(null);
      await mountCard({}, { ...data, title: 'Other site evaluation' });
      await x.updateComplete;
      expect(standIn(x)).to.not.equal(null);
    });

    it('stops counting a replaced card once it leaves the page', async () => {
      const older = await mountCard({ evaluatedUrl: URL_A });
      const newer = await mountCard({ evaluatedUrl: URL_A });
      await older.updateComplete;
      newer.closest('div').remove();
      await older.updateComplete;
      expect(standIn(older)).to.equal(null);
    });
  });
});
