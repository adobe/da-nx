import { expect } from '@esm-bundle/chai';
import { buildClientContext } from '../../../../../nx2/blocks/chat-ao/utils/user-context.js';
import { buildSelectionContext } from '../../../../../nx2/blocks/chat/utils/chat-helpers.js';

const finding = {
  key: 'eval-finding',
  id: 'eval-fail-header_copy',
  type: 'evaluation-finding',
  name: 'Header copy',
  description: 'Check: Header copy\nReason: generic',
};

describe('buildClientContext selection resources', () => {
  it('sends an evaluation-finding with its type, id, name and description', () => {
    const { focused_resources: resources } = buildClientContext({}, [finding]);

    expect(resources).to.deep.equal([{
      type: 'evaluation-finding',
      id: 'eval-fail-header_copy',
      name: 'Header copy',
      description: 'Check: Header copy\nReason: generic',
    }]);
  });

  it('leaves existing selection types unchanged', () => {
    const { focused_resources: resources } = buildClientContext({ org: 'o', site: 's', path: '/p' }, [
      { type: 'block', id: 'b1', blockName: 'hero', description: 'not forwarded' },
      { type: 'text', innerHTML: '<p>hello</p>' },
      { type: 'file', id: '/a.json', blockName: 'a.json' },
    ]);

    expect(resources[1]).to.deep.equal({ type: 'block', id: 'b1', name: 'hero' });
    expect(resources[2]).to.deep.equal({ type: 'text-selection', name: 'hello' });
    expect(resources[3]).to.deep.equal({ type: 'file', id: '/a.json', name: 'a.json' });
  });
});

describe('buildSelectionContext', () => {
  it('keeps an evaluation-finding with its description', () => {
    expect(buildSelectionContext([finding])).to.deep.equal([{
      type: 'evaluation-finding',
      blockName: 'Header copy',
      description: 'Check: Header copy\nReason: generic',
    }]);
  });

  it('drops an evaluation-finding without a name and omits an empty description', () => {
    expect(buildSelectionContext([{ type: 'evaluation-finding' }])).to.deep.equal([]);
    expect(buildSelectionContext([{ type: 'evaluation-finding', name: 'X' }]))
      .to.deep.equal([{ type: 'evaluation-finding', blockName: 'X' }]);
  });

  it('keeps existing types unchanged and still filters unknown ones', () => {
    expect(buildSelectionContext([
      {
        type: 'block', blockName: 'hero', proseIndex: 2, innerText: 'hi', description: 'x',
      },
      { type: 'text', innerHTML: '<p>t</p>' },
      { type: 'folder', blockName: 'docs' },
      { type: 'unknown', blockName: 'nope' },
      { type: 'block' },
    ])).to.deep.equal([
      {
        type: 'block', proseIndex: 2, blockName: 'hero', innerText: 'hi',
      },
      { type: 'text', innerHTML: '<p>t</p>' },
      { type: 'folder', blockName: 'docs' },
    ]);
  });
});
