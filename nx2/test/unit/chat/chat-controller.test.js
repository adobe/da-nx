import { expect } from '@esm-bundle/chai';
import { extractSkillSuggestion } from '../../../blocks/chat/chat-controller.js';

// ─── fixtures ─────────────────────────────────────────────────────────────────

const INTRO = 'I noticed a repeating pattern in your requests. Here is a skill draft you can save.';

function buildBlock({ id = 'my-skill', body = '# My Skill\n\nDo the thing.', intro = INTRO } = {}) {
  return `${intro}\n\n[SKILL_SUGGESTION]\n\nSKILL_ID: ${id}\n\n---SKILL_CONTENT_START---\n${body}\n---SKILL_CONTENT_END---\n`;
}

// ─── extractSkillSuggestion ───────────────────────────────────────────────────

describe('extractSkillSuggestion()', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('returns null when no [SKILL_SUGGESTION] block is present', () => {
    expect(extractSkillSuggestion('Just a plain response.')).to.be.null;
  });

  it('returns null for empty string', () => {
    expect(extractSkillSuggestion('')).to.be.null;
  });

  it('extracts the skill id from SKILL_ID: line', () => {
    const result = extractSkillSuggestion(buildBlock({ id: 'my-skill' }));
    expect(result).to.not.be.null;
    expect(result.id).to.equal('my-skill');
  });

  it('extracts the body between content markers', () => {
    const body = '# My Skill\n\nDo the thing.';
    const result = extractSkillSuggestion(buildBlock({ body }));
    expect(result.body).to.equal(body);
  });

  it('returns prose (intro) as visible text', () => {
    const result = extractSkillSuggestion(buildBlock({ intro: INTRO }));
    expect(result.visible).to.equal(INTRO);
  });

  it('returns empty visible text when there is no intro', () => {
    const noIntro = '[SKILL_SUGGESTION]\n\nSKILL_ID: no-intro\n\n---SKILL_CONTENT_START---\n# X\n---SKILL_CONTENT_END---\n';
    const result = extractSkillSuggestion(noIntro);
    expect(result.visible).to.equal('');
  });

  it('normalises the skill id to kebab-case (lowercases and strips special chars)', () => {
    const result = extractSkillSuggestion(buildBlock({ id: 'My_Skill 2024!' }));
    expect(result.id).to.equal('my-skill-2024-');
  });

  it('writes the payload to sessionStorage under the primary key', () => {
    const body = '# X\nContent.';
    extractSkillSuggestion(buildBlock({ id: 'test-skill', body, intro: 'Intro.' }));
    const stored = JSON.parse(sessionStorage.getItem('da-skills-editor-suggestion'));
    expect(stored).to.deep.include({ id: 'test-skill', body, prose: 'Intro.' });
  });

  it('writes the payload to sessionStorage under the legacy key', () => {
    extractSkillSuggestion(buildBlock({ id: 'test-skill' }));
    expect(sessionStorage.getItem('da-skills-lab-suggest-handoff')).to.not.be.null;
  });

  it('dispatches da-skills-editor-suggestion-handoff event on window', () => {
    let fired = null;
    const handler = (e) => { fired = e.detail; };
    window.addEventListener('da-skills-editor-suggestion-handoff', handler);
    extractSkillSuggestion(buildBlock({ id: 'evt-skill' }));
    window.removeEventListener('da-skills-editor-suggestion-handoff', handler);
    expect(fired).to.not.be.null;
    expect(fired.id).to.equal('evt-skill');
  });

  it('dispatches the legacy da-skills-lab-suggestion-handoff event on window', () => {
    let fired = null;
    const handler = (e) => { fired = e.detail; };
    window.addEventListener('da-skills-lab-suggestion-handoff', handler);
    extractSkillSuggestion(buildBlock({ id: 'legacy-skill' }));
    window.removeEventListener('da-skills-lab-suggestion-handoff', handler);
    expect(fired).to.not.be.null;
    expect(fired.id).to.equal('legacy-skill');
  });

  it('handles a missing SKILL_ID line gracefully (id is empty string)', () => {
    const block = '[SKILL_SUGGESTION]\n\n---SKILL_CONTENT_START---\n# X\n---SKILL_CONTENT_END---\n';
    const result = extractSkillSuggestion(block);
    expect(result.id).to.equal('');
  });

  it('handles missing content markers gracefully (body is empty string)', () => {
    const block = '[SKILL_SUGGESTION]\n\nSKILL_ID: no-body\n';
    const result = extractSkillSuggestion(block);
    expect(result.body).to.equal('');
  });
});
