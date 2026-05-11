/**
 * Skills Editor block — thin loader.
 *
 * The actual component lives in the da-skills repo, deployed independently.
 * This shim resolves the correct origin, injects the IMS token, and mounts
 * the <nx-skills-editor> custom element.
 *
 * Origin resolution (same pattern as da-admin, da-collab, etc.):
 *   ?da-skills=local  → http://localhost:3000  (local dev)
 *   ?da-skills=reset   → clear override, use default
 *   default            → https://main--da-skills--adobe.aem.live
 */

const DA_SKILLS_ENVS = {
  local: 'http://localhost:3000',
  prod: 'https://main--da-skills--adobe.aem.live',
};

function resolveSkillsOrigin() {
  const key = 'da-skills';
  try {
    const q = new URL(window.location.href).searchParams.get(key);
    if (q === 'reset') localStorage.removeItem(key);
    else if (q) localStorage.setItem(key, q);
  } catch { /* ignore */ }

  const stored = localStorage.getItem(key);
  return (stored && DA_SKILLS_ENVS[stored]) || DA_SKILLS_ENVS.prod;
}

const SKILLS_ORIGIN = resolveSkillsOrigin();
const SKILLS_BASE = `${SKILLS_ORIGIN}/apps/skills`;

const { initAuth } = await import(`${SKILLS_BASE}/utils/da-fetch.js`);

try {
  const { loadIms } = await import('../../utils/ims.js');
  const ims = await loadIms();
  const token = ims?.accessToken?.token;
  if (token) initAuth(token);
} catch { /* anonymous */ }

await import(`${SKILLS_BASE}/nx-skills-editor.js`);

export default function decorate(block) {
  const el = document.createElement('nx-skills-editor');
  block.textContent = '';
  block.append(el);
}

export function getPanel() {
  return document.createElement('nx-skills-editor');
}
