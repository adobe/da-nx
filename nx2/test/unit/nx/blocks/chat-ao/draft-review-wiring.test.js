import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import NxChatAo from '../../../../../blocks/chat-ao/chat-ao.js';
import CmaChatController from '../../../../../blocks/chat-ao/cma-chat-controller.js';
import BaseChatController from '../../../../../blocks/chat-ao/base-chat-controller.js';
import '../../../../../blocks/chat-ao/draft-review/draft-review.js';

const plan = {
  version: 1,
  type: 'plan',
  id: 'review-01',
  summary: 'Warmer copy',
  pages: [{ path: '/about.html', title: 'About', summary: 'Rewrite headline' }],
};
const message = { role: 'assistant', content: `Intro <da-review>${JSON.stringify(plan)}</da-review> End` };

describe('CMA-only draft review wiring', () => {
  let chat;
  let mount;
  beforeEach(() => {
    chat = new NxChatAo();
    chat._altHarness = true;
    chat._context = { org: 'org', site: 'site' };
    chat.episodeId = 'session';
    chat.draftReview = async ({ action }) => (action === 'context'
      ? { org: 'org', site: 'site', draftRoot: '/.da/ai-drafts/user' }
      : { approvedPaths: ['/about.html'], results: {} });
    mount = document.createElement('div');
    document.body.append(mount);
  });
  afterEach(() => mount.remove());

  it('renders CMA blocks as cards and keeps surrounding prose', () => {
    render(chat._renderAssistant(message), mount);
    expect(mount.querySelector('nx-cma-draft-review').review).to.deep.equal(plan);
    expect(mount.textContent).to.include('Intro');
    expect(mount.textContent).to.include('End');
    expect(mount.textContent).not.to.include('"version"');
  });

  it('leaves coworker messages on the existing renderer', () => {
    chat._altHarness = false;
    render(chat._renderAssistant(message), mount);
    expect(mount.querySelector('nx-cma-draft-review')).to.equal(null);
  });

  it('leaves hosts without a draft adapter unchanged', () => {
    chat.draftReview = undefined;
    render(chat._renderAssistant(message), mount);
    expect(mount.querySelector('nx-cma-draft-review')).to.equal(null);
  });

  it('sends the approved scope as an explicit user turn with signed-in draft context', async () => {
    const calls = [];
    chat._controller = {
      setDraftReviewContext: (context) => calls.push(context),
      sendMessage: (text) => calls.push(text),
    };
    await chat._reviewAction({ action: 'approve-scope', review: plan, paths: ['/about.html'] }, chat._context, 'session');
    expect(calls[0].draftRoot).to.equal('/.da/ai-drafts/user');
    expect(calls[1]).to.include('"type":"scope-approved"');
    expect(calls[1]).to.include('"pages":["/about.html"]');
  });

  it('does not send an approval turn when saving the scope fails', async () => {
    const calls = [];
    chat._controller = { sendMessage: (text) => calls.push(text) };
    chat.draftReview = async () => { throw new Error('Read failed'); };
    try {
      await chat._reviewAction({ action: 'approve-scope', review: plan, paths: ['/about.html'] }, chat._context, 'session');
      expect.fail('Expected failure');
    } catch (error) {
      expect(error.message).to.equal('Read failed');
    }
    expect(calls).to.have.lengthOf(0);
    expect(chat._draftBusy).to.equal(false);
  });

  it('adds draft instructions to CMA wire text without changing other harness messages', () => {
    const cma = new CmaChatController();
    const base = new BaseChatController({});
    expect(cma._prepareMessage('Hello')).to.equal('Hello');
    cma.setDraftReviewContext({ draftRoot: '/.da/ai-drafts/user' });
    expect(cma._prepareMessage('Hello')).to.include('"draftRoot":"/.da/ai-drafts/user"');
    expect(base._prepareMessage('Hello')).to.equal('Hello');
  });
});
