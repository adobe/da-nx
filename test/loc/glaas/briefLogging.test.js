import sinon from 'sinon';
import { expect } from '@esm-bundle/chai';
import {
  createTask,
  GLAAS_DEBUG_LOG_KEY,
} from '../../../nx/blocks/loc/connectors/glaas/api.js';
import {
  buildBriefForCampaign,
  buildCampaignBriefForLocales,
  findCampaignBriefSheet,
} from '../../../nx/blocks/loc/connectors/glaas/translationMetadata.js';

describe('GLaaS brief diagnostics', () => {
  let sandbox;
  let info;
  let fetchStub;
  let previousLogSetting;
  const task = {
    name: 'brief-task',
    workflow: 'product/project',
    workflowName: 'Transcreation',
    targetLocales: ['fr'],
    campaignBrief: { fr: { targetAudience: 'Marketing leaders.' } },
  };
  const create = () => createTask({
    origin: 'https://glaas.example',
    clientid: 'private-client',
    token: 'private-token',
    task,
    service: {},
  });
  const detailFor = (step) => info.args.find((args) => args[1] === step)?.[2];

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    info = sandbox.stub(console, 'info');
    fetchStub = sandbox.stub(window, 'fetch').resolves(new Response('{}'));
    previousLogSetting = localStorage.getItem(GLAAS_DEBUG_LOG_KEY);
    localStorage.setItem(GLAAS_DEBUG_LOG_KEY, 'true');
  });

  afterEach(() => {
    sandbox.restore();
    if (previousLogSetting === null) localStorage.removeItem(GLAAS_DEBUG_LOG_KEY);
    else localStorage.setItem(GLAAS_DEBUG_LOG_KEY, previousLogSetting);
  });

  it('logs the exact v1.2 request body and response without authentication headers', async () => {
    const result = await create();
    expect(result).to.equal(task);
    expect(detailFor('v1.2-create')).to.deep.equal({
      method: 'POST',
      url: 'https://glaas.example/api/l10n/v1.2/tasks/product/project/create',
    });
    const loggedBody = detailFor('v1.2-create-body-json');
    expect(loggedBody).to.equal(fetchStub.firstCall.args[1].body);
    expect(JSON.parse(loggedBody).aiContextConfig.langConfig.fr).to.deep.equal([
      { key: 'targetAudience', value: 'Marketing leaders.' },
    ]);
    expect(detailFor('v1.2-create-response')).to.include({ status: 200, body: '{}' });
    expect(JSON.stringify(info.args)).not.to.include('private-token');
    expect(JSON.stringify(info.args)).not.to.include('private-client');
  });

  it('logs a non-JSON error response while preserving the create failure', async () => {
    fetchStub.resolves(new Response('Invalid context', { status: 400 }));
    const result = await create();
    expect(result.error).to.equal('Error creating task.');
    expect(detailFor('v1.2-create-response')).to.include({
      status: 400,
      body: 'Invalid context',
    });
    expect(detailFor('v1.2-create-error').error).to.equal('Error: 400');
  });

  it('logs network failures while preserving the create failure', async () => {
    fetchStub.rejects(new TypeError('Network unavailable'));
    const result = await create();
    expect(result.error).to.equal('Error creating task.');
    expect(detailFor('v1.2-create-error').error).to.equal('TypeError: Network unavailable');
  });

  it('logs campaign matching and the locales and attribute keys actually included', () => {
    const sheet = {
      columns: ['Attribute', 'Description', 'fr', 'de'],
      data: [{ Attribute: 'targetAudience', fr: 'Marketing leaders.', de: '' }],
    };
    expect(findCampaignBriefSheet({ Launch: sheet, ':version': 1 }, 'launch')).to.equal(sheet);
    expect(detailFor('brief-sheet')).to.deep.equal({
      campaign: 'launch',
      matchedSheet: 'Launch',
      availableSheets: ['Launch'],
    });
    expect(buildCampaignBriefForLocales(sheet, ['fr', 'de', 'ja'])).to.deep.equal(task.campaignBrief);
    expect(detailFor('brief-locales')).to.deep.equal({
      targetLocales: ['fr', 'de', 'ja'],
      availableLocales: ['fr', 'de'],
      includedLocales: ['fr'],
      missingLocales: ['de', 'ja'],
      attributeKeys: { fr: ['targetAudience'] },
    });
  });

  it('explains empty campaign, invalid sheet, and empty locale guidance omissions', async () => {
    expect(await buildBriefForCampaign('org', 'site', '', ['fr'])).to.equal(null);
    expect(detailFor('brief-omitted').reason).to.equal('no-campaign');
    expect(fetchStub.called).to.equal(false);

    info.resetHistory();
    expect(buildCampaignBriefForLocales(null, ['fr'])).to.equal(null);
    expect(detailFor('brief-omitted').reason).to.equal('invalid-sheet-or-no-target-locales');

    info.resetHistory();
    expect(buildCampaignBriefForLocales({ columns: ['fr'], data: [] }, ['fr'])).to.equal(null);
    expect(detailFor('brief-omitted').reason).to.equal('no-nonempty-locale-guidance');
  });

  it('identifies an unmatched campaign without treating metadata keys as sheets', () => {
    expect(findCampaignBriefSheet({ launch: {}, ':names': ['launch'] }, 'missing')).to.equal(null);
    expect(detailFor('brief-sheet')).to.deep.equal({
      campaign: 'missing',
      matchedSheet: null,
      availableSheets: ['launch'],
    });
  });

  it('stays silent and leaves the response unread when logging is disabled', async () => {
    localStorage.removeItem(GLAAS_DEBUG_LOG_KEY);
    const response = new Response('{}');
    fetchStub.resolves(response);
    expect(await create()).to.equal(task);
    await buildBriefForCampaign('org', 'site', '', ['fr']);
    findCampaignBriefSheet({ launch: {} }, 'launch');
    buildCampaignBriefForLocales({ columns: ['fr'], data: [] }, ['fr']);
    expect(info.called).to.equal(false);
    expect(response.bodyUsed).to.equal(false);
  });
});
