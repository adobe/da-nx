import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { getStatusAll } from '../../../nx/blocks/loc/connectors/glaas/index.js';

describe('GLaaS missing task recovery', () => {
  const service = { origin: 'https://glaas.example', clientid: 'client' };
  const name = 'arabic-task';
  const workflow = 'WCMS_Transcreation_DX/WCMS_Transcreation_DX';
  const taskHref = `${service.origin}/api/l10n/v1.2/tasks/${workflow}/${name}`;
  let fetchStub;
  let actions;
  let lang;

  beforeEach(() => {
    actions = { sendMessage: sinon.spy(), saveState: sinon.stub().resolves() };
    lang = {
      code: 'ar',
      translation: {
        workflowTasks: {
          [name]: {
            name,
            workflow,
            workflowName: 'AutoTranscreation',
            urls: ['/page'],
            status: {
              status: 'not started', sent: 0, translated: 0, error: 0,
            },
          },
        },
      },
    };
    fetchStub = sinon.stub(window, 'fetch');
  });

  afterEach(() => sinon.restore());

  it('creates, uploads and submits a not-started task after a 404 before checking again', async () => {
    const calls = [];
    fetchStub.callsFake(async (href, options) => {
      calls.push({ href, options });
      if (href === taskHref) {
        return calls.filter((call) => call.href === taskHref).length === 1
          ? new Response('{}', { status: 404 })
          : new Response(JSON.stringify([{
            targetLocale: 'ar',
            status: 'CREATED',
            assets: [{ name: '/page.html', status: 'IN_PROGRESS' }],
          }]));
      }
      if (href === `${service.origin}/api/l10n/v1.2/tasks/${workflow}/create`
        || href.startsWith(`${taskHref}/assets?`)
        || href === `${taskHref}/ar/updateStatus`) return new Response('{}');
      throw new Error(`Unexpected request: ${href}`);
    });

    await getStatusAll({
      service,
      langs: [lang],
      urls: [{ suppliedPath: '/page', daBasePath: '/page.html', content: '<p>Hello</p>' }],
      actions,
    });

    expect(calls.map(({ href }) => href)).to.have.length(5);
    expect(calls[0].href).to.equal(taskHref);
    expect(calls[1].href).to.equal(`${service.origin}/api/l10n/v1.2/tasks/${workflow}/create`);
    expect(JSON.parse(calls[1].options.body)).to.include({ name, workflowName: 'AutoTranscreation' });
    expect(calls[2].href).to.include(`${taskHref}/assets?`);
    expect(calls[2].options.body.get('file').name).to.equal('/page.html');
    expect(calls[3].href).to.equal(`${taskHref}/ar/updateStatus`);
    expect(calls[4].href).to.equal(taskHref);
    expect(lang.translation.workflowTasks[name].status).to.include({ status: 'created', sent: 1 });
    expect(actions.saveState.called).to.equal(true);
  });

  it('does not recreate a previously submitted task when its lookup returns 404', async () => {
    lang.translation.workflowTasks[name].status.status = 'created';
    fetchStub.callsFake(async () => new Response('{}', { status: 404 }));

    const error = await getStatusAll({
      service, langs: [lang], urls: [], actions,
    }).catch((failure) => failure);

    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.include('Could not check GLaaS status for ar: HTTP 404');
    expect(fetchStub.callCount).to.equal(2);
    fetchStub.getCalls().forEach(({ args }) => expect(args[0]).to.equal(taskHref));
  });
});
