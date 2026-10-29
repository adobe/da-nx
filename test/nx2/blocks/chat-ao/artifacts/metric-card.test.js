import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

function metricArtifact(props) {
  return renderUiArtifact({ components: [{ type: 'MetricCard', props }] });
}

describe('artifacts MetricCard', () => {
  it('renders the label and value', () => {
    const host = mount(metricArtifact({ label: 'Total Users', value: '12,847' }));

    expect(host.querySelector('.ui-artifact-metric-label').textContent).to.equal('Total Users');
    expect(host.querySelector('.ui-artifact-metric-value').textContent).to.equal('12,847');
  });

  it('formats the upstream monthly revenue artifact without changing its trend', () => {
    const host = mount(renderUiArtifact({
      title: 'Monthly Revenue',
      components: [{
        id: 'root',
        component: 'MetricCard',
        label: 'Monthly Revenue (USD)',
        value: {
          call: 'formatCurrency',
          args: { value: 128450, currency: 'USD', decimals: 0 },
        },
        trend: 'up',
        change: '+12.4% vs. last month',
      }],
    }));

    expect(host.querySelector('.ui-artifact-title').textContent).to.equal('Monthly Revenue');
    expect(host.querySelector('.ui-artifact-metric-label').textContent).to.equal('Monthly Revenue (USD)');
    expect(host.querySelector('.ui-artifact-metric-value').textContent).to.equal('$128,450');
    expect(host.querySelector('.ui-artifact-metric-trend-up').textContent.trim())
      .to.equal('↑ +12.4% vs. last month');
    expect(host.querySelector('.ui-artifact-fallback')).to.equal(null);
  });

  [
    { amount: 0, currency: 'USD', expected: '$0.00' },
    { amount: -12.5, currency: 'USD', decimals: 2, expected: '-$12.50' },
    { amount: 1234, currency: 'JPY', expected: '¥1,234' },
    { amount: 1.234, currency: 'USD', decimals: 1, expected: '$1.2' },
  ].forEach(({
    amount, currency, decimals, expected,
  }) => {
    it(`formats a legacy currency value as ${expected}`, () => {
      const host = mount(metricArtifact({
        value: { call: 'formatCurrency', args: { value: amount, currency, decimals } },
      }));
      expect(host.querySelector('.ui-artifact-metric-value').textContent).to.equal(expected);
    });
  });

  [0, -12.5, ''].forEach((value) => {
    it(`preserves literal metric value ${JSON.stringify(value)}`, () => {
      const host = mount(metricArtifact({ value }));
      expect(host.querySelector('.ui-artifact-metric-value').textContent).to.equal(String(value));
    });
  });

  [
    { call: 'unknownFunction', args: {} },
    { path: '/revenue' },
    { call: 'formatCurrency' },
    { call: 'formatCurrency', args: [] },
    { call: 'formatCurrency', args: { value: '128450', currency: 'USD' } },
    { call: 'formatCurrency', args: { value: { path: '/revenue' }, currency: 'USD' } },
    { call: 'formatCurrency', args: { value: Infinity, currency: 'USD' } },
    { call: 'formatCurrency', args: { value: 128450, currency: 'invalid' } },
    { call: 'formatCurrency', args: { value: 128450, currency: 123 } },
    { call: 'formatCurrency', args: { value: 128450, currency: 'USD', decimals: -1 } },
    { call: 'formatCurrency', args: { value: 128450, currency: 'USD', decimals: 1.5 } },
    { call: 'formatCurrency', args: { value: 128450, currency: 'USD', decimals: 21 } },
    { call: 'formatCurrency', args: { value: 128450, currency: 'USD', decimals: '0' } },
    null,
    [],
  ].forEach((value) => {
    it(`uses the artifact fallback for unsupported value ${JSON.stringify(value)}`, () => {
      const host = mount(renderUiArtifact({
        textFallback: 'Monthly Revenue: $128,450.',
        components: [{ id: 'root', component: 'MetricCard', value }],
      }));
      expect(host.querySelector('.ui-artifact-metric')).to.equal(null);
      expect(host.querySelector('.ui-artifact-fallback').textContent)
        .to.equal('Monthly Revenue: $128,450.');
      expect(host.textContent).not.to.contain('[object Object]');
    });
  });

  it('shows the standard unsupported-content message when no fallback is supplied', () => {
    const host = mount(metricArtifact({ value: { call: 'unknownFunction' } }));
    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('Unsupported content.');
  });

  it('renders the trend and change when both are given', () => {
    const host = mount(metricArtifact({
      label: 'Total Users', value: '12,847', trend: 'up', change: '+340',
    }));

    const trend = host.querySelector('.ui-artifact-metric-trend-up');
    expect(trend).to.exist;
    expect(trend.textContent.trim()).to.equal('↑ +340');
  });

  it('omits the trend row when trend is given without a change value', () => {
    const host = mount(metricArtifact({ label: 'Total Users', value: '12,847', trend: 'up' }));

    expect(host.querySelector('.ui-artifact-metric-trend-up')).to.equal(null);
  });

  it('applies a tone class to the value for semantic coloring', () => {
    const host = mount(metricArtifact({ label: 'Errors', value: '12', tone: 'negative' }));

    expect(host.querySelector('.ui-artifact-metric-negative')).to.exist;
  });

  it('renders without throwing when no props are given', () => {
    const host = mount(metricArtifact({}));

    expect(host.querySelector('.ui-artifact-metric-label').textContent).to.equal('');
    expect(host.querySelector('.ui-artifact-metric-value').textContent).to.equal('');
  });

  it('renders several MetricCards in a Row, matching AO\'s documented pattern', () => {
    const host = mount(renderUiArtifact({
      components: [{
        type: 'Row',
        children: [
          { type: 'MetricCard', props: { label: 'Total Reach', value: '4.2M', trend: 'up', change: '+18%' } },
          { type: 'MetricCard', props: { label: 'CTR', value: '3.8%', trend: 'down', change: '-0.4%' } },
        ],
      }],
    }));

    const cards = host.querySelectorAll('.ui-artifact-row .ui-artifact-metric');
    expect(cards).to.have.length(2);
  });
});
