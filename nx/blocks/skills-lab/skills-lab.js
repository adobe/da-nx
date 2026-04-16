/**
 * Compatibility wrapper: legacy `skills-lab` block now delegates to `skills-editor`.
 * Keep this until all content references are migrated.
 */
import decorateSkillsEditor from '../skills-editor/skills-editor.js';

export default function decorate(block) {
  return decorateSkillsEditor(block);
}
