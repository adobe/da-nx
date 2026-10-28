import { loadIms } from '../../../utils/ims.js';
import { getOrgId, aoContext } from './uploads.js';
import { resolveManifestId } from './manifest.js';
import { CMA_BRIDGE_HTTP_BASE } from '../ao-constants.js';

const SKILLS_CACHE_PREFIX = 'da-chat-ao-skills';

function getSkillsCacheKey(tenantId) {
  return tenantId ? `${SKILLS_CACHE_PREFIX}--${tenantId}` : null;
}

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9_-]{1,60}$/i;

export function toSlashMenuItems({ skills = [], filter } = {}) {
  const items = skills
    .filter(({ name }) => !filter || name.toLowerCase().includes(filter))
    .map(({ name, description }) => ({
      id: name,
      label: `/${name}`,
      description,
    }));
  return items.length ? [{ section: 'Skills' }, ...items] : [];
}

const compareByName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

// Also accepts legacy cached plain-name strings.
function normalizeSkills(list) {
  const skills = list
    .map((s) => (typeof s === 'string' ? { name: s } : s))
    .filter((s) => typeof s?.name === 'string')
    .map((s) => ({
      name: s.name.trim(),
      description: typeof s.description === 'string' ? s.description.trim() : '',
    }))
    .filter((s) => SKILL_NAME_RE.test(s.name))
    .sort(compareByName);
  return skills.length ? skills : null;
}

// Prefer display_description; fall back to description when missing or blank.
const pickDescription = ({ display_description: display, description } = {}) => (
  typeof display === 'string' && display.trim() ? display : description
);

function parseSkillsListResponse(json) {
  const skills = Array.isArray(json?.skills) ? json.skills : null;
  if (!skills) return null;
  return normalizeSkills(skills
    .filter((s) => !s?.hidden && s?.user_invocable !== false)
    .map((s) => ({ name: s?.name, description: pickDescription(s ?? {}) })));
}

export async function loadCachedSkills() {
  try {
    const { projectedProductContext } = await loadIms();
    const key = getSkillsCacheKey(getOrgId(projectedProductContext));
    if (!key) return null;
    const raw = localStorage.getItem(key);
    const skills = raw ? JSON.parse(raw) : null;
    return Array.isArray(skills) ? normalizeSkills(skills) : null;
  } catch {
    return null;
  }
}

function saveCachedSkills(skills, tenantId) {
  try {
    const key = getSkillsCacheKey(tenantId);
    if (key) localStorage.setItem(key, JSON.stringify(skills));
  } catch {
    // localStorage can throw (quota, private mode)
  }
}

// Alt-harness routes to the CMA bridge, which needs an explicit x-user-id.
// See docs/chat-ao-alt-harness.md.
export async function fetchSkills({ org, site, altHarnessKey } = {}) {
  try {
    const {
      base, headers, tenantId, userId,
    } = await aoContext();
    const skillsBase = altHarnessKey ? CMA_BRIDGE_HTTP_BASE : base;
    const skillsHeaders = altHarnessKey && userId ? { ...headers, 'x-user-id': userId } : headers;
    const { manifestId } = await resolveManifestId({ org, site });
    const resp = await fetch(`${skillsBase}/api/v1/skills?manifest_id=${manifestId}`, { headers: skillsHeaders });
    if (!resp.ok) return null;
    const skills = parseSkillsListResponse(await resp.json());
    if (skills) saveCachedSkills(skills, tenantId);
    return skills;
  } catch {
    return null;
  }
}
