/**
 * Utilities for parsing, validating, and injecting YAML frontmatter in skill
 * markdown files, following Anthropic's SKILL.md frontmatter requirements:
 *
 *   name:
 *     - max 64 characters
 *     - lowercase letters, numbers, and hyphens only
 *     - no XML tags
 *     - no reserved words: "anthropic", "claude"
 *
 *   description:
 *     - non-empty
 *     - max 1024 characters
 *     - no XML tags
 */

const FM_OPEN = '---';
const FM_RESERVED_WORDS = ['anthropic', 'claude'];
const FM_XML_RE = /<[^>]+>/;
const FM_NAME_FORMAT_RE = /^[a-z0-9-]+$/;
const FM_NAME_MAX = 64;
const FM_DESC_MAX = 1024;

/**
 * Parses the YAML frontmatter block from a markdown string.
 * Only handles flat key: value pairs (no nested YAML).
 *
 * @param {string} markdown
 * @returns {{ fields: Record<string, string>, body: string } | null}
 *   null when no frontmatter block is present.
 */
export function parseFrontmatter(markdown) {
  const src = markdown ?? '';
  if (!src.trimStart().startsWith(FM_OPEN)) return null;

  const after = src.trimStart().slice(FM_OPEN.length);
  const closeIdx = after.indexOf(`\n${FM_OPEN}`);
  if (closeIdx === -1) return null;

  const block = after.slice(0, closeIdx);
  const body = after.slice(closeIdx + FM_OPEN.length + 1).trimStart();

  const fields = {};
  block.split('\n').forEach((line) => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) fields[key] = value;
  });

  return { fields, body };
}

/**
 * Validates the frontmatter fields against Anthropic's SKILL.md requirements.
 *
 * @param {Record<string, string>} fields - parsed frontmatter key-value pairs
 * @returns {string[]} array of human-readable error messages (empty = valid)
 */
export function validateSkillFrontmatter(fields) {
  const errors = [];
  const name = (fields.name ?? '').trim();
  const description = (fields.description ?? '').trim();

  if (!name) {
    errors.push('Frontmatter is missing a required "name" field.');
  } else {
    if (name.length > FM_NAME_MAX) {
      errors.push(`"name" exceeds ${FM_NAME_MAX} characters (${name.length}).`);
    }
    if (!FM_NAME_FORMAT_RE.test(name)) {
      errors.push('"name" must contain only lowercase letters, numbers, and hyphens.');
    }
    if (FM_XML_RE.test(name)) {
      errors.push('"name" must not contain XML tags.');
    }
    const reserved = FM_RESERVED_WORDS.find((w) => name.toLowerCase().includes(w));
    if (reserved) {
      errors.push(`"name" must not contain the reserved word "${reserved}".`);
    }
  }

  if (!description) {
    errors.push('Frontmatter is missing a required "description" field.');
  } else {
    if (description.length > FM_DESC_MAX) {
      errors.push(`"description" exceeds ${FM_DESC_MAX} characters (${description.length}).`);
    }
    if (FM_XML_RE.test(description)) {
      errors.push('"description" must not contain XML tags.');
    }
  }

  return errors;
}

/**
 * Ensures a skill markdown string has a valid YAML frontmatter block.
 * If frontmatter is absent, a minimal one is injected using the skill ID as
 * the `name` (already lowercase + hyphens, matching the required format).
 *
 * @param {string} markdown - raw skill body
 * @param {string} skillId  - canonical skill ID (lowercase, hyphens)
 * @param {string} status   - 'approved' | 'draft'
 * @returns {{ markdown: string, injected: boolean, warnings: string[] }}
 */
export function ensureSkillFrontmatter(markdown, skillId, status) {
  const hasFrontmatter = (markdown ?? '').trimStart().startsWith(FM_OPEN);

  if (!hasFrontmatter) {
    const fm = `---\nname: ${skillId}\ndescription: \nstatus: ${status}\n---\n\n`;
    const updated = fm + (markdown ?? '').trimStart();
    return { markdown: updated, injected: true, warnings: [] };
  }

  const parsed = parseFrontmatter(markdown);
  const warnings = parsed ? validateSkillFrontmatter(parsed.fields) : [];
  return { markdown, injected: false, warnings };
}
