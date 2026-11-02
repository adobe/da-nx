import { expect } from '@esm-bundle/chai';
import {
  configErrorMessage,
  getConnectorName,
  validateConfig,
  validateService,
  validateServiceValues,
} from '../../../nx/blocks/loc/utils/validate-config.js';

const CONNECTORS = ['glaas', 'globallink', 'google', 'lionbridge', 'sample', 'smartling', 'trados'];

const lang = (overrides = {}) => ({
  name: 'German',
  code: 'de',
  location: '/de',
  actions: 'translate,rollout',
  ...overrides,
});

const sheets = ({ languages = [lang()], config = [] } = {}) => ({
  languages: { data: languages },
  config: { data: config },
});

const service = (rows) => rows.map(([key, value]) => ({ key, value }));

describe('loc validate-config', () => {
  describe('configErrorMessage', () => {
    it('returns a single error as plain text', () => {
      expect(configErrorMessage(['One problem.'])).to.deep.equal({ type: 'error', text: 'One problem.' });
    });

    it('returns several errors as a heading with items', () => {
      const errors = ['First.', 'Second.'];
      expect(configErrorMessage(errors)).to.deep.equal({
        type: 'error',
        text: 'Translate config has 2 issues:',
        items: errors,
      });
    });
  });

  describe('getConnectorName', () => {
    it('lowercases and dashes names', () => {
      expect(getConnectorName(' Global Link ')).to.equal('global-link');
      expect(getConnectorName(undefined)).to.equal('');
    });
  });

  describe('validateConfig', () => {
    it('accepts a google config with no connector values', async () => {
      const config = service([['translation.service.name', 'google']]);
      expect((await validateConfig(sheets({ config }))).errors).to.deep.equal([]);
    });

    it('reports a missing service name', async () => {
      expect((await validateConfig(sheets())).errors[0]).to.include('Translation service is not set');
    });

    it('accepts a fully configured smartling service', async () => {
      const config = service([
        ['translation.service.name', 'smartling'],
        ['translation.service.all.env', 'stage,prod'],
        ['translation.service.stage.origin', 'https://stage'],
        ['translation.service.stage.projectId', '1'],
        ['translation.service.stage.userIdentifier', 'u'],
        ['translation.service.stage.userSecret', 's'],
        ['translation.service.prod.origin', 'https://prod'],
        ['translation.service.prod.projectId', '2'],
      ]);
      expect((await validateConfig(sheets({ config }))).errors).to.deep.equal([]);
    });

    it('reports missing sheets and errors', async () => {
      const inputs = [undefined, null, {}, { error: 'nope' }];
      const results = await Promise.all(inputs.map((input) => validateConfig(input)));
      results.forEach(({ errors }) => {
        expect(errors).to.have.length(1);
        expect(errors[0]).to.include('No translate config');
      });
    });

    it('reports an empty languages sheet', async () => {
      const config = service([['translation.service.name', 'google']]);
      const { errors } = await validateConfig(sheets({ languages: [], config }));
      expect(errors[0]).to.include('No languages are configured');
    });

    it('reports missing language fields', async () => {
      const config = service([['translation.service.name', 'google']]);
      const { errors } = await validateConfig(sheets({ languages: [{}], config }));
      expect(errors).to.deep.equal(['Language row 1 is missing "name", "code", "location", and "actions".']);
    });

    it('combines missing fields into one message per row', async () => {
      const config = service([['translation.service.name', 'google']]);
      const languages = [lang({ name: 'French', code: 'fr', location: '/fr', actions: '' }), lang({ code: '', location: '' })];
      const { errors } = await validateConfig(sheets({ languages, config }));
      expect(errors).to.deep.equal([
        'Language "French" is missing "actions".',
        'Language "German" is missing "code" and "location".',
      ]);
    });

    it('reports a location without a leading slash', async () => {
      const config = service([['translation.service.name', 'google']]);
      const { errors } = await validateConfig(sheets({ languages: [lang({ location: 'de' })], config }));
      expect(errors[0]).to.include('does not start with "/"');
    });

    it('reports unknown actions', async () => {
      const config = service([['translation.service.name', 'google']]);
      const { errors } = await validateConfig(sheets({ languages: [lang({ actions: 'translate,bogus' })], config }));
      expect(errors).to.have.length(1);
      expect(errors[0]).to.include('unknown action "bogus"');
    });

    it('combines multiple unknown actions into one message', async () => {
      const config = service([['translation.service.name', 'google']]);
      const { errors } = await validateConfig(sheets({ languages: [lang({ actions: 'translate, foo, bar' })], config }));
      expect(errors).to.have.length(1);
      expect(errors[0]).to.include('unknown actions "foo" and "bar"');
    });

    it('reports duplicate codes and locations', async () => {
      const config = service([['translation.service.name', 'google']]);
      const languages = [lang(), lang({ name: 'German 2' })];
      const { errors } = await validateConfig(sheets({ languages, config }));
      expect(errors.some((e) => e.includes('share code'))).to.be.true;
      expect(errors.some((e) => e.includes('share location'))).to.be.true;
    });

    it('groups three rows sharing a code into one message', async () => {
      const config = service([['translation.service.name', 'google']]);
      const languages = [
        lang({ name: 'A', location: '/a' }),
        lang({ name: 'B', location: '/b' }),
        lang({ name: 'C', location: '/c' }),
      ];
      const { errors } = await validateConfig(sheets({ languages, config }));
      expect(errors).to.deep.equal([`Languages "A", "B", and "C" share code "${languages[0].code}".`]);
    });

    it('treats trailing slashes as the same location', async () => {
      const config = service([['translation.service.name', 'google']]);
      const languages = [lang(), lang({ name: 'French', code: 'fr', location: '/de/' })];
      const { errors } = await validateConfig(sheets({ languages, config }));
      expect(errors.some((e) => e.includes('share location'))).to.be.true;
    });

    it('reports a row source that is not a location', async () => {
      const config = service([['translation.service.name', 'google']]);
      const languages = [lang({ source: 'English' })];
      const { errors } = await validateConfig(sheets({ languages, config }));
      expect(errors).to.deep.equal(['Language "German" has source "English" that does not start with "/".']);
    });

    it('accepts a row source that is a location', async () => {
      const config = service([['translation.service.name', 'google']]);
      const languages = [lang({ source: '/en/gb' })];
      const { errors } = await validateConfig(sheets({ languages, config }));
      expect(errors).to.deep.equal([]);
    });

    describe('source language column', () => {
      const config = service([['translation.service.name', 'google']]);
      const french = lang({ name: 'French', code: 'fr', location: '/fr' });

      it('accepts the exact name of another configured language', async () => {
        const languages = [french, lang({ 'source language': 'French' })];
        expect((await validateConfig(sheets({ languages, config }))).errors).to.deep.equal([]);
      });

      it('reports a name that is not a configured language', async () => {
        const languages = [lang({ 'source language': 'Klingon' })];
        const { errors } = await validateConfig(sheets({ languages, config }));
        expect(errors).to.deep.equal(['Language "German" has source language "Klingon", which is not a configured language.']);
      });

      it('reports a name that differs only by case', async () => {
        const languages = [french, lang({ 'source language': 'french' })];
        const { errors } = await validateConfig(sheets({ languages, config }));
        expect(errors).to.deep.equal(['Language "German" has source language "french", which is not a configured language.']);
      });

      it('reports a language that is its own source', async () => {
        const languages = [lang({ 'source language': 'German' })];
        const { errors } = await validateConfig(sheets({ languages, config }));
        expect(errors).to.deep.equal(['Language "German" has itself as its source language.']);
      });

      it('ignores an empty column', async () => {
        const languages = [lang({ 'source language': '' })];
        expect((await validateConfig(sheets({ languages, config }))).errors).to.deep.equal([]);
      });
    });

    it('reports an unknown source.language config value', async () => {
      const config = service([
        ['translation.service.name', 'google'],
        ['source.language', 'Klingon'],
      ]);
      const { errors } = await validateConfig(sheets({ config }));
      expect(errors[0]).to.include('"source.language"');
    });

    it('reports an unknown service', async () => {
      const config = service([['translation.service.name', 'nope']]);
      const { errors } = await validateConfig(sheets({ config }));
      expect(errors[0]).to.include('Unknown translation service "nope"');
    });

    it('rejects service names that try to escape the connectors folder', async () => {
      const config = service([['translation.service.name', '../../utils/utils']]);
      const { errors } = await validateConfig(sheets({ config }));
      expect(errors[0]).to.include('Unknown translation service');
    });

    it('reports missing connector values for the first env', async () => {
      const config = service([
        ['translation.service.name', 'smartling'],
        ['translation.service.all.env', 'stage'],
        ['translation.service.stage.origin', 'https://stage'],
        ['translation.service.stage.userIdentifier', 'u'],
        ['translation.service.stage.userSecret', 's'],
      ]);
      const { errors } = await validateConfig(sheets({ config }));
      expect(errors).to.deep.equal(['Translation service "smartling" is missing "translation.service.stage.projectId".']);
    });

    it('reports an env with no values', async () => {
      const config = service([
        ['translation.service.name', 'smartling'],
        ['translation.service.all.env', 'stage,prod'],
        ['translation.service.stage.origin', 'https://stage'],
        ['translation.service.stage.projectId', '1'],
        ['translation.service.stage.userIdentifier', 'u'],
        ['translation.service.stage.userSecret', 's'],
      ]);
      const { errors } = await validateConfig(sheets({ config }));
      expect(errors).to.have.length(1);
      expect(errors[0]).to.include('Environment "prod"');
    });

    it('requires credential keys in the config sheet when there is no key path', async () => {
      const config = service([
        ['translation.service.name', 'smartling'],
        ['translation.service.prod.origin', 'o'],
        ['translation.service.prod.projectId', '1'],
      ]);
      const { errors } = await validateConfig(sheets({ config }));
      expect(errors).to.deep.equal([
        'Translation service "smartling" is missing "translation.service.prod.userIdentifier" and "translation.service.prod.userSecret".',
      ]);
    });

    it('does not accept userId in place of userIdentifier', async () => {
      const config = service([
        ['translation.service.name', 'smartling'],
        ['translation.service.prod.origin', 'o'],
        ['translation.service.prod.projectId', '1'],
        ['translation.service.prod.userId', 'u'],
        ['translation.service.prod.userSecret', 's'],
      ]);
      const { errors } = await validateConfig(sheets({ config }));
      expect(errors).to.deep.equal([
        'Translation service "smartling" is missing "translation.service.prod.userIdentifier".',
      ]);
    });

    describe('key sheet', () => {
      const origFetch = window.fetch;
      const keyPath = 'https://admin.da.live/source/org/site/keys.json';
      const smartlingConfig = () => service([
        ['translation.service.name', 'smartling'],
        ['translation.service.key.path', keyPath],
        ['translation.service.prod.origin', 'o'],
        ['translation.service.prod.projectId', '1'],
      ]);
      const stub = (body, status = 200) => {
        window.fetch = async () => new Response(body, { status });
      };

      afterEach(() => {
        window.fetch = origFetch;
      });

      it('accepts credentials supplied by the key sheet', async () => {
        stub(JSON.stringify({
          data: service([
            ['translation.service.prod.userIdentifier', 'u'],
            ['translation.service.prod.userSecret', 's'],
          ]),
        }));
        const { errors } = await validateConfig(sheets({ config: smartlingConfig() }));
        expect(errors).to.deep.equal([]);
      });

      it('lets the key sheet override config sheet values', async () => {
        stub(JSON.stringify({
          data: service([
            ['translation.service.prod.userIdentifier', 'u'],
            ['translation.service.prod.userSecret', 's'],
            ['translation.service.prod.projectId', '9'],
          ]),
        }));
        const { errors } = await validateConfig(sheets({ config: smartlingConfig() }));
        expect(errors).to.deep.equal([]);
      });

      it('reports credentials missing from the key sheet', async () => {
        stub(JSON.stringify({ data: service([['translation.service.prod.userSecret', 's']]) }));
        const { errors } = await validateConfig(sheets({ config: smartlingConfig() }));
        expect(errors).to.have.length(1);
        expect(errors[0]).to.include('translation.service.prod.userIdentifier');
      });

      it('reports a non-OK key sheet response and skips credential checks', async () => {
        stub('nope', 404);
        const { errors } = await validateConfig(sheets({ config: smartlingConfig() }));
        expect(errors).to.have.length(1);
        expect(errors[0]).to.include('Unable to read the service key sheet');
        expect(errors[0]).to.include('status 404');
      });

      it('reports invalid JSON in the key sheet', async () => {
        stub('not json');
        const { errors } = await validateConfig(sheets({ config: smartlingConfig() }));
        expect(errors).to.have.length(1);
        expect(errors[0]).to.include('not valid JSON');
      });

      it('reports a rejected key sheet request', async () => {
        window.fetch = async () => { throw new Error('offline'); };
        const { errors } = await validateConfig(sheets({ config: smartlingConfig() }));
        expect(errors).to.have.length(1);
        expect(errors[0]).to.include('Unable to read the service key sheet');
      });

      it('does not treat "key" as an environment', async () => {
        stub(JSON.stringify({
          data: service([
            ['translation.service.prod.userIdentifier', 'u'],
            ['translation.service.prod.userSecret', 's'],
          ]),
        }));
        const config = [
          ...smartlingConfig(),
          ...service([['translation.service.all.env', 'prod,key']]),
        ];
        const { errors } = await validateConfig(sheets({ config }));
        expect(errors.join()).to.not.include('Environment "key"');
      });
    });

    it('does not throw on malformed rows', async () => {
      const input = { languages: { data: [null, 'x'] }, config: { data: [null, { key: 'a' }] } };
      const { errors } = await validateConfig(input);
      expect(errors.length).to.be.greaterThan(0);
    });
  });

  describe('validateServiceValues', () => {
    it('defaults the env to prod in messages', async () => {
      const errors = await validateServiceValues({ name: 'trados', values: {} });
      expect(errors).to.deep.equal([
        'Translation service "trados" is missing "translation.service.prod.tenantId" and "translation.service.prod.apiEndpoint".',
      ]);
    });

    it('checks credential keys only when asked', async () => {
      const values = { tenantId: 't', apiEndpoint: 'a' };
      expect(await validateServiceValues({ name: 'trados', values })).to.deep.equal([]);
      const errors = await validateServiceValues({ name: 'trados', values, credentials: true });
      expect(errors).to.deep.equal([
        'Translation service "trados" is missing "translation.service.prod.authEndpoint", "translation.service.prod.clientId", and "translation.service.prod.clientSecret".',
      ]);
    });

    it('reports a single missing key without a conjunction', async () => {
      const errors = await validateServiceValues({ name: 'glaas', values: { origin: 'o' } });
      expect(errors).to.deep.equal(['Translation service "glaas" is missing "translation.service.prod.clientid".']);
    });
  });

  describe('validateService', () => {
    it('accepts a complete persisted service', async () => {
      const result = await validateService({ name: 'glaas', env: 'stage', origin: 'o', clientid: 'c' });
      expect(result.errors).to.deep.equal([]);
    });

    it('reports missing values and missing services', async () => {
      expect((await validateService({ name: 'glaas', env: 'stage', origin: 'o' })).errors).to.have.length(1);
      expect((await validateService(undefined)).errors[0]).to.include('not set');
    });
  });

  describe('connector requiredKeys', () => {
    CONNECTORS.forEach((name) => {
      it(`${name} exports requiredKeys`, async () => {
        const { requiredKeys } = await import(`../../../nx/blocks/loc/connectors/${name}/index.js`);
        expect(requiredKeys).to.be.an('array');
        requiredKeys.forEach((key) => expect(key).to.be.a('string'));
      });

      it(`${name} exports requiredCredentialKeys`, async () => {
        const { requiredCredentialKeys } = await import(`../../../nx/blocks/loc/connectors/${name}/index.js`);
        expect(requiredCredentialKeys).to.be.an('array');
        requiredCredentialKeys.forEach((key) => {
          const aliases = Array.isArray(key) ? key : [key];
          aliases.forEach((alias) => expect(alias).to.be.a('string'));
        });
      });
    });
  });
});
