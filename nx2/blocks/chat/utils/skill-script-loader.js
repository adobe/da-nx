import { DA_ADMIN } from '../../../utils/utils.js';

const DA_SKILLS_PATH = '.da/skills';

/**
 * Parse flat execution_* frontmatter keys from a skill.md string into a structured
 * manifest object.
 *
 * Expected frontmatter shape (flat keys, no nested YAML block):
 *   execution_entry: convert
 *   execution_runtimes: js
 *   execution_capabilities:          # empty = client-eligible
 *   execution_timeout_ms: 5000
 *
 * @param {string} text - raw skill.md content
 * @returns {{ entry: string, runtimes: string[], capabilities: string[], timeoutMs: number }|null}
 */
export function parseSkillFrontmatter(text) {
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];
  const get = (key) => {
    // Use [ \t]* (not \s*) to avoid consuming newlines before the value.
    const m = fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  };

  const entry = get('execution_entry');
  if (!entry) return null;

  const runtimesRaw = get('execution_runtimes');
  const runtimes = runtimesRaw
    ? runtimesRaw.split(',').map((r) => r.trim()).filter(Boolean)
    : [];

  const capabilitiesRaw = get('execution_capabilities');
  const capabilities = capabilitiesRaw
    ? capabilitiesRaw.split(',').map((c) => c.trim()).filter(Boolean)
    : [];

  const timeoutRaw = get('execution_timeout_ms');
  const timeoutMs = timeoutRaw ? parseInt(timeoutRaw, 10) : 5000;

  return { entry, runtimes, capabilities, timeoutMs };
}

/**
 * Resolve the skill manifest and script module URL for a given skillId.
 *
 * For built-in skills (prefix `builtin:`), resolves relative to the skills-builtin
 * directory under the same origin. For DA authored skills, fetches skill.md from
 * `${DA_ADMIN}/source/${org}/${site}/${DA_SKILLS_PATH}/${id}/skill.md` and resolves
 * the script.js URL alongside it.
 *
 * Eligibility is determined CLIENT-SIDE from the fetched manifest — never from the
 * agent's tool args.
 *
 * @param {string} skillId - skill identifier; may be prefixed with `ao:` for marketplace
 * @param {{ org: string, site: string }} context - org/site from the chat context
 * @returns {Promise<{ manifest: object, moduleUrl: string }|{ error: string }>}
 */
export async function resolveSkill(skillId, { org, site } = {}) {
  if (!skillId) return { error: 'missing skillId' };

  // Marketplace skills (ao: prefix) — reserved seam, not yet implemented
  if (skillId.startsWith('ao:')) {
    return { error: 'ao marketplace skills not yet supported' };
  }

  if (!org || !site) return { error: 'missing org/site context' };

  const skillPath = `${DA_SKILLS_PATH}/${skillId}`;
  const skillMdUrl = `${DA_ADMIN}/source/${org}/${site}/${skillPath}/skill.md`;
  const scriptJsUrl = `${DA_ADMIN}/source/${org}/${site}/${skillPath}/script.js`;

  let text;
  try {
    const resp = await fetch(skillMdUrl);
    if (!resp.ok) return { error: `skill.md not found for ${skillId} (${resp.status})` };
    text = await resp.text();
  } catch (err) {
    return { error: `failed to fetch skill.md: ${err.message}` };
  }

  const manifest = parseSkillFrontmatter(text);
  if (!manifest) return { error: `invalid or missing frontmatter in skill.md for ${skillId}` };

  return { manifest: { ...manifest, id: skillId }, moduleUrl: scriptJsUrl };
}
