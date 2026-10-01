import { loadIms, handleSignIn } from '../../../../nx2/utils/ims.js';
import { loadPageStyle } from '../../../../nx2/utils/utils.js';
import { loadAssetSelector } from '../../../../nx2/utils/aem-assets/selector.js';
import { buildAssetSelectorProps } from '../../../../nx2/utils/aem-assets/selector-props.js';
import { resolveAssetSelection } from '../../../../nx2/utils/aem-assets/selection.js';

const STYLE_HREF = new URL('./aem-selector.css', import.meta.url).href;
const SIGN_IN_ERROR = 'Sign in to select an image from AEM Assets.';
const LOAD_ERROR = 'The AEM Assets selector could not be loaded.';

async function loadImsToken() {
  const ims = await loadIms();
  if (ims?.anonymous) handleSignIn();
  return ims?.accessToken?.token;
}

function createSelectorDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'nx-form-aem-dialog';
  dialog.setAttribute('aria-label', 'AEM Assets');
  const panel = document.createElement('div');
  panel.className = 'nx-form-aem-selector';
  dialog.append(panel);
  return { dialog, panel };
}

function waitForSelection({ dialog, panel, selectors, imsToken, repoConfig }) {
  return new Promise((resolve, reject) => {
    const cancel = () => resolve({ cancelled: true });
    dialog.addEventListener('close', cancel, { once: true });

    const handleSelection = ([asset] = []) => {
      if (!asset) {
        cancel();
        return;
      }
      const result = resolveAssetSelection({ asset, repoConfig });
      if (result.error) {
        reject(new Error(result.error));
        return;
      }
      resolve({ href: result.href, name: asset['repo:name'] ?? asset.name });
    };

    selectors.renderAssetSelector(panel, buildAssetSelectorProps({
      imsToken,
      repoConfig,
      onClose: cancel,
      handleSelection,
    }));
  });
}

export async function selectAemAsset({
  repoConfig,
  host = document.body,
  getToken = loadImsToken,
  loadSelector = loadAssetSelector,
  loadStyles = () => loadPageStyle(STYLE_HREF),
}) {
  const imsToken = await getToken();
  if (!imsToken) throw new Error(SIGN_IN_ERROR);

  const [{ selectors, error }] = await Promise.all([loadSelector(), loadStyles()]);
  if (error || typeof selectors?.renderAssetSelector !== 'function') {
    throw new Error(error || LOAD_ERROR);
  }

  const { dialog, panel } = createSelectorDialog();
  host.append(dialog);
  dialog.showModal();
  try {
    return await waitForSelection({ dialog, panel, selectors, imsToken, repoConfig });
  } finally {
    dialog.close();
    dialog.remove();
  }
}
