import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

function mount(record, textFallback) {
  const host = document.createElement('div');
  render(renderUiArtifact({ components: [record], textFallback }), host);
  return host;
}

function alertRecord(fields = {}) {
  return { id: 'root', component: 'InlineAlert', ...fields };
}

describe('artifacts InlineAlert', () => {
  it('renders the upstream dataflow failure payload as a negative alert', () => {
    const description = 'The "CRM Daily Import" dataflow has failed 3 consecutive runs in the last 6 hours. 14,200 records were not ingested. Review the flow configuration and source connection to resume ingestion.';
    const host = mount(alertRecord({
      variant: 'negative', title: 'Dataflow failure detected', description,
    }));

    expect(host.querySelector('.ui-artifact-alert-negative')).to.exist;
    const text = host.querySelector('.ui-artifact-alert-text');
    expect(text.querySelector('strong').textContent).to.equal('Dataflow failure detected');
    expect(text.textContent).to.equal(`Dataflow failure detected ${description}`);
    expect(host.querySelector('.ui-artifact-fallback')).to.equal(null);
    expect(host.querySelector('.ui-artifact-alert-icon').getAttribute('aria-hidden')).to.equal('true');
  });

  ['informative', 'positive', 'notice', 'negative', 'neutral'].forEach((variant) => {
    it(`supports the ${variant} variant`, () => {
      const host = mount(alertRecord({ variant, description: 'Notice' }));
      expect(host.querySelector(`.ui-artifact-alert-${variant}`)).to.exist;
    });
  });

  it('defaults to informative when variant is omitted', () => {
    const host = mount(alertRecord({ description: 'Notice' }));
    expect(host.querySelector('.ui-artifact-alert-informative')).to.exist;
  });

  it('renders the description alone without a leading space', () => {
    const host = mount(alertRecord({ description: 'Just a description.' }));
    expect(host.querySelector('.ui-artifact-alert-text').textContent).to.equal('Just a description.');
    expect(host.querySelector('strong')).to.equal(null);
  });

  it('supports an optional title without a description', () => {
    const host = mount(alertRecord({ title: 'Review' }));
    expect(host.querySelector('.ui-artifact-alert-text').textContent.trim()).to.equal('Review');
  });

  it('supports nested InlineAlert records through the common artifact registry', () => {
    const host = mount({
      type: 'InlineAlert',
      props: { variant: 'positive', title: 'Saved', description: 'Changes saved.' },
    });
    expect(host.querySelector('.ui-artifact-alert-positive')).to.exist;
    expect(host.querySelector('.ui-artifact-alert-text').textContent).to.equal('Saved Changes saved.');
  });

  it('renders supplied text safely rather than treating it as markup', () => {
    const host = mount(alertRecord({
      title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>',
    }));
    expect(host.querySelector('img, script')).to.equal(null);
    expect(host.querySelector('.ui-artifact-alert-text').textContent)
      .to.equal('<img src=x onerror=alert(1)> <script>alert(1)</script>');
  });

  [
    { variant: 'unknown' },
    { variant: { path: '/variant' } },
    { title: { path: '/title' } },
    { description: { path: '/description' } },
  ].forEach((fields) => {
    it(`uses the artifact fallback for unsupported fields ${JSON.stringify(fields)}`, () => {
      const host = mount(alertRecord(fields), 'Review the dataflow.');
      expect(host.querySelector('.ui-artifact-alert')).to.equal(null);
      expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('Review the dataflow.');
    });
  });

  it('does not register the retired Alert component as an alias', () => {
    const host = mount({ id: 'root', component: 'Alert', message: 'Retired' }, 'Retired notice.');
    expect(host.querySelector('.ui-artifact-alert')).to.equal(null);
    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('Retired notice.');
  });
});
