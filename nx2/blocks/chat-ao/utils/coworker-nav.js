import { loadIms } from '../../../utils/ims.js';

export const COWORKER_SKILLS_PATH = 'customizations';

export const ENTERPRISE_CONTEXT_PATH = 'experience-context';

export function getCoworkerHref({ tenantId, path = '' }) {
  const route = typeof tenantId === 'string' && tenantId.trim()
    ? `/@${encodeURIComponent(tenantId)}/coworker/i`
    : '/coworker';
  return `https://experience.adobe.com/#${route}/${encodeURIComponent(path)}`;
}

export async function loadCoworkerNav() {
  const { tenantId } = await loadIms();
  return (path) => getCoworkerHref({ tenantId, path });
}
