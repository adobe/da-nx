import { expect } from '@esm-bundle/chai';
import { isToolbarShortcut, setupToolbarShortcut } from '../../../../../nx/public/plugins/quick-edit/src/toolbar-shortcut.js';

describe('quick-edit toolbar shortcut', () => {
  let ctx;
  let posted;

  const press = (init) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    document.body.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    posted = [];
    ctx = { port: { postMessage: (message) => posted.push(message) } };
  });

  afterEach(() => {
    document.removeEventListener('keydown', ctx.toolbarShortcutListener);
  });

  it('matches Alt+F10 only', () => {
    expect(isToolbarShortcut({ altKey: true, key: 'F10' })).to.equal(true);
    expect(isToolbarShortcut({ altKey: false, key: 'F10' })).to.equal(false);
    expect(isToolbarShortcut({ altKey: true, shiftKey: true, key: 'F10' })).to.equal(false);
    expect(isToolbarShortcut({ altKey: true, ctrlKey: true, key: 'F10' })).to.equal(false);
    expect(isToolbarShortcut({ altKey: true, metaKey: true, key: 'F10' })).to.equal(false);
    expect(isToolbarShortcut({ altKey: true, key: 'F9' })).to.equal(false);
  });

  it('relays Alt+F10 to the host and swallows it', () => {
    setupToolbarShortcut(ctx);
    const event = press({ altKey: true, key: 'F10' });
    expect(posted).to.deep.equal([{ type: 'focus-toolbar' }]);
    expect(event.defaultPrevented).to.equal(true);
  });

  it('ignores other keys', () => {
    setupToolbarShortcut(ctx);
    const event = press({ key: 'F10' });
    expect(posted).to.deep.equal([]);
    expect(event.defaultPrevented).to.equal(false);
  });

  it('installs the listener only once per session', () => {
    setupToolbarShortcut(ctx);
    setupToolbarShortcut(ctx);
    press({ altKey: true, key: 'F10' });
    expect(posted).to.have.length(1);
  });
});
