import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

const BODY = { id: 'body', component: 'Text', text: 'Layout content' };
const FALLBACK = 'Layout unavailable.';

function artifact(component, fields = {}) {
  return renderUiArtifact({
    textFallback: FALLBACK,
    components: [{ id: 'root', component, children: ['body'], ...fields }, BODY],
  });
}

['Row', 'Column'].forEach((component) => {
  const selector = `.ui-artifact-${component.toLowerCase()}`;
  const mount = (fields) => {
    const host = document.createElement('div');
    render(artifact(component, fields), host);
    return host;
  };

  describe(`artifacts ${component} layout`, () => {
    it('applies literal spacing, alignment and wrapping while preserving child references', () => {
      const host = mount({
        gap: 16, justify: 'space-between', align: 'center', wrap: 'wrap',
      });
      const layout = host.querySelector(selector);
      expect(layout.style.gap).to.equal('var(--s2-spacing-200)');
      expect(layout.style.justifyContent).to.equal('space-between');
      expect(layout.style.alignItems).to.equal('center');
      expect(layout.style.flexWrap).to.equal('wrap');
      expect(layout.querySelector('.ui-artifact-text').textContent).to.equal(BODY.text);
      expect(host.querySelector('.ui-artifact-fallback')).to.equal(null);
    });

    it('preserves stylesheet defaults when layout fields are omitted', () => {
      const host = mount();
      expect(host.querySelector(selector).style.length).to.equal(0);
      expect(host.querySelector('.ui-artifact-text').textContent).to.equal(BODY.text);
    });

    it('maps every upstream gap token to shared spacing', () => {
      [
        [0, '0px'], [4, 'var(--s2-spacing-50)'], [8, 'var(--s2-spacing-100)'],
        [12, 'var(--s2-spacing-150)'], [16, 'var(--s2-spacing-200)'],
        [24, 'var(--s2-spacing-300)'], [32, 'var(--s2-spacing-400)'],
      ].forEach(([gap, expected]) => {
        expect(mount({ gap }).querySelector(selector).style.gap).to.equal(expected);
      });
    });

    [
      ['justify', 'justifyContent', [
        'start', 'center', 'end', 'space-between', 'space-around', 'space-evenly', 'stretch', 'normal',
      ]],
      ['align', 'alignItems', ['start', 'end', 'center', 'baseline', 'stretch']],
      ['wrap', 'flexWrap', ['nowrap', 'wrap', 'wrap-reverse']],
    ].forEach(([field, property, values]) => {
      it(`supports all upstream ${field} tokens`, () => {
        values.forEach((value) => {
          expect(mount({ [field]: value }).querySelector(selector).style[property]).to.equal(value);
        });
      });
    });

    it('removes old layout overrides when new fields are omitted', () => {
      const host = mount({
        gap: 0, justify: 'center', align: 'end', wrap: 'wrap-reverse',
      });
      render(artifact(component), host);
      expect(host.querySelector(selector).style.length).to.equal(0);
      expect(host.querySelector('.ui-artifact-text').textContent).to.equal(BODY.text);
    });

    it('supports the same layout fields for legacy nested children', () => {
      const host = document.createElement('div');
      render(renderUiArtifact({
        components: [{
          type: component,
          props: { gap: 4, align: 'end' },
          children: [{ type: 'Text', props: { text: BODY.text } }],
        }],
      }), host);
      const layout = host.querySelector(selector);
      expect(layout.style.gap).to.equal('var(--s2-spacing-50)');
      expect(layout.style.alignItems).to.equal('end');
      expect(layout.querySelector('.ui-artifact-text').textContent).to.equal(BODY.text);
    });

    [
      { gap: -4 }, { gap: 1 }, { gap: 100 }, { gap: '8' }, { gap: null },
      { gap: { path: '/spacing' } }, { justify: 'left; position: fixed' },
      { justify: { call: 'alignment' } }, { align: 'normal' }, { align: false },
      { wrap: true }, { wrap: { path: '/wrap' } },
    ].forEach((fields) => {
      it(`falls back for unsupported layout ${JSON.stringify(fields)}`, () => {
        const host = mount(fields);
        expect(host.querySelector(selector)).to.equal(null);
        expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal(FALLBACK);
      });
    });
  });
});
