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
