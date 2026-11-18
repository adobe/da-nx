import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderUiArtifact } from '../../../../../nx2/blocks/chat-ao/artifacts/index.js';
import { tokenizeCode } from '../../../../../nx2/blocks/chat-ao/artifacts/utils/code-block.js';

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

const nextFrame = () => new Promise((resolve) => { requestAnimationFrame(resolve); });

async function highlighted({ text, language }) {
  await tokenizeCode({ text, language });
  await nextFrame();
}

function mount(template) {
  const host = document.createElement('div');
  render(template, host);
  return host;
}

function codeArtifact(props) {
  return renderUiArtifact({ components: [{ type: 'CodeBlock', props }] });
}

describe('artifacts CodeBlock', () => {
  it('preserves plain code for absent or unsupported languages, including Python', async () => {
    const plain = mount(codeArtifact({ code: 'plain text' }));
    const python = mount(codeArtifact({ language: 'python', code: PYTHON }));
    const py = mount(codeArtifact({ language: 'py', code: PYTHON }));
    const unknown = mount(codeArtifact({ language: 'unknown-language', code: 'plain text' }));
    await nextFrame();
    [plain, unknown].forEach((host) => {
      expect(host.querySelector('code').textContent).to.equal('plain text');
      expect(host.querySelector('.token')).to.equal(null);
    });
    [python, py].forEach((host) => {
      expect(host.querySelector('code').textContent).to.equal(PYTHON);
      expect(host.querySelector('.token')).to.equal(null);
    });
  });

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

  it('preserves the flat Python API example as plain code without altering or executing it', async () => {
    const host = mount(renderUiArtifact({
      title: 'Sample Python',
      components: [{ id: 'root', component: 'CodeBlock', language: 'python', code: PYTHON }],
    }));
    expect(host.querySelector('code').textContent).to.equal(PYTHON);
    await highlighted({ text: PYTHON, language: 'python' });
    expect(host.querySelector('.ui-artifact-title').textContent).to.equal('Sample Python');
    expect(host.querySelector('code').textContent).to.equal(PYTHON);
    expect(host.querySelector('.code-block-lang').textContent).to.equal('python');
    expect(host.querySelector('.token')).to.equal(null);
    expect(host.querySelector('img, script, .ui-artifact-fallback')).to.equal(null);
  });

  [
    { language: ' JavaScript ', text: 'const total = 3;' },
    { language: 'javascript', text: 'const total = 3;' },
    { language: 'js', text: 'const total = 3;' },
    { language: 'json', text: '{"total": 3}' },
    { language: 'css', text: 'a { color: red; }' },
    { language: 'markup', text: '<div>Hello</div>' },
    { language: 'html', text: '<div>Hello</div>' },
    { language: 'xml', text: '<node>value</node>' },
    { language: 'svg', text: '<svg></svg>' },
  ].forEach(({ language, text }) => {
    it(`highlights the supported language or alias ${language}`, async () => {
      const host = mount(codeArtifact({ language, code: text }));
      await highlighted({ text, language });
      expect(host.querySelector('code').textContent).to.equal(text);
      expect(host.querySelector('.token')).to.exist;
    });
  });

  it('reuses highlighted content without sharing DOM nodes between artifacts', async () => {
    const text = '{"total": 3}';
    const hosts = [mount(codeArtifact({ code: text, language: 'json' })),
      mount(codeArtifact({ code: text, language: 'JSON' }))];
    await highlighted({ text, language: 'json' });
    hosts.forEach((host) => {
      expect(host.querySelector('code').textContent).to.equal(text);
      expect(host.querySelector('.token.property').textContent).to.equal('"total"');
    });
    expect(hosts[0].querySelector('.token.property'))
      .not.to.equal(hosts[1].querySelector('.token.property'));
  });

  it('copies the original code, not the highlighted spans', async () => {
    const original = navigator.clipboard.writeText;
    const copied = [];
    navigator.clipboard.writeText = async (text) => { copied.push(text); };
    try {
      const text = 'const token = "<your-token>";';
      const host = mount(codeArtifact({ language: 'javascript', code: text }));
      await highlighted({ text, language: 'javascript' });
      expect(host.querySelector('.token')).to.exist;
      host.querySelector('.message-action-copy').click();
      expect(copied).to.deep.equal([text]);
    } finally {
      navigator.clipboard.writeText = original;
    }
  });

  it('renders HTML-looking strings safely as text', async () => {
    const text = 'const value = "<img src=x onerror=alert(1)>";';
    const host = mount(codeArtifact({ language: 'javascript', code: text }));
    await highlighted({ text, language: 'javascript' });
    expect(host.querySelector('code').textContent).to.equal(text);
    expect(host.querySelector('.token.string')).to.exist;
    expect(host.querySelector('img')).to.equal(null);
  });

  it('does not overwrite newer code when an earlier highlighting promise resolves', async () => {
    const host = mount(codeArtifact({ language: 'javascript', code: 'const earlier = 1;' }));
    const text = 'const latest = 42;';
    render(codeArtifact({ language: 'javascript', code: text }), host);
    await highlighted({ text, language: 'javascript' });
    expect(host.querySelector('code').textContent).to.equal(text);
    expect(host.querySelector('.code-block-lang').textContent).to.equal('javascript');
    expect(host.querySelector('.token.keyword').textContent).to.equal('const');
  });

  it('reuses tokenization and rendered spans when unchanged code is rendered again', async () => {
    const { default: prism } = await import('../../../../../nx/blocks/form/deps/prism.js');
    const original = prism.tokenize;
    const text = 'const reusable = 17;';
    const calls = [];
    prism.tokenize = (value, grammar) => {
      if (value === text) calls.push(value);
      return original(value, grammar);
    };
    try {
      const host = mount(codeArtifact({ language: 'javascript', code: text }));
      await nextFrame();
      const keyword = host.querySelector('.token.keyword');
      expect(keyword).to.exist;
      render(codeArtifact({ language: ' JavaScript ', code: text }), host);
      expect(host.querySelector('.token.keyword')).to.equal(keyword);
      await nextFrame();
      expect(host.querySelector('.token.keyword')).to.equal(keyword);
      expect(host.querySelector('code').textContent).to.equal(text);
      expect(calls).to.have.length(1);
    } finally {
      prism.tokenize = original;
    }
  });

  it('invalidates reused highlighting when either code or language changes', async () => {
    const host = mount(codeArtifact({ language: 'javascript', code: 'const value = true;' }));
    await nextFrame();
    render(codeArtifact({ language: 'javascript', code: 'const value = false;' }), host);
    await nextFrame();
    expect(host.querySelector('.token.boolean').textContent).to.equal('false');
    render(codeArtifact({ language: 'text', code: 'const value = false;' }), host);
    await nextFrame();
    expect(host.querySelector('.token.boolean')).to.equal(null);
    expect(host.querySelector('code').textContent).to.equal('const value = false;');
  });

  it('limits reuse to 16 entries and evicts the least recently used highlight', async () => {
    const { default: prism } = await import('../../../../../nx/blocks/form/deps/prism.js');
    const original = prism.tokenize;
    const texts = Array.from({ length: 17 }, (_, index) => `const cachedCode${index} = ${index};`);
    const calls = [];
    prism.tokenize = (text, grammar) => {
      if (texts.includes(text)) calls.push(text);
      return original(text, grammar);
    };
    const show = (code) => mount(codeArtifact({ code, language: 'javascript' }));
    try {
      texts.slice(0, 16).forEach(show);
      await nextFrame();
      show(texts[0]);
      show(texts[16]);
      show(texts[0]);
      show(texts[1]);
      await nextFrame();
      expect(calls.filter((text) => text === texts[0])).to.have.length(1);
      expect(calls.filter((text) => text === texts[1])).to.have.length(2);
      expect(calls.filter((text) => text === texts[16])).to.have.length(1);
    } finally {
      prism.tokenize = original;
    }
  });

  it('logs highlighting failures and preserves readable code', async () => {
    const { default: prism } = await import('../../../../../nx/blocks/form/deps/prism.js');
    const originalTokenize = prism.tokenize;
    const originalWarn = console.warn;
    const warnings = [];
    const error = new Error('Highlighting failed');
    const text = 'const retryHighlight = 5;';
    const host = document.createElement('div');
    prism.tokenize = () => { throw error; };
    console.warn = (...args) => { warnings.push(args); };
    try {
      render(codeArtifact({ language: 'javascript', code: text }), host);
      await nextFrame();
      expect(host.querySelector('code').textContent).to.equal(text);
      expect(host.querySelector('.token')).to.equal(null);
      expect(warnings).to.deep.equal([
        ['Unable to highlight code artifact; keeping plain text.', error],
      ]);
    } finally {
      prism.tokenize = originalTokenize;
      console.warn = originalWarn;
    }
    render(codeArtifact({ language: 'javascript', code: text }), host);
    await nextFrame();
    expect(host.querySelector('.token.keyword')).to.exist;
    expect(host.querySelector('code').textContent).to.equal(text);
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
