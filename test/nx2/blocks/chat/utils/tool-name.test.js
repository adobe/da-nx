import { expect } from '@esm-bundle/chai';
import { mcpToolName } from '../../../../../nx2/blocks/chat/utils/tool-name.js';

describe('mcpToolName', () => {
  it('strips the mcp__<server>__ prefix off an MCP-qualified tool name', () => {
    expect(mcpToolName('mcp__governance-agent__evaluate_page')).to.equal('evaluate_page');
  });

  it('resolves to the same short name regardless of the server segment', () => {
    expect(mcpToolName('mcp__some-renamed-server__evaluate_page')).to.equal('evaluate_page');
  });

  it('returns native (non-MCP) tool names unchanged', () => {
    expect(mcpToolName('content_create')).to.equal('content_create');
  });

  it('preserves underscores that are part of the tool name itself', () => {
    expect(mcpToolName('mcp__server__tool_with_underscore')).to.equal('tool_with_underscore');
  });

  it('returns undefined/null unchanged', () => {
    expect(mcpToolName(undefined)).to.equal(undefined);
    expect(mcpToolName(null)).to.equal(null);
  });
});
