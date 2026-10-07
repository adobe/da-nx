import { loadIms, handleSignIn } from '../../../../nx2/utils/ims.js';
import { loadPageStyle } from '../../../../nx2/utils/utils.js';
import { loadAssetSelector } from '../../../../nx2/utils/aem-assets/selector.js';
import { buildAssetSelectorProps } from '../../../../nx2/utils/aem-assets/selector-props.js';
import { resolveAssetSelection } from '../../../../nx2/utils/aem-assets/selection.js';
import { getMimetype } from '../../../../nx2/utils/aem-assets/urls.js';
import { CANCELLED } from './assets.js';
import '../../../../nx2/blocks/shared/dialog/dialog.js';

const STYLE_HREF = new URL('./aem-selector.css', import.meta.url).href;
const DIALOG_TITLE = 'AEM Assets';

const AEM_ERRORS = {
  signIn: 'Sign in to select a file from AEM Assets.',
  unavailable: 'The AEM Assets selector could not be loaded.',
};

async function getTokenOrSignIn() {
  const ims = await loadIms();
  if (ims?.anonymous) handleSignIn();
  return ims?.accessToken?.token;
}

function toAssetResult({ asset, repoConfig }) {
  if (!asset) {
    return CANCELLED;
  }

  const { href, error } = resolveAssetSelection({ asset, repoConfig });
  if (error) {
    return { error };
  }

  const type = getMimetype(asset).toLowerCase();
  const name = asset['repo:name'] ?? asset.name;
  return { href, name, type };
}

// The hosted selector renders outside shadow roots, so its dialog lives in the document body.
function openSelectorDialog() {
  const dialog = document.createElement('nx-dialog');
  dialog.className = 'nx-form-aem-dialog';
  dialog.title = DIALOG_TITLE;
  const container = document.createElement('div');
  container.className = 'nx-form-aem-selector';
  dialog.append(container);
  document.body.append(dialog);
  return { dialog, container };
}

function waitForSelection({ selectors, ui, selection }) {
  const { dialog, container } = ui;
  const { imsToken, repoConfig } = selection;
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(CANCELLED), { once: true });
    selectors.renderAssetSelector(container, buildAssetSelectorProps({
      imsToken,
      repoConfig,
      onClose: () => resolve(CANCELLED),
      handleSelection: ([asset] = []) => {
        resolve(toAssetResult({ asset, repoConfig }));
      },
    }));
  });
}

export async function selectAemAsset({
  repoConfig,
  getToken = getTokenOrSignIn,
  loadSelector = loadAssetSelector,
}) {
  const imsToken = await getToken();
  if (!imsToken) {
    return { error: AEM_ERRORS.signIn };
  }

  const [{ selectors, error }] = await Promise.all([
    loadSelector(),
    loadPageStyle(STYLE_HREF),
  ]);
  if (error) {
    return { error };
  }
  if (typeof selectors?.renderAssetSelector !== 'function') {
    return { error: AEM_ERRORS.unavailable };
  }

  const ui = openSelectorDialog();
  const selection = { imsToken, repoConfig };
  try {
    return await waitForSelection({ selectors, ui, selection });
  } finally {
    ui.dialog.remove();
  }
}
