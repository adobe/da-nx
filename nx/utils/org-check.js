import { DA_ORIGIN } from '../public/utils/constants.js';
import { loadBlock } from '../scripts/nexter.js';
import { daFetch } from './daFetch.js';

const DEF_SANDBOX = 'aem-sandbox';
const TOAST_PATH = '/fragments/toasts/sandbox';

async function getIsSandbox(org) {
  const confResp = await daFetch(`${DA_ORIGIN}/config/${org}/`);
  const { status } = confResp;

  // Handle not authorized
  if (status === 403 || status === 401) return false;

  // Handle found config
  if (status === 200) {
    // Try to find a permission tab
    const json = await confResp.json();
    if (json.permissions) return false;
  }

  // Finally, attempt to see if there's any content in the org
  const listResp = await daFetch(`${DA_ORIGIN}/list/${org}`);
  const listJson = await listResp.json();
  return listJson.length > 0;
}

async function orgCheck() {
  // Remove existing toast if it exists
  document.querySelector('.toast.sandbox-org')?.remove();

  const { pathname, hash } = window.location;
  // Do not show on app screens
  if (pathname.startsWith('/app')) return;
  if (!hash) return;
  const hashVal = hash.replace('#', '');
  // Do nothing if not a path
  if (!hashVal.startsWith('/')) return;
  const [org] = hashVal.substring(1).split('/');
  // Do nothing if no org or known sandbox
  if (!org || org === DEF_SANDBOX) return;
  const isSandbox = await getIsSandbox(org);
  // Do nothing if not a sandbox
  if (!isSandbox) return;

  // Create a link block
  const link = document.createElement('a');
  link.href = TOAST_PATH;
  link.className = 'nx-toast';
  link.id = 'sandbox-org';
  loadBlock(link);
}

orgCheck();
window.addEventListener('hashchange', orgCheck);
