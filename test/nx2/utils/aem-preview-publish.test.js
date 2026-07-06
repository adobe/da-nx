import { expect } from '@esm-bundle/chai';
import { DA_ADMIN } from '../../../nx2/utils/utils.js';
import {
  buildAemPathFromHashState,
  formatAemPreviewPublishError,
  requestAemRole,
} from '../../../nx2/utils/aem-preview-publish.js';

let origFetch;
let calls = [];

const installFetch = (responses = []) => {
  calls = [];
  origFetch = window.fetch;
  let idx = 0;
  window.fetch = async (url, opts = {}) => {
    calls.push({ url: url.toString(), method: opts.method || 'GET', body: opts.body });
    const resp = responses[idx] ?? responses[responses.length - 1];
    idx += 1;
    return resp;
  };
};

const restoreFetch = () => {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
};

const mockIms = (profile) => {
  window.adobeIMS = { getProfile: async () => profile };
};

const clearIms = () => { delete window.adobeIMS; };

const PROFILE = { userId: 'uid-1', email: 'test@adobe.com', displayName: 'Test User' };
const PERM_URL = `${DA_ADMIN}/source/myorg/mysite/.da/aem-permission-requests.json`;
const EMPTY_TPL = '{"users":{"total":1,"limit":1,"offset":0,"data":[]},"data":{"total":1,"limit":1,"offset":0,"data":[{}]},":names":["users","data"],":version":3,":type":"multi-sheet"}';

describe('aem-preview-publish.js', () => {
  afterEach(() => {
    restoreFetch();
    clearIms();
  });

  describe('buildAemPathFromHashState', () => {
    it('returns null when any segment is missing', () => {
      expect(buildAemPathFromHashState(null)).to.be.null;
      expect(buildAemPathFromHashState({ org: 'o', site: 's' })).to.be.null;
    });

    it('builds lowercased path', () => {
      expect(buildAemPathFromHashState({ org: 'Org', site: 'Site', path: '/Doc' })).to.equal('/org/site/doc');
    });
  });

  describe('formatAemPreviewPublishError', () => {
    it('returns unknown error for missing input', () => {
      expect(formatAemPreviewPublishError(null)).to.equal('Unknown error');
    });

    it('concatenates details when present', () => {
      expect(formatAemPreviewPublishError({ message: 'Err', details: 'info' })).to.equal('Err: info');
    });
  });

  describe('requestAemRole', () => {
    it('returns failure message when adobeIMS is unavailable', async () => {
      const result = await requestAemRole('myorg', 'mysite', 'preview');
      expect(result.message[0]).to.equal('Could not get user profile.');
      expect(result.message[1]).to.equal('Please sign in and try again.');
    });

    it('uses template JSON when permission file does not exist (GET 404) and returns success on POST 200', async () => {
      mockIms(PROFILE);
      installFetch([
        new Response('Not found', { status: 404 }),
        new Response('{}', { status: 200 }),
      ]);

      const result = await requestAemRole('myorg', 'mysite', 'preview');

      expect(result.message[0]).to.equal('Successfully requested role!');
      expect(result.message[1]).to.equal('An administrator will need to approve.');
      expect(calls[0].url).to.equal(PERM_URL);
      expect(calls[1].url).to.equal(PERM_URL);
      expect(calls[1].method).to.equal('POST');
    });

    it('reads existing JSON and upserts current user when GET 200', async () => {
      mockIms(PROFILE);
      const existing = JSON.parse(EMPTY_TPL);
      existing.users.data.push({ Id: 'other-uid', Email: 'other@test.com', Action: 'preview' });

      installFetch([
        new Response(JSON.stringify(existing), { status: 200 }),
        new Response('{}', { status: 200 }),
      ]);

      const result = await requestAemRole('myorg', 'mysite', 'preview');
      expect(result.message[0]).to.equal('Successfully requested role!');

      // The posted body is FormData — verify the blob content
      const formData = calls[1].body;
      expect(formData).to.be.instanceOf(FormData);
      const blob = formData.get('data');
      const text = await blob.text();
      const saved = JSON.parse(text);

      // Verify new user entry for current userId
      expect(saved.users.data.filter((u) => u.Id === PROFILE.userId)).to.have.length(1);
      expect(saved.users.data.filter((u) => u.Id === PROFILE.userId)[0].Action).to.equal('preview');

      // Verify existing other-uid entry is still present
      expect(saved.users.data.filter((u) => u.Id === 'other-uid')).to.have.length(1);

      // Verify total entries
      expect(saved.users.data).to.have.length(2);
    });

    it('updates existing entry in place (same userId)', async () => {
      mockIms(PROFILE);
      const existing = JSON.parse(EMPTY_TPL);
      existing.users.data.push({ Id: PROFILE.userId, Email: PROFILE.email, Action: 'old-action' });

      installFetch([
        new Response(JSON.stringify(existing), { status: 200 }),
        new Response('{}', { status: 200 }),
      ]);

      await requestAemRole('myorg', 'mysite', 'preview');

      // Only one entry expected — verify by checking FormData blob content
      const formData = calls[1].body;
      const blob = formData.get('data');
      const text = await blob.text();
      const saved = JSON.parse(text);
      expect(saved.users.data.filter((u) => u.Id === PROFILE.userId)).to.have.length(1);
      expect(saved.users.data[0].Action).to.equal('preview');
    });

    it('returns failure message when POST fails', async () => {
      mockIms(PROFILE);
      installFetch([
        new Response('Not found', { status: 404 }),
        new Response('Server error', { status: 500 }),
      ]);

      const result = await requestAemRole('myorg', 'mysite', 'preview');
      expect(result.message[0]).to.equal('Could not request permissions.');
      expect(result.message[1]).to.equal('Please notify your administrator.');
    });
  });
});
