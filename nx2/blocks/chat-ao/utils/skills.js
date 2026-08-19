import { loadIms } from '../../../utils/ims.js';
import { AO_HTTP_BASE, AO_MANIFEST_ID } from '../ao-constants.js';
import { getOrgId } from './uploads.js';

const SKILLS_CACHE_KEY = `da-chat-ao-skills--${AO_MANIFEST_ID}`;

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
export function loadCachedSkills() {
  try {
    const raw = localStorage.getItem(SKILLS_CACHE_KEY);
    const skills = raw ? JSON.parse(raw) : null;
    return Array.isArray(skills) && skills.length ? skills : null;
  } catch {
    return null;
  }
}

function saveCachedSkills(skills) {
  try {
    localStorage.setItem(SKILLS_CACHE_KEY, JSON.stringify(skills));
  } catch {
    // best-effort — localStorage can throw (quota, private mode); safe to ignore
  }
}

// Real catalog lookup. Best-effort: a network error or unexpected response shape
// returns null, leaving the cache (or empty list) in place rather than throwing.
export async function fetchSkills() {
  try {
    const { accessToken, projectedProductContext } = await loadIms();
    const resp = await fetch(`${AO_HTTP_BASE}/api/v1/skills?manifest_id=${AO_MANIFEST_ID}`, {
      headers: {
        authorization: `Bearer ${accessToken?.token}`,
        'x-tenant-id': getOrgId(projectedProductContext),
      },
    });
    if (!resp.ok) return null;
    const skills = parseSkillsListResponse(await resp.json());
    if (skills) saveCachedSkills(skills);
    return skills;
  } catch {
    return null;
  }
}
