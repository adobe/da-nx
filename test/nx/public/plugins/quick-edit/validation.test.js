import { expect } from '@esm-bundle/chai';
import {
  VALIDATION_SEVERITY,
  MESSAGE_TYPES,
  isValidValidationItem,
  sanitizeValidationItems,
  registerValidationPort,
  onValidationRequest,
} from '../../../../../nx/public/plugins/quick-edit/validation.js';

function validItem(overrides = {}) {
  return {
    severity: VALIDATION_SEVERITY.WARN,
    title: 'Alt text',
    message: 'Missing alt text',
    item: { proseIndex: 2 },
    ...overrides,
  };
}

function waitForMessage(port) {
  return new Promise((resolve) => {
    port.onmessage = (e) => resolve(e.data);
  });
}

afterEach(() => {
  // Unregisters the previous test's runner so state doesn't leak.
  onValidationRequest(null);
});

describe('isValidValidationItem', () => {
  it('accepts an item with only a proseIndex', () => {
    expect(isValidValidationItem(validItem())).to.be.true;
  });

  it('accepts an item with only a blockIndex', () => {
    expect(isValidValidationItem(validItem({ item: { blockIndex: 0 } }))).to.be.true;
  });

  it('rejects an unknown severity', () => {
    expect(isValidValidationItem(validItem({ severity: 'critical' }))).to.be.false;
  });

  it('rejects a message over the max length', () => {
    expect(isValidValidationItem(validItem({ message: 'x'.repeat(501) }))).to.be.false;
  });

  it('rejects a missing or over-length title', () => {
    expect(isValidValidationItem(validItem({ title: '' }))).to.be.false;
    expect(isValidValidationItem(validItem({ title: 'x'.repeat(101) }))).to.be.false;
  });

  it('rejects an item with both blockIndex and proseIndex', () => {
    const item = validItem({ item: { blockIndex: 0, proseIndex: 0 } });
    expect(isValidValidationItem(item)).to.be.false;
  });

  it('rejects an item with neither blockIndex nor proseIndex', () => {
    expect(isValidValidationItem(validItem({ item: {} }))).to.be.false;
  });

  it('rejects non-object input', () => {
    expect(isValidValidationItem(null)).to.be.false;
    expect(isValidValidationItem('nope')).to.be.false;
  });
});

describe('sanitizeValidationItems', () => {
  it('filters out malformed items, keeping well-shaped ones', () => {
    const good1 = validItem();
    const good2 = validItem({ title: 'SEO' });
    const items = [good1, { severity: 'nope' }, good2];
    expect(sanitizeValidationItems(items)).to.deep.equal([good1, good2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(sanitizeValidationItems(null)).to.deep.equal([]);
    expect(sanitizeValidationItems(undefined)).to.deep.equal([]);
  });
});

describe('registerValidationPort / onValidationRequest', () => {
  it('no-ops on an undefined port', () => {
    expect(() => registerValidationPort(undefined)).to.not.throw();
  });

  it('reports hasRunner: false and no items when no runner is registered', async () => {
    const { port1, port2 } = new MessageChannel();
    registerValidationPort(port2);
    const resultPromise = waitForMessage(port1);
    port1.postMessage({ type: MESSAGE_TYPES.RUN, requestId: 'r1' });
    expect(await resultPromise).to.deep.equal({
      type: MESSAGE_TYPES.RESULT, requestId: 'r1', items: [], hasRunner: false,
    });
  });

  it('runs the registered runner and returns sanitized items with hasRunner: true', async () => {
    const { port1, port2 } = new MessageChannel();
    const good = validItem();
    onValidationRequest(() => [good, { severity: 'bogus' }]);
    registerValidationPort(port2);
    const resultPromise = waitForMessage(port1);
    port1.postMessage({ type: MESSAGE_TYPES.RUN, requestId: 'r2' });
    expect(await resultPromise).to.deep.equal({
      type: MESSAGE_TYPES.RESULT, requestId: 'r2', items: [good], hasRunner: true,
    });
  });

  it('returns no items (but hasRunner: true) when the runner throws', async () => {
    const { port1, port2 } = new MessageChannel();
    onValidationRequest(() => { throw new Error('boom'); });
    registerValidationPort(port2);
    const resultPromise = waitForMessage(port1);
    port1.postMessage({ type: MESSAGE_TYPES.RUN, requestId: 'r3' });
    expect(await resultPromise).to.deep.equal({
      type: MESSAGE_TYPES.RESULT, requestId: 'r3', items: [], hasRunner: true,
    });
  });

  it('replacing the runner via a second onValidationRequest call is used on the next run', async () => {
    const { port1, port2 } = new MessageChannel();
    onValidationRequest(() => [validItem({ title: 'First' })]);
    onValidationRequest(() => [validItem({ title: 'Second' })]);
    registerValidationPort(port2);
    const resultPromise = waitForMessage(port1);
    port1.postMessage({ type: MESSAGE_TYPES.RUN, requestId: 'r4' });
    const { items } = await resultPromise;
    expect(items).to.deep.equal([validItem({ title: 'Second' })]);
  });

  it('ignores messages that are not RUN', async () => {
    const { port1, port2 } = new MessageChannel();
    registerValidationPort(port2);
    let called = false;
    port1.onmessage = () => { called = true; };
    port1.postMessage({ type: 'not-run' });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(called).to.be.false;
  });
});
