// DEMO ONLY — prod target is adobe/skills (pending PR approval).
const MARKETPLACE_RAW_BASE = 'https://raw.githubusercontent.com/exp-workspace/skills/main/ew';

// Map execution_runtimes values to file extensions
const RUNTIME_EXT = { js: '.js' };

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

  const dependenciesRaw = get('execution_dependencies');
  const dependencies = dependenciesRaw
    ? dependenciesRaw.split(',').map((d) => d.trim()).filter(Boolean)
    : [];

  const timeoutRaw = get('execution_timeout_ms');
  const timeoutMs = timeoutRaw ? parseInt(timeoutRaw, 10) : 5000;

  return { entry, runtimes, capabilities, dependencies, timeoutMs };
}

/**
 * Resolve the skill manifest and script module URL for a given skillId.
 *
 * Fetches skill.md and script.js from the curated GH marketplace (TRUSTED source).
 * The script text is turned into a blob URL so the browser accepts it as an ES module
 * (raw.githubusercontent.com serves text/plain, which browsers reject for import()).
 *
 * Eligibility is determined CLIENT-SIDE from the fetched manifest — never from the
 * agent's tool args.
 *
 * @param {string} skillId - skill identifier; may be prefixed with `ao:` (reserved)
 * @returns {Promise<{ manifest: object, moduleUrl: string }|{ error: string }>}
 */
export async function resolveSkill(skillId) {
  if (!skillId) return { error: 'missing skillId' };

  // Marketplace skills (ao: prefix) — reserved seam, not yet implemented
  if (skillId.startsWith('ao:')) {
    return { error: 'ao marketplace skills not yet supported' };
  }

  const skillMdUrl = `${MARKETPLACE_RAW_BASE}/${skillId}/skill.md`;

  let mdText;
  try {
    const resp = await fetch(skillMdUrl);
    if (!resp.ok) return { error: `skill.md not found for ${skillId} (${resp.status})` };
    mdText = await resp.text();
  } catch (err) {
    return { error: `failed to fetch skill.md: ${err.message}` };
  }

  const manifest = parseSkillFrontmatter(mdText);
  if (!manifest) return { error: `invalid or missing frontmatter in skill.md for ${skillId}` };

  // Build scripts/<entry>.<ext> path — extension from the first declared js runtime
  const primaryRuntime = manifest.runtimes.find((r) => RUNTIME_EXT[r]) ?? 'js';
  const ext = RUNTIME_EXT[primaryRuntime] ?? '.js';
  const scriptUrl = `${MARKETPLACE_RAW_BASE}/${skillId}/scripts/${manifest.entry}${ext}`;

  let scriptText;
  try {
    const resp = await fetch(scriptUrl);
    if (!resp.ok) return { error: `script not found for ${skillId} (${resp.status})` };
    scriptText = await resp.text();
  } catch (err) {
    return { error: `failed to fetch script: ${err.message}` };
  }

  // raw.githubusercontent.com serves text/plain; browsers reject that MIME type for
  // ES module import(). Convert to a blob URL with the correct MIME type instead.
  const blob = new Blob([scriptText], { type: 'text/javascript' });
  const moduleUrl = URL.createObjectURL(blob);

  return { manifest: { ...manifest, id: skillId }, moduleUrl };
}
