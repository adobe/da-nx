import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';

const PYTHON = `import requests

ACCESS_TOKEN = "<your-token>"
API_KEY = "<your-api-key>"
ORG_ID = "<your-org-id>"

headers = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "x-api-key": API_KEY,
    "x-gw-ims-org-id": ORG_ID,
    "x-sandbox-name": "prod",
}

resp = requests.get(
    "https://platform.adobe.io/data/foundation/catalog/dataSets",
    headers=headers,
    params={"limit": 5},
)
resp.raise_for_status()

for ds_id, ds in resp.json().items():
    print(f"{ds_id}: {ds.get('name')}")`;

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

  it('preserves the flat Python API example as plain code without altering or executing it', () => {
    const host = mount(renderUiArtifact({
      title: 'Sample Python',
      components: [{ id: 'root', component: 'CodeBlock', language: 'python', code: PYTHON }],
    }));
    expect(host.querySelector('.ui-artifact-title').textContent).to.equal('Sample Python');
    expect(host.querySelector('code').textContent).to.equal(PYTHON);
    expect(host.querySelector('.code-block-lang').textContent).to.equal('python');
    expect(host.querySelector('img, script, .ui-artifact-fallback')).to.equal(null);
  });

  it('copies the original code', () => {
    const original = navigator.clipboard.writeText;
    const copied = [];
    navigator.clipboard.writeText = async (text) => { copied.push(text); };
    try {
      const text = 'const token = "<your-token>";';
      const host = mount(codeArtifact({ language: 'javascript', code: text }));
      host.querySelector('.message-action-copy').click();
      expect(copied).to.deep.equal([text]);
    } finally {
      navigator.clipboard.writeText = original;
    }
  });

  it('renders HTML-looking strings safely as text', () => {
    const text = 'const value = "<img src=x onerror=alert(1)>";';
    const host = mount(codeArtifact({ language: 'javascript', code: text }));
    expect(host.querySelector('code').textContent).to.equal(text);
    expect(host.querySelector('img')).to.equal(null);
  });

  it('replaces the code when the artifact is rendered again', () => {
    const host = mount(codeArtifact({ language: 'javascript', code: 'const earlier = 1;' }));
    render(codeArtifact({ language: 'css', code: 'a { color: red; }' }), host);
    expect(host.querySelector('code').textContent).to.equal('a { color: red; }');
    expect(host.querySelector('.code-block-lang').textContent).to.equal('css');
  });

  [{ code: { path: '/code' } }, { code: 'text', language: { path: '/language' } }].forEach((props) => {
    it(`uses the artifact fallback for nonliteral fields ${JSON.stringify(props)}`, () => {
      const host = mount(renderUiArtifact({
        components: [{ id: 'root', component: 'CodeBlock', ...props }],
        textFallback: 'Code sample.',
      }));
      expect(host.querySelector('code')).to.equal(null);
      expect(host.querySelector('.ui-artifact-fallback').textContent).to.equal('Code sample.');
    });
  });
});
