import { expect } from '@esm-bundle/chai';
import '../../../../nx2/blocks/editortoggle/editortoggle.js';

describe('nx-editortoggle', () => {
  const originalUrl = window.location.href;
  const userKey = 'nx2:ew-user-enabled';
  const welcomeKey = 'nx2:ew-welcome-pending';
  const switchbackKey = 'nx2:ew-switchback-pending';
  let toggle;
  let storedFlags;

  beforeEach(() => {
    storedFlags = [userKey, welcomeKey, switchbackKey].map((key) => localStorage.getItem(key));
    [userKey, welcomeKey, switchbackKey].forEach((key) => localStorage.removeItem(key));
  });

  afterEach(() => {
    toggle?.remove();
    window.history.replaceState(null, '', originalUrl);
    [userKey, welcomeKey, switchbackKey].forEach((key, index) => {
      if (storedFlags[index] === null) localStorage.removeItem(key);
      else localStorage.setItem(key, storedFlags[index]);
    });
  });

  async function expectToolbarOn(path, userEnabled, checked) {
    window.history.replaceState(null, '', path);
    toggle = document.createElement('nx-editortoggle');
    document.body.append(toggle);
    toggle._siteEwEnabled = false;
    toggle._userEnabled = userEnabled;
    await toggle.updateComplete;

    const control = toggle.shadowRoot.querySelector('nx-switch');
    expect(control).to.not.be.null;
    expect(control.label).to.equal('New Authoring');
    await control.updateComplete;
    const button = control.shadowRoot.querySelector('button');
    expect(button?.getAttribute('role')).to.equal('switch');
    expect(button?.getAttribute('aria-checked')).to.equal(checked);
    expect(localStorage.getItem(userKey)).to.be.null;
  }

  it('renders the toolbar switch off on /edit regardless of the user flag', async () => {
    await expectToolbarOn('/edit', false, 'false');
    toggle._userEnabled = true;
    await toggle.updateComplete;
    expect(toggle.shadowRoot.querySelector('nx-switch').checked).to.be.false;
  });

  it('renders the toolbar switch on on /canvas regardless of the user flag', async () => {
    await expectToolbarOn('/canvas', false, 'true');
    toggle._userEnabled = true;
    await toggle.updateComplete;
    expect(toggle.shadowRoot.querySelector('nx-switch').checked).to.be.true;
  });

  it('handles the shared switch change once when clicked', async () => {
    window.history.replaceState(null, '', '/edit');
    toggle = document.createElement('nx-editortoggle');
    let changes = 0;
    toggle._toggle = () => { changes += 1; };
    document.body.append(toggle);
    await toggle.updateComplete;

    const control = toggle.shadowRoot.querySelector('nx-switch');
    await control.updateComplete;
    control.shadowRoot.querySelector('button').click();

    expect(control.checked).to.be.true;
    expect(changes).to.equal(1);
  });

  it('hides the switch outside the editor', async () => {
    window.history.replaceState(null, '', '/');
    toggle = document.createElement('nx-editortoggle');
    document.body.append(toggle);
    toggle._siteEwEnabled = false;
    await toggle.updateComplete;

    expect(toggle.shadowRoot.querySelector('nx-switch')).to.be.null;
  });
});
