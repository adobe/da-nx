import { expect } from '@esm-bundle/chai';
import {
  DETAILS_MARKER, parseActionMessage, buildActionMessage,
} from '../../../../../nx2/blocks/chat-ao/utils/action-message.js';

describe('action message envelope', () => {
  it('uses the documented marker', () => {
    expect(DETAILS_MARKER).to.equal('<!--nx:details-->');
  });

  it('splits title and body at the marker line', () => {
    const text = `Hero failure: Generate suggestion\n${DETAILS_MARKER}\n/skill\nElement: Hero\n`;
    expect(parseActionMessage(text)).to.deep.equal({
      title: 'Hero failure: Generate suggestion',
      body: '/skill\nElement: Hero',
      prefix: '',
    });
  });

  it('returns null for plain text, a marker inside a sentence or on the first line', () => {
    expect(parseActionMessage('Evaluate this page')).to.equal(null);
    expect(parseActionMessage(`say ${DETAILS_MARKER} please\nbody`)).to.equal(null);
    expect(parseActionMessage(`${DETAILS_MARKER}\nbody`)).to.equal(null);
    expect(parseActionMessage(`\n${DETAILS_MARKER}\nbody`)).to.equal(null);
    expect(parseActionMessage(undefined)).to.equal(null);
  });

  it('keeps what precedes the title (for example an attachments block) as the prefix', () => {
    const text = `[Attachments]\nfile.pdf\nTitle\n${DETAILS_MARKER}\nbody`;
    expect(parseActionMessage(text)).to.deep.equal({ title: 'Title', body: 'body', prefix: '[Attachments]\nfile.pdf' });
  });

  it('builds a message that parses back, with a one-line title', () => {
    const text = buildActionMessage({ title: 'A\n  failure:   X', body: 'line 1\nline 2' });
    expect(text).to.equal(`A failure: X\n${DETAILS_MARKER}\nline 1\nline 2`);
    expect(parseActionMessage(text)).to.include({ title: 'A failure: X', body: 'line 1\nline 2' });
  });
});
