import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

describe('artifacts renderUiArtifact', () => {
  it('renders nothing for a missing artifact', () => {
    const host = mount(renderUiArtifact(undefined));
    expect(host.textContent.trim()).to.equal('');
  });

  it('renders the text_fallback when there are no components', () => {
    const host = mount(renderUiArtifact({ components: [], textFallback: 'just text' }));
    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('just text');
  });

  it('renders a title when one is given', () => {
    const host = mount(renderUiArtifact({
      title: 'Plan summary',
      components: [{ type: 'Markdown', props: { content: 'hello' } }],
    }));
    expect(host.querySelector('.ui-artifact-title').textContent).to.equal('Plan summary');
  });

  it('renders a Markdown component through the shared markdown pipeline', () => {
    const host = mount(renderUiArtifact({
      components: [{ type: 'Markdown', props: { content: '**bold**' } }],
    }));
    expect(host.querySelector('.ui-artifact-markdown strong').textContent).to.equal('bold');
  });

  it('falls back for an unregistered component type without dropping the artifact', () => {
    const host = mount(renderUiArtifact({
      textFallback: 'a chart you cannot see yet',
      components: [{ type: 'Visualization', props: {} }],
    }));
    expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('a chart you cannot see yet');
  });

  describe('flat A2UI records', () => {
    it('renders from the root record and resolves children by id', () => {
      const host = mount(renderUiArtifact({
        components: [
          { id: 'root', component: 'Column', children: ['intro', 'card'] },
          { id: 'intro', component: 'Markdown', content: '**hello**' },
          { id: 'card', component: 'Card', child: 'note' },
          { id: 'note', component: 'Markdown', content: 'inside card' },
        ],
      }));

      expect(host.querySelector('.ui-artifact-markdown strong').textContent).to.equal('hello');
      expect(host.querySelector('.ui-artifact-card .ui-artifact-markdown').textContent)
        .to.contain('inside card');
      // Children render once, under their parent — not again at the top level.
      expect(host.querySelectorAll('.ui-artifact-markdown')).to.have.length(2);
    });

    it('passes the record fields (not id/component) to the renderer', () => {
      const host = mount(renderUiArtifact({
        components: [{
          id: 'root', component: 'MetricCard', label: 'Failures', value: 3,
        }],
      }));

      expect(host.querySelector('.ui-artifact-metric-label').textContent).to.equal('Failures');
      expect(host.querySelector('.ui-artifact-metric-value').textContent).to.equal('3');
    });

    it('renders a PageEvaluationWithIcons root record', () => {
      const host = mount(renderUiArtifact({
        components: [{
          id: 'root',
          component: 'PageEvaluationWithIcons',
          title: 'Site page evaluation',
          summary: [{ label: 'Failures', value: 1, tone: 'negative' }],
          sections: [],
        }],
      }));

      const el = host.querySelector('nx-page-eval');
      expect(el).to.exist;
      expect(el.data.title).to.equal('Site page evaluation');
      expect(el.data).to.not.have.property('component');
      expect(el.data).to.not.have.property('id');
    });

    it('falls back to the first record when there is no root', () => {
      const host = mount(renderUiArtifact({
        components: [{ id: 'only', component: 'Markdown', content: 'no root here' }],
      }));

      expect(host.querySelector('.ui-artifact-markdown').textContent).to.contain('no root here');
    });

    it('falls back to text_fallback for an unknown component', () => {
      const host = mount(renderUiArtifact({
        textFallback: 'plain summary',
        components: [{ id: 'root', component: 'NeverRegistered' }],
      }));

      expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('plain summary');
    });
  });
});
