import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

function alertArtifact(props) {
  return renderUiArtifact({ components: [{ type: 'Alert', props }] });
}

describe('artifacts Alert', () => {
  it('renders the title in bold followed by the message', () => {
    const host = mount(alertArtifact({ severity: 'success', title: 'File saved', message: 'Your changes are now reflected.' }));

    const text = host.querySelector('.ui-artifact-alert-text');
    expect(text.querySelector('strong').textContent).to.equal('File saved');
    expect(text.textContent.trim()).to.equal('File saved Your changes are now reflected.');
  });

  it('applies the severity class for each known severity', () => {
    ['info', 'success', 'warning', 'error', 'critical'].forEach((severity) => {
      const host = mount(alertArtifact({ severity, message: 'x' }));
      expect(host.querySelector(`.ui-artifact-alert-${severity}`)).to.exist;
    });
  });

  it('accepts `level` as an alias for `severity` — the key actually seen on the wire', () => {
    const host = mount(alertArtifact({ level: 'warning', message: 'x' }));
    expect(host.querySelector('.ui-artifact-alert-warning')).to.exist;
  });

  it('accepts `variant` as an alias for `severity`, matching AO\'s own reference renderer', () => {
    const host = mount(alertArtifact({ variant: 'error', message: 'x' }));
    expect(host.querySelector('.ui-artifact-alert-error')).to.exist;
  });

  it('prefers `severity` over `level`/`variant` when more than one is present', () => {
    const host = mount(alertArtifact({ severity: 'success', level: 'error', message: 'x' }));
    expect(host.querySelector('.ui-artifact-alert-success')).to.exist;
  });

  it('falls back to info styling for an unknown or missing severity', () => {
    const host = mount(alertArtifact({ message: 'x' }));
    expect(host.querySelector('.ui-artifact-alert-info')).to.exist;

    const hostUnknown = mount(alertArtifact({ severity: 'mystery', message: 'x' }));
    expect(hostUnknown.querySelector('.ui-artifact-alert-info')).to.exist;
  });

  it('renders details and requiredAction when given', () => {
    const host = mount(alertArtifact({
      severity: 'error',
      message: 'Something failed.',
      details: 'Stack trace here.',
      requiredAction: 'Please retry.',
    }));

    expect(host.querySelector('.ui-artifact-alert-details').textContent).to.equal('Stack trace here.');
    expect(host.querySelector('.ui-artifact-alert-action').textContent).to.equal('Please retry.');
  });

  it('omits details and requiredAction when absent', () => {
    const host = mount(alertArtifact({ severity: 'warning', message: 'Heads up.' }));

    expect(host.querySelector('.ui-artifact-alert-details')).to.equal(null);
    expect(host.querySelector('.ui-artifact-alert-action')).to.equal(null);
  });

  it('renders the message alone, with no leading space, when there is no title', () => {
    const host = mount(alertArtifact({ severity: 'info', message: 'Just a message.' }));

    expect(host.querySelector('.ui-artifact-alert-text').textContent).to.equal('Just a message.');
  });
});
