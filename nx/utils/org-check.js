import { DA_ORIGIN } from '../public/utils/constants.js';
import { loadBlock } from '../scripts/nexter.js';

const DEF_SANDBOX = 'aem-sandbox';
const TOAST_PATH = '/fragments/toasts/sandbox';

async function getIsSandbox(org) {
  // Make a purposefully anonymous request to the org config
  const confResp = await fetch(`${DA_ORIGIN}/config/${org}/`);
  // Determine if the config is open (not 401 or 403)
  const openConfig = confResp.status !== 403 && confResp.status !== 401;
  if (!openConfig) return false;
  // See if there is any content in the org
  const listResp = await fetch(`${DA_ORIGIN}/list/${org}`);
  const json = await listResp.json();
  // If there's any content at all and the config is open, its a sandbox
  return json.length > 0;
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
