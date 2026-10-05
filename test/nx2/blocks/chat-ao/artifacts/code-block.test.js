import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

function codeArtifact(props) {
  return renderUiArtifact({ components: [{ type: 'CodeBlock', props }] });
}

describe('artifacts CodeBlock', () => {
  it('renders the code and language label', () => {
    const host = mount(codeArtifact({ language: 'python', code: 'print(1)' }));

    expect(host.querySelector('.code-block-lang').textContent).to.equal('python');
    expect(host.querySelector('pre > code').textContent).to.equal('print(1)');
  });

  it('falls back to the "content" prop when "code" is absent', () => {
    const host = mount(codeArtifact({ language: 'sql', content: 'SELECT 1' }));

    expect(host.querySelector('pre > code').textContent).to.equal('SELECT 1');
  });

  it('omits the language label when no language is given', () => {
    const host = mount(codeArtifact({ code: 'echo hi' }));

    expect(host.querySelector('.code-block-lang')).to.equal(null);
  });

  it('renders a copy button', () => {
    const host = mount(codeArtifact({ language: 'python', code: 'print(1)' }));

    expect(host.querySelector('.message-action-copy')).to.exist;
  });

  it('renders without throwing when no props are given', () => {
    const host = mount(codeArtifact({}));

    expect(host.querySelector('pre > code').textContent).to.equal('');
  });
});
