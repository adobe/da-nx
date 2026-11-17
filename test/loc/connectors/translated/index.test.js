import { expect } from '@esm-bundle/chai';
import {
  connect, isConnected, sendAllLanguages, getStatusAll, saveItems, cancelTranslation,
  serviceOptions, saveLangConcurrency,
} from '../../../../nx/blocks/loc/connectors/translated/index.js';
import { DA_TRANSLATE } from '../../../../nx2/utils/utils.js';

// Dynamic-expression import so @web/dev-server-import-maps does not rewrite it.
const imsPath = '../../../../nx2/utils/ims.js';
const { setMockIms, resetMockIms } = await import(imsPath);

const org = 'acme';
const site = 'site1';
const proxyOrigin = `${DA_TRANSLATE}/translate/translated/${org}/${site}`;
const statusUrl = `https://da-etc.adobeaem.workers.dev/${org}/sites/${site}/integrations/translated/status?env=prod`;

let calls;
let origFetch;

const baseService = (overrides = {}) => ({
  org, site, serviceType: 'test_connectors', ...overrides,
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

const makeUrls = (n) => Array.from({ length: n }, (_, i) => ({
  daBasePath: `/p${i}`, content: `<html>${i}</html>`, ext: 'html',
}));

const request = (overrides) => ({
  id: 1, id_order: 'o1', id_content: '/p0', target_language: 'fr', status: 'delivered', ...overrides,
});

function installFetch(handler) {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
    calls.push({
      url: u, method: opts.method, headers: opts.headers, body: opts.body && JSON.parse(opts.body),
    });
    if (u.includes('/integrations/translated/status')) return json({ connected: true });
    return handler(u, opts);
  };
}

const lastCall = (path) => calls.filter((c) => c.url.endsWith(path)).pop();

describe('translated connector', () => {
  beforeEach(() => {
    resetMockIms();
    sessionStorage.clear();
    installFetch(() => json({}));
  });
  afterEach(() => {
    if (origFetch) window.fetch = origFetch;
    origFetch = null;
    sessionStorage.clear();
  });

  describe('isConnected / connect', () => {
    it('is connected when da-etc has a key and an IMS session exists', async () => {
      expect(await isConnected(baseService())).to.equal(true);
      expect(calls.some((c) => c.url === statusUrl)).to.equal(true);
    });

    it('is not connected without an IMS session', async () => {
      setMockIms({ anonymous: true });
      expect(await isConnected(baseService())).to.equal(false);
    });

    it('reports a failed connection', async () => {
      window.fetch = async () => json({ connected: false });
      const messages = [];
      expect(await connect(baseService(), (m) => messages.push(m))).to.equal(false);
      expect(messages[0].text).to.equal('Connection to Translated failed.');
    });
  });

  describe('serviceOptions', () => {
    it('lists enabled service types', async () => {
      installFetch(() => json([
        { name: 'professional', human_enabled: true, machine_enabled: false },
        { name: 'off', human_enabled: false, machine_enabled: false },
        { name: 'machine', human_enabled: false, machine_enabled: true },
      ]));
      const items = await serviceOptions[0].fetch(baseService());

      expect(serviceOptions[0].key).to.equal('serviceType');
      expect(items.map((i) => i.value)).to.deep.equal(['professional', 'machine']);
      expect(calls.at(-1).url).to.equal(`${proxyOrigin}/v2/symbol/service-type-names`);
    });

    it('returns an empty list on failure', async () => {
      installFetch(() => json({ message: 'nope' }, 400));
      expect(await serviceOptions[0].fetch(baseService())).to.deep.equal([]);
    });

    it('declares free-text context fields', () => {
      const fields = serviceOptions.filter((option) => !option.fetch)
        .map(({ key, type }) => ({ key, type }));
      expect(fields).to.deep.equal([
        { key: 'instructions', type: 'textarea' },
        { key: 'references', type: 'text' },
        { key: 'screenshot', type: 'text' },
        { key: 'purchaseOrder', type: 'text' },
        { key: 'costCenter', type: 'text' },
        { key: 'orderGroup', type: 'text' },
      ]);
    });
  });

  describe('sendAllLanguages', () => {
    let messages;
    let saved;
    let saves;
    let actions;
    let options;
    let langs;

    beforeEach(() => {
      messages = [];
      saved = 0;
      saves = [];
      actions = {
        sendMessage: (m) => messages.push(m),
        saveState: async (props, saveOptions) => {
          saved += 1;
          saves.push({ service: { ...props?.options?.service }, saveOptions });
        },
      };
      options = { 'source.language': { code: 'en-US' }, service: {} };
      langs = [{ code: 'fr-FR', name: 'French' }, { code: 'de-DE', name: 'German' }];
    });

    const submitHandler = (languages = ['en-US', 'fr-FR', 'de-DE']) => (url) => (
      url.endsWith('/v2/symbol/languages')
        ? json(languages.map((key) => ({ key, value: key })))
        : json([{ id: 1 }])
    );

    const send = (service = baseService(), urls = makeUrls(2)) => sendAllLanguages({
      title: 'Proj', service, options, langs, urls, actions,
    });

    it('submits one order per page for all languages and records the order id', async () => {
      installFetch(submitHandler());
      await send();

      const call = lastCall('/v2/translate');
      expect(call.body).to.have.length(2);
      expect(call.body[0]).to.include({
        id_content: 'Proj:/p0', source_language: 'en-US', service_type: 'test_connectors', content_type: 'text/html',
      });
      expect(call.body[0].target_languages).to.deep.equal(['fr-FR', 'de-DE']);
      expect(call.body[0].id_order).to.equal(call.body[1].id_order);
      expect(call.headers['x-idempotency-id']).to.be.a('string');
      expect(call.headers['x-api-key']).to.equal(undefined);

      const orderIds = JSON.parse(options.service.orderIds.value);
      expect(orderIds['fr-FR']).to.equal(call.body[0].id_order);
      expect(orderIds['de-DE']).to.equal(call.body[0].id_order);
      expect(langs.map((l) => l.translation)).to.deep.equal([
        { status: 'created', sent: 2 }, { status: 'created', sent: 2 },
      ]);
      expect(saved).to.equal(2);
      expect(options.service.pendingSubmission).to.equal(undefined);
      expect(messages.at(-1)).to.equal(undefined);
    });

    describe('order group', () => {
      it('sends the trimmed order group on every order', async () => {
        installFetch(submitHandler());
        await send(baseService({ orderGroup: { value: '  spring-launch ' } }));

        const { body } = lastCall('/v2/translate');
        expect(body.map((order) => order.id_order_group)).to.deep.equal(['spring-launch', 'spring-launch']);
      });

      it('omits id_order_group when no group is set', async () => {
        installFetch(submitHandler());
        await send(baseService({ orderGroup: '   ' }));

        expect(lastCall('/v2/translate').body[0]).to.not.have.property('id_order_group');
      });

      it('refuses an order group over 255 characters', async () => {
        installFetch(submitHandler());
        await send(baseService({ orderGroup: 'g'.repeat(256) }));

        expect(calls.some((c) => c.url.endsWith('/v2/translate'))).to.equal(false);
        expect(messages.at(-1)).to.deep.equal({ text: 'Order group must be 255 characters or fewer.', type: 'error' });
      });

      it('links to the group in TranslationOS when an org ID is configured', async () => {
        installFetch(submitHandler());
        await send(baseService({ orderGroup: 'Proj 1', orgId: 'org/1' }));

        expect(options.service.link).to.equal(
          'https://os.translated.com/orgs/org%2F1/request-groups/id_order_group/Proj%201',
        );
      });

      it('adds no link without an org ID', async () => {
        installFetch(submitHandler());
        await send(baseService({ orderGroup: 'Proj 1' }));

        expect(options.service.link).to.equal(undefined);
      });

      it('adds no link without an order group', async () => {
        installFetch(submitHandler());
        await send(baseService({ orgId: 'org1' }));

        expect(options.service.link).to.equal(undefined);
      });

      it('adds no link when the submission fails', async () => {
        installFetch(() => json({ error: true, message: 'nope' }, 400));
        await send(baseService({ orderGroup: 'Proj 1', orgId: { value: 'org1' } }));

        expect(options.service.link).to.equal(undefined);
      });
    });

    it('accepts language codes in any case and sends Translated casing', async () => {
      installFetch(submitHandler(['en-US', 'fr-CA', 'de-DE']));
      options['source.language'] = { code: 'EN-us' };
      langs = [{ code: 'fr-ca', name: 'French (Canada)' }, { code: 'de-DE', name: 'German' }];
      await send();

      const call = lastCall('/v2/translate');
      expect(call.body[0].source_language).to.equal('en-US');
      expect(call.body[0].target_languages).to.deep.equal(['fr-CA', 'de-DE']);
      expect(Object.keys(JSON.parse(options.service.orderIds.value))).to.deep.equal(['fr-ca', 'de-DE']);
      expect(langs[0].translation.status).to.equal('created');
    });

    it('defaults the source language to en-US when none is configured', async () => {
      installFetch(submitHandler());
      delete options['source.language'];
      await send();

      expect(lastCall('/v2/translate').body[0].source_language).to.equal('en-US');
      expect(langs[0].translation.status).to.equal('created');
    });

    it('refuses unsupported language codes and makes no submission', async () => {
      installFetch(submitHandler());
      langs = [{ code: 'fr', name: 'French' }, { code: 'de-DE', name: 'German' }];
      await send();

      expect(calls.some((c) => c.url.endsWith('/v2/translate'))).to.equal(false);
      expect(langs[0].translation).to.equal(undefined);
      expect(messages.at(-1).type).to.equal('error');
      expect(messages.at(-1).text).to.contain('fr');
    });

    it('still submits when the language lookup fails', async () => {
      installFetch((url) => (url.endsWith('/v2/symbol/languages') ? json({ message: 'nope' }, 400) : json([{ id: 1 }])));
      await send();

      expect(lastCall('/v2/translate').body).to.have.length(2);
    });

    it('creates no translation objects when the submission fails', async () => {
      installFetch(() => json({ error: true, message: 'bad service type' }, 400));
      await send();

      expect(langs.every((l) => l.translation === undefined)).to.equal(true);
      expect(options.service.orderIds).to.equal(undefined);
      expect(saved).to.equal(1);
      expect(messages.at(-1).type).to.equal('error');
      expect(messages.at(-1).text).to.contain('bad service type');
    });

    describe('duplicate submission protection', () => {
      const failThenSucceed = () => {
        let attempts = 0;
        return (url) => {
          if (url.endsWith('/v2/symbol/languages')) return submitHandler()(url);
          attempts += 1;
          return attempts === 1 ? json({ error: true, message: 'bad gateway' }, 400) : json([{ id: 1 }]);
        };
      };
      const submits = () => calls.filter((c) => c.url.endsWith('/v2/translate'));
      const pending = () => JSON.parse(options.service.pendingSubmission.value);

      it('persists the idempotency key and order id before sending', async () => {
        installFetch(submitHandler());
        await send();

        const [first] = saves;
        expect(first.saveOptions).to.deep.equal({ waitForSave: true });
        const stored = JSON.parse(first.service.pendingSubmission.value);
        const call = lastCall('/v2/translate');
        expect(call.headers['x-idempotency-id']).to.equal(stored.key);
        expect(call.body[0].id_order).to.equal(stored.orderId);
        expect(saves[1].service.pendingSubmission).to.equal(undefined);
      });

      it('reuses the key and order id when retrying the same submission', async () => {
        const service = baseService();
        options.service = service;
        installFetch(failThenSucceed());
        await send(service);
        const stored = pending();

        await send(service);

        const [first, second] = submits();
        expect(second.headers['x-idempotency-id']).to.equal(first.headers['x-idempotency-id']);
        expect(second.body[0].id_order).to.equal(first.body[0].id_order);
        expect(second.headers['x-idempotency-id']).to.equal(stored.key);
        expect(options.service.pendingSubmission).to.equal(undefined);
      });

      it('uses a new key when the pages or languages changed', async () => {
        const service = baseService();
        options.service = service;
        installFetch(failThenSucceed());
        await send(service);

        await send(service, makeUrls(3));

        const [first, second] = submits();
        expect(second.headers['x-idempotency-id']).to.not.equal(first.headers['x-idempotency-id']);
      });

      it('uses a new key when the stored one is close to expiring', async () => {
        const service = baseService();
        options.service = service;
        installFetch(failThenSucceed());
        await send(service);
        const stored = pending();
        stored.createdAt -= 4 * 24 * 60 * 60 * 1000;
        options.service.pendingSubmission = { value: JSON.stringify(stored) };

        await send(service);

        const [first, second] = submits();
        expect(second.headers['x-idempotency-id']).to.not.equal(first.headers['x-idempotency-id']);
      });

      it('retries a 425 with the same key', async () => {
        let attempts = 0;
        installFetch((url) => {
          if (url.endsWith('/v2/symbol/languages')) return submitHandler()(url);
          attempts += 1;
          return attempts === 1 ? json({ error: true, message: 'too early' }, 425) : json([{ id: 1 }]);
        });
        await send();

        const [first, second] = submits();
        expect(submits()).to.have.length(2);
        expect(second.headers['x-idempotency-id']).to.equal(first.headers['x-idempotency-id']);
        expect(langs[0].translation.status).to.equal('created');
      });

      it('does not send when the key cannot be saved first', async () => {
        installFetch(submitHandler());
        actions.saveState = async () => { throw new Error('DA is down'); };
        await send();

        expect(submits()).to.have.length(0);
        expect(messages.at(-1).type).to.equal('error');
        expect(messages.at(-1).text).to.contain('DA is down');
      });
    });

    it('errors without a service type and makes no submission', async () => {
      await send(baseService({ serviceType: undefined }));

      expect(calls.some((c) => c.url.endsWith('/v2/translate'))).to.equal(false);
      expect(langs[0].translation).to.equal(undefined);
      expect(messages.at(-1).type).to.equal('error');
    });

    it('refuses submissions over the per-call request limit', async () => {
      await send(baseService(), makeUrls(2501));

      expect(calls.some((c) => c.url.endsWith('/v2/translate'))).to.equal(false);
      expect(messages.at(-1).type).to.equal('error');
    });

    it('replaces path separators in the title and prefixes every page', async () => {
      installFetch(submitHandler());
      await sendAllLanguages({
        title: 'a:b/c', service: baseService(), options, langs, urls: makeUrls(2), actions,
      });

      expect(lastCall('/v2/translate').body.map((o) => o.id_content)).to.deep.equal(['a-b-c:/p0', 'a-b-c:/p1']);
    });

    it('refuses pages whose id_content exceeds the vendor limit', async () => {
      await send(baseService(), [{ daBasePath: `/${'x'.repeat(260)}`, content: '<html></html>', ext: 'html' }]);

      expect(calls.some((c) => c.url.endsWith('/v2/translate'))).to.equal(false);
      expect(langs[0].translation).to.equal(undefined);
      expect(messages.at(-1).type).to.equal('error');
    });

    it('errors when not connected', async () => {
      setMockIms({ anonymous: true });
      await send();
      expect(calls.some((c) => c.url.endsWith('/v2/translate'))).to.equal(false);
      expect(messages.at(-1).type).to.equal('error');
    });

    it('omits context when no context fields are set', async () => {
      installFetch(submitHandler());
      await send(baseService({ instructions: '  ', references: '' }));

      expect(lastCall('/v2/translate').body[0]).to.not.have.property('context');
    });

    it('sends instructions, reference and screenshot URLs as order context', async () => {
      installFetch(submitHandler());
      await send(baseService({
        instructions: ' Keep product names in English. ',
        references: { value: 'https://example.com/glossary' },
        screenshot: 'https://example.com/shot.png',
      }));

      const { body } = lastCall('/v2/translate');
      body.forEach((order) => expect(order.context).to.deep.equal({
        instructions: 'Keep product names in English.',
        references: 'https://example.com/glossary',
        screenshot: 'https://example.com/shot.png',
      }));
    });

    it('refuses a non-https context URL and makes no submission', async () => {
      installFetch(submitHandler());
      await send(baseService({ screenshot: 'http://example.com/shot.png' }));

      expect(calls.some((c) => c.url.endsWith('/v2/translate'))).to.equal(false);
      expect(langs[0].translation).to.equal(undefined);
      expect(messages.at(-1)).to.deep.equal({ text: 'Screenshot URL must be an https:// URL.', type: 'error' });
    });

    it('refuses a context URL that does not parse', async () => {
      installFetch(submitHandler());
      await send(baseService({ references: 'example.com/glossary' }));

      expect(calls.some((c) => c.url.endsWith('/v2/translate'))).to.equal(false);
      expect(messages.at(-1).text).to.equal('Reference URL must be an https:// URL.');
    });

    it('omits billing fields when empty', async () => {
      installFetch(submitHandler());
      await send(baseService({ purchaseOrder: ' ', costCenter: '' }));

      const [order] = lastCall('/v2/translate').body;
      expect(order).to.not.have.property('purchase_order');
      expect(order).to.not.have.property('cost_attribution_label');
    });

    it('sends trimmed purchase order and cost center on every order', async () => {
      installFetch(submitHandler());
      await send(baseService({ purchaseOrder: ' PO-123 ', costCenter: { value: 'Marketing' } }));

      lastCall('/v2/translate').body.forEach((order) => {
        expect(order.purchase_order).to.equal('PO-123');
        expect(order.cost_attribution_label).to.equal('Marketing');
      });
    });

    it('refuses a billing field over 250 characters', async () => {
      installFetch(submitHandler());
      await send(baseService({ costCenter: 'x'.repeat(251) }));

      expect(calls.some((c) => c.url.endsWith('/v2/translate'))).to.equal(false);
      expect(messages.at(-1)).to.deep.equal({ text: 'Cost center must be 250 characters or fewer.', type: 'error' });
    });

    it('sends the signed-in user as requested_by', async () => {
      setMockIms({ email: 'author@example.com' });
      installFetch(submitHandler());
      await send();

      lastCall('/v2/translate').body.forEach((order) => {
        expect(order.requested_by).to.equal('author@example.com');
      });
    });

    it('omits requested_by when the profile has no email', async () => {
      setMockIms({ email: null });
      installFetch(submitHandler());
      await send();

      expect(lastCall('/v2/translate').body[0]).to.not.have.property('requested_by');
    });
  });

  describe('getStatusAll', () => {
    const service = () => baseService({ orderIds: { value: JSON.stringify({ fr: 'o1', de: 'o1' }) } });
    let saved;
    let actions;

    beforeEach(() => {
      saved = 0;
      actions = { sendMessage: () => {}, saveState: async () => { saved += 1; } };
    });

    const run = async (requests, langs) => {
      installFetch(() => json(requests));
      await getStatusAll({
        service: service(), langs, urls: makeUrls(2), actions,
      });
    };

    it('maps vendor states per language and counts translated pages', async () => {
      const langs = [
        { code: 'fr', translation: { status: 'created', sent: 2 } },
        { code: 'de', translation: { status: 'created', sent: 2 } },
      ];
      await run([
        request({ id: 1, id_content: '/p0', status: 'delivered' }),
        request({ id: 2, id_content: '/p1', status: 'in progress' }),
        request({ id: 3, id_content: '/p0', target_language: 'de', status: 'delivered' }),
        request({ id: 4, id_content: '/p1', target_language: 'de', status: 'invoiced' }),
      ], langs);

      expect(langs[0].translation).to.deep.include({ status: 'in progress', translated: 1 });
      expect(langs[1].translation).to.deep.include({ status: 'translated', translated: 2 });
      expect(calls.at(-1).body).to.deep.include({ id_order: 'o1' });
      expect(saved).to.equal(1);
    });

    it('treats missing requests as created', async () => {
      const langs = [{ code: 'fr', translation: { status: 'created', sent: 2 } }];
      await run([request({ id_content: '/p0', status: 'delivered' })], langs);

      expect(langs[0].translation).to.deep.include({ status: 'created', translated: 1 });
    });

    it('uses the newest request per page', async () => {
      const langs = [{ code: 'fr', translation: { status: 'created', sent: 1 } }];
      installFetch(() => json([
        request({ id: 1, id_content: '/p0', status: 'failed' }),
        request({ id: 9, id_content: '/p0', status: 'delivered' }),
      ]));
      await getStatusAll({
        service: service(), langs, urls: makeUrls(1), actions,
      });

      expect(langs[0].translation.status).to.equal('translated');
    });

    it('marks a language as error when any page failed', async () => {
      const langs = [{ code: 'fr', translation: { status: 'in progress', sent: 2 } }];
      await run([
        request({ id: 1, id_content: '/p0', status: 'delivered' }),
        request({ id: 2, id_content: '/p1', status: 'failed' }),
      ], langs);

      expect(langs[0].translation.status).to.equal('error');
    });

    it('reports a single failure as one message', async () => {
      const messages = [];
      actions.sendMessage = (msg) => messages.push(msg);
      const langs = [{ code: 'fr', name: 'French', translation: { status: 'in progress', sent: 2 } }];
      await run([
        request({ id: 1, id_content: '/p0', status: 'delivered' }),
        request({ id: 2, id_content: '/p1', status: 'failed delivery', error_message: 'bad html' }),
      ], langs);

      expect(messages.at(-1)).to.deep.equal({
        type: 'error',
        text: 'Translated reported a failure: French — /p1: bad html',
      });
    });

    it('lists multiple failures across languages in language order', async () => {
      const messages = [];
      actions.sendMessage = (msg) => messages.push(msg);
      const langs = [
        { code: 'fr', name: 'French', translation: { status: 'in progress', sent: 2 } },
        { code: 'de', name: 'German', translation: { status: 'in progress', sent: 2 } },
      ];
      await run([
        request({ id: 1, id_content: '/p0', status: 'failed' }),
        request({ id: 2, id_content: '/p1', status: 'failed delivery' }),
        request({ id: 3, id_content: '/p0', target_language: 'de', status: 'cancelled' }),
        request({ id: 4, id_content: '/p1', target_language: 'de', status: 'delivered' }),
      ], langs);

      expect(messages.at(-1)).to.deep.equal({
        type: 'error',
        text: 'Translated reported 3 failures:',
        items: [
          'French — /p0: failed',
          'French — /p1: failed delivery',
          'German — 1 of 2 pages cancelled in TranslationOS',
        ],
      });
    });

    it('clears the message when nothing failed', async () => {
      const messages = [];
      actions.sendMessage = (msg) => messages.push(msg);
      const langs = [{ code: 'fr', translation: { status: 'created', sent: 2 } }];
      await run([request({ id_content: '/p0', status: 'delivered' })], langs);

      expect(messages.at(-1)).to.equal(undefined);
    });

    it('marks a language as cancelled when all pages are cancelled', async () => {
      const langs = [{ code: 'fr', translation: { status: 'created', sent: 2 } }];
      await run([
        request({ id: 1, id_content: '/p0', status: 'cancelled' }),
        request({ id: 2, id_content: '/p1', status: 'cancelled' }),
      ], langs);

      expect(langs[0].translation.status).to.equal('cancelled');
    });

    it('skips complete and cancelled languages without calling the vendor', async () => {
      const langs = [
        { code: 'fr', translation: { status: 'complete' } },
        { code: 'de', translation: { status: 'cancelled' } },
      ];
      await run([], langs);

      expect(calls).to.have.length(0);
    });

    it('leaves status unchanged when the status call fails', async () => {
      const langs = [{ code: 'fr', translation: { status: 'created', sent: 2 } }];
      installFetch(() => json({ message: 'down' }, 400));
      await getStatusAll({
        service: service(), langs, urls: makeUrls(2), actions,
      });

      expect(langs[0].translation.status).to.equal('created');
    });

    it('does not mark an unknown vendor state as done', async () => {
      const langs = [{ code: 'fr', translation: { status: 'created', sent: 1 } }];
      installFetch(() => json([request({ id_content: '/p0', status: 'mystery' })]));
      await getStatusAll({
        service: service(), langs, urls: makeUrls(1), actions,
      });

      expect(langs[0].translation.status).to.equal('created');
    });
  });

  describe('saveItems', () => {
    const service = () => baseService({ orderIds: { value: JSON.stringify({ fr: 'o1' }) } });

    it('saves delivered content and flags the rest as errors', async () => {
      installFetch(() => json([
        request({ id_content: 'Proj:/p0', status: 'delivered', translated_content: '<main>bonjour</main>' }),
        request({ id: 2, id_content: 'Proj:/p1', status: 'in progress' }),
      ]));
      const urls = makeUrls(2);
      const saved = [];
      await saveItems({
        org,
        site,
        service: service(),
        lang: { code: 'fr' },
        urls,
        saveFn: async (url) => { saved.push(url.daBasePath); url.status = 'success'; },
      });

      expect(saved).to.deep.equal(['/p0']);
      expect(urls[0].status).to.equal('success');
      expect(urls[1].status).to.equal('error');
      expect(urls[1].error).to.equal('Translation is not ready (status: in progress).');
      expect(calls.at(-1).body).to.deep.include({ id_order: 'o1', target_language: 'fr', fetch_content: true });
    });

    it('queries /status with Translated casing for a differently cased code', async () => {
      installFetch((url) => (url.endsWith('/v2/symbol/languages')
        ? json([{ key: 'fr-CA', value: 'French (Canada)' }])
        : json([request({
          id_content: 'Proj:/p0', target_language: 'fr-CA', translated_content: '<main>salut</main>',
        })])));
      const urls = makeUrls(1);
      await saveItems({
        org,
        site,
        service: baseService({ orderIds: { value: JSON.stringify({ 'fr-ca': 'o1' }) } }),
        lang: { code: 'fr-ca' },
        urls,
        saveFn: async (url) => { url.status = 'success'; },
      });

      expect(calls.at(-1).body.target_language).to.equal('fr-CA');
      expect(urls[0].status).to.equal('success');
    });

    it('flags urls as errors when the lookup fails', async () => {
      installFetch(() => json({ message: 'down' }, 400));
      const urls = makeUrls(1);
      await saveItems({
        org, site, service: service(), lang: { code: 'fr' }, urls, saveFn: async () => {},
      });

      expect(urls[0].status).to.equal('error');
      expect(urls[0].error).to.match(/^Could not fetch translations: /);
    });

    it('flags a url without a matching request', async () => {
      installFetch(() => json([]));
      const urls = makeUrls(1);
      await saveItems({
        org, site, service: service(), lang: { code: 'fr' }, urls, saveFn: async () => {},
      });

      expect(urls[0]).to.include({ status: 'error', error: 'No translation request found.' });
    });

    it('flags a url as an error when saving throws', async () => {
      installFetch(() => json([
        request({ id_content: '/p0', translated_content: '<main>x</main>' }),
      ]));
      const urls = makeUrls(1);
      await saveItems({
        org,
        site,
        service: service(),
        lang: { code: 'fr' },
        urls,
        saveFn: async () => { throw new Error('boom'); },
      });

      expect(urls[0]).to.include({ status: 'error', error: 'boom' });
    });

    it('saves two languages at a time', () => {
      expect(saveLangConcurrency).to.equal(2);
    });
  });

  describe('cancelTranslation', () => {
    const service = () => baseService({ orderIds: { value: JSON.stringify({ fr: 'o1' }) } });
    const lang = () => ({ code: 'fr', name: 'French', translation: { status: 'created' } });
    let messages;
    const sendMessage = (m) => messages.push(m);

    beforeEach(() => { messages = []; });

    it('cancels requests that have not started', async () => {
      installFetch((u) => (u.endsWith('/v2/status')
        ? json([request({ id: 7, status: 'bucketing' }), request({ id: 8, id_content: '/p1', status: 'upload' })])
        : json({ status: 'cancelled' })));
      const l = lang();
      const result = await cancelTranslation({ service: service(), lang: l, sendMessage });

      expect(result).to.deep.equal({ ok: true });
      expect(l.translation.status).to.equal('cancelled');
      expect(lastCall('/v2/translate/cancel').body).to.deep.equal({ id: [7, 8] });
    });

    it('queries /status with Translated casing for a differently cased code', async () => {
      installFetch((u) => {
        if (u.endsWith('/v2/symbol/languages')) return json([{ key: 'fr-CA', value: 'French (Canada)' }]);
        return json(u.endsWith('/v2/status') ? [request({ id: 7, target_language: 'fr-CA', status: 'bucketing' })] : {});
      });
      const l = { code: 'fr-ca', name: 'French', translation: { status: 'created' } };
      const result = await cancelTranslation({
        service: baseService({ orderIds: { value: JSON.stringify({ 'fr-ca': 'o1' }) } }), lang: l, sendMessage,
      });

      expect(result).to.deep.equal({ ok: true });
      expect(calls.find((c) => c.url.endsWith('/v2/status')).body.target_language).to.equal('fr-CA');
    });

    it('refuses when translation already started and does not call cancel', async () => {
      installFetch(() => json([request({ status: 'in progress' })]));
      const l = lang();
      const result = await cancelTranslation({ service: service(), lang: l, sendMessage });

      expect(result).to.deep.equal({ ok: false });
      expect(l.translation.status).to.equal('created');
      expect(calls.some((c) => c.url.endsWith('/cancel'))).to.equal(false);
      expect(messages.at(-1).type).to.equal('error');
    });

    it('reports a vendor rejection', async () => {
      installFetch((u) => (u.endsWith('/v2/status')
        ? json([request({ status: 'bucketing' })])
        : json({ message: 'rejected' }, 400)));
      const l = lang();
      const result = await cancelTranslation({ service: service(), lang: l, sendMessage });

      expect(result).to.deep.equal({ ok: false });
      expect(l.translation.status).to.equal('created');
      expect(messages.at(-1).text).to.contain('rejected');
    });

    it('skips languages that are done or never sent', async () => {
      const done = { code: 'fr', name: 'French', translation: { status: 'complete' } };

      expect(await cancelTranslation({ service: service(), lang: done, sendMessage }))
        .to.deep.equal({ ok: true, skipped: true });
      expect(await cancelTranslation({ service: service(), lang: { code: 'fr', name: 'French' }, sendMessage }))
        .to.deep.equal({ ok: true, skipped: true });
      expect(calls).to.have.length(0);
    });
  });
});
