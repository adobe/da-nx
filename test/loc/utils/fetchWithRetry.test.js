import { expect } from '@esm-bundle/chai';
import fetchWithRetry from '../../../nx/blocks/loc/utils/fetchWithRetry.js';

let origFetch;

function installFetch(handler) {
  origFetch = window.fetch;
  window.fetch = handler;
}

function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

describe('fetchWithRetry', () => {
  afterEach(() => restoreFetch());

  it('returns the response immediately when it is not retryable', async () => {
    let calls = 0;
    installFetch(async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    });

    const resp = await fetchWithRetry('https://example.com', {});

    expect(resp.status).to.equal(200);
    expect(calls).to.equal(1);
  });

  it('retries a 429, honoring Retry-After, then succeeds', async () => {
    let calls = 0;
    installFetch(async () => {
      calls += 1;
      if (calls === 1) return new Response('', { status: 429, headers: { 'Retry-After': '0.01' } });
      return new Response('{}', { status: 200 });
    });

    const resp = await fetchWithRetry('https://example.com', {});

    expect(resp.status).to.equal(200);
    expect(calls).to.equal(2);
  });

  it('retries a 503 with exponential backoff when there is no Retry-After', async () => {
    let calls = 0;
    installFetch(async () => {
      calls += 1;
      if (calls === 1) return new Response('', { status: 503 });
      return new Response('{}', { status: 200 });
    });

    const resp = await fetchWithRetry('https://example.com', {}, { baseDelayMs: 5, maxDelayMs: 20 });

    expect(resp.status).to.equal(200);
    expect(calls).to.equal(2);
  });

  it('gives up after maxRetries and returns the last failing response', async () => {
    let calls = 0;
    installFetch(async () => {
      calls += 1;
      return new Response('', { status: 429, headers: { 'Retry-After': '0.001' } });
    });

    const resp = await fetchWithRetry('https://example.com', {}, { maxRetries: 2 });

    expect(resp.status).to.equal(429);
    expect(calls).to.equal(3); // initial attempt + 2 retries
  });

  it('does not retry statuses outside the default retryable set', async () => {
    let calls = 0;
    installFetch(async () => {
      calls += 1;
      return new Response('', { status: 404 });
    });

    const resp = await fetchWithRetry('https://example.com', {});

    expect(resp.status).to.equal(404);
    expect(calls).to.equal(1);
  });

  it('honors a custom isRetryable predicate', async () => {
    let calls = 0;
    installFetch(async () => {
      calls += 1;
      if (calls === 1) return new Response('', { status: 418, headers: { 'Retry-After': '0.001' } });
      return new Response('{}', { status: 200 });
    });

    const resp = await fetchWithRetry('https://example.com', {}, { isRetryable: (status) => status === 418 });

    expect(resp.status).to.equal(200);
    expect(calls).to.equal(2);
  });
});
