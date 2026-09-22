import { expect } from '@esm-bundle/chai';
import {
  VALIDATION_SEVERITY,
  MESSAGE_TYPES,
  isValidCustomValidationItem,
  sanitizeCustomValidationItems,
  registerCustomValidationPort,
  onCustomValidationRequest,
} from '../../../../../nx/public/plugins/quick-edit/custom-validation.js';

function validItem(overrides = {}) {
  return {
    severity: VALIDATION_SEVERITY.WARN,
    title: 'Alt text',
    message: 'Missing alt text',
    item: { proseIndex: 2 },
    ...overrides,
  };
}

function collectMessages(port, count) {
  const messages = [];
  return new Promise((resolve) => {
    port.onmessage = (e) => {
      messages.push(e.data);
      if (messages.length === count) resolve(messages);
    };
  });
}

afterEach(() => {
  // Unregisters the previous test's custom validation check so state doesn't leak.
  onCustomValidationRequest(null);
});

describe('isValidCustomValidationItem', () => {
  it('accepts an item with only a proseIndex', () => {
    expect(isValidCustomValidationItem(validItem())).to.be.true;
  });

  it('accepts an item with only a blockIndex', () => {
    expect(isValidCustomValidationItem(validItem({ item: { blockIndex: 0 } }))).to.be.true;
  });

  it('rejects an unknown severity', () => {
    expect(isValidCustomValidationItem(validItem({ severity: 'critical' }))).to.be.false;
  });

  it('rejects a message over the max length', () => {
    expect(isValidCustomValidationItem(validItem({ message: 'x'.repeat(501) }))).to.be.false;
  });

  it('rejects a missing or over-length title', () => {
    expect(isValidCustomValidationItem(validItem({ title: '' }))).to.be.false;
    expect(isValidCustomValidationItem(validItem({ title: 'x'.repeat(101) }))).to.be.false;
  });

  it('rejects an item with both blockIndex and proseIndex', () => {
    const item = validItem({ item: { blockIndex: 0, proseIndex: 0 } });
    expect(isValidCustomValidationItem(item)).to.be.false;
  });

  it('rejects an item with neither blockIndex nor proseIndex', () => {
    expect(isValidCustomValidationItem(validItem({ item: {} }))).to.be.false;
  });

  it('rejects non-object input', () => {
    expect(isValidCustomValidationItem(null)).to.be.false;
    expect(isValidCustomValidationItem('nope')).to.be.false;
  });
});

describe('sanitizeCustomValidationItems', () => {
  it('filters out malformed items, keeping well-shaped ones', () => {
    const good1 = validItem();
    const good2 = validItem({ title: 'SEO' });
    const items = [good1, { severity: 'nope' }, good2];
    expect(sanitizeCustomValidationItems(items)).to.deep.equal([good1, good2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(sanitizeCustomValidationItems(null)).to.deep.equal([]);
    expect(sanitizeCustomValidationItems(undefined)).to.deep.equal([]);
  });
});

describe('registerCustomValidationPort / onCustomValidationRequest', () => {
  it('no-ops on an undefined port', () => {
    expect(() => registerCustomValidationPort(undefined)).to.not.throw();
  });

  it('sends an ACK before the RESULT, both carrying hasCustomValidation: false when unregistered', async () => {
    const { port1, port2 } = new MessageChannel();
    registerCustomValidationPort(port2);
    const messagesPromise = collectMessages(port1, 2);
    port1.postMessage({ type: MESSAGE_TYPES.RUN, requestId: 'r1' });
    const [ack, result] = await messagesPromise;
    expect(ack).to.deep.equal({
      type: MESSAGE_TYPES.ACK, requestId: 'r1', hasCustomValidation: false,
    });
    expect(result).to.deep.equal({
      type: MESSAGE_TYPES.RESULT, requestId: 'r1', items: [], hasCustomValidation: false,
    });
  });

  it('runs the registered check and returns sanitized items with hasCustomValidation: true', async () => {
    const { port1, port2 } = new MessageChannel();
    const good = validItem();
    onCustomValidationRequest(() => [good, { severity: 'bogus' }]);
    registerCustomValidationPort(port2);
    const messagesPromise = collectMessages(port1, 2);
    port1.postMessage({ type: MESSAGE_TYPES.RUN, requestId: 'r2' });
    const [ack, result] = await messagesPromise;
    expect(ack).to.deep.equal({
      type: MESSAGE_TYPES.ACK, requestId: 'r2', hasCustomValidation: true,
    });
    expect(result).to.deep.equal({
      type: MESSAGE_TYPES.RESULT, requestId: 'r2', items: [good], hasCustomValidation: true,
    });
  });

  it('returns no items (but hasCustomValidation: true) when the check throws', async () => {
    const { port1, port2 } = new MessageChannel();
    onCustomValidationRequest(() => { throw new Error('boom'); });
    registerCustomValidationPort(port2);
    const messagesPromise = collectMessages(port1, 2);
    port1.postMessage({ type: MESSAGE_TYPES.RUN, requestId: 'r3' });
    const [, result] = await messagesPromise;
    expect(result).to.deep.equal({
      type: MESSAGE_TYPES.RESULT, requestId: 'r3', items: [], hasCustomValidation: true,
    });
  });

  it('replacing the check via a second onCustomValidationRequest call is used on the next run', async () => {
    const { port1, port2 } = new MessageChannel();
    onCustomValidationRequest(() => [validItem({ title: 'First' })]);
    onCustomValidationRequest(() => [validItem({ title: 'Second' })]);
    registerCustomValidationPort(port2);
    const messagesPromise = collectMessages(port1, 2);
    port1.postMessage({ type: MESSAGE_TYPES.RUN, requestId: 'r4' });
    const [, result] = await messagesPromise;
    expect(result.items).to.deep.equal([validItem({ title: 'Second' })]);
  });

  it('ignores messages that are not RUN', async () => {
    const { port1, port2 } = new MessageChannel();
    registerCustomValidationPort(port2);
    let called = false;
    port1.onmessage = () => { called = true; };
    port1.postMessage({ type: 'not-run' });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(called).to.be.false;
  });

  it('normalizes items to [] when the check returns a non-array', async () => {
    const { port1, port2 } = new MessageChannel();
    onCustomValidationRequest(() => undefined);
    registerCustomValidationPort(port2);
    const messagesPromise = collectMessages(port1, 2);
    port1.postMessage({ type: MESSAGE_TYPES.RUN, requestId: 'r5' });
    const [, result] = await messagesPromise;
    expect(result).to.deep.equal({
      type: MESSAGE_TYPES.RESULT, requestId: 'r5', items: [], hasCustomValidation: true,
    });
  });

  it('keeps requestId/items/hasCustomValidation well-formed when RUN omits requestId', async () => {
    const { port1, port2 } = new MessageChannel();
    registerCustomValidationPort(port2);
    const messagesPromise = collectMessages(port1, 2);
    port1.postMessage({ type: MESSAGE_TYPES.RUN });
    const [ack, result] = await messagesPromise;
    expect(ack).to.deep.equal({
      type: MESSAGE_TYPES.ACK, requestId: undefined, hasCustomValidation: false,
    });
    expect(result).to.deep.equal({
      type: MESSAGE_TYPES.RESULT, requestId: undefined, items: [], hasCustomValidation: false,
    });
    expect(Array.isArray(result.items)).to.be.true;
    expect(result.hasCustomValidation).to.be.a('boolean');
  });
});
