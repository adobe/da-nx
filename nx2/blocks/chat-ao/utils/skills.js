import { loadIms } from '../../../utils/ims.js';
import { AO_MANIFEST_ID } from '../ao-constants.js';
import { getOrgId, aoContext } from './uploads.js';

const SKILLS_CACHE_PREFIX = 'da-chat-ao-skills';

function getSkillsCacheKey(tenantId) {
  return tenantId ? `${SKILLS_CACHE_PREFIX}--${tenantId}` : null;
}

function parseSkillsListResponse(json) {
  const skills = Array.isArray(json?.skills) ? json.skills : null;
  if (!skills) return null;
  const ids = skills
    .filter((s) => !s?.hidden && s?.user_invocable !== false)
    .map((s) => s?.name)
    .filter((s) => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9][a-z0-9_-]{1,60}$/i.test(s));
  return ids.length ? ids : null;
}

// Last-known skill list, so the slash-menu isn't empty before fetchSkills() resolves.
export async function loadCachedSkills() {
  try {
    const { projectedProductContext } = await loadIms();
    const key = getSkillsCacheKey(getOrgId(projectedProductContext));
    if (!key) return null;
    const raw = localStorage.getItem(key);
    const skills = raw ? JSON.parse(raw) : null;
    return Array.isArray(skills) && skills.length ? skills : null;
  } catch {
    return null;
  }
}

function saveCachedSkills(skills, tenantId) {
  try {
    const key = getSkillsCacheKey(tenantId);
    if (key) localStorage.setItem(key, JSON.stringify(skills));
  } catch {
    // best-effort — localStorage can throw (quota, private mode); safe to ignore
  }
}

// Real catalog lookup. Best-effort: a network error or unexpected response shape
// returns null, leaving the cache (or empty list) in place rather than throwing.
export async function fetchSkills() {
  try {
    const { base, headers, tenantId } = await aoContext();
    const resp = await fetch(`${base}/api/v1/skills?manifest_id=${AO_MANIFEST_ID}`, { headers });
    if (!resp.ok) return null;
    const skills = parseSkillsListResponse(await resp.json());
    if (skills) saveCachedSkills(skills, tenantId);
    return skills;
  } catch {
    return null;
  }
}
