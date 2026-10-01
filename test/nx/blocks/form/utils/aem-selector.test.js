import { expect } from '@esm-bundle/chai';
import { selectAemAsset } from '../../../../../nx/blocks/form/utils/aem-selector.js';
import {
  DM_ERROR_MSG,
  MISSING_FORMAT_ERROR_MSG,
  PUBLISH_ERROR_MSG,
} from '../../../../../nx2/utils/aem-assets/selection.js';

const METADATA_KEY = 'http://ns.adobe.com/adobecloud/rel/metadata/asset';

const AUTHOR_PUBLISH_CONFIG = {
  repositoryId: 'author-p1-e1.adobeaemcloud.com',
  tierType: 'author',
  assetOrigin: 'publish-p1-e1.adobeaemcloud.com',
  assetBasePath: '/adobe/assets',
  isDmEnabled: false,
};

const AUTHOR_DM_CONFIG = {
  ...AUTHOR_PUBLISH_CONFIG,
  assetOrigin: 'delivery-p1-e1.adobeaemcloud.com',
  isDmEnabled: true,
};

const IMAGE_ASSET = {
  'aem:formatName': 'jpeg',
  mimetype: 'image/jpeg',
  name: 'photo.jpg',
  path: '/content/dam/photo.jpg',
  'repo:id': 'urn:aaid:aem:img-001',
  _links: {},
  _embedded: {
    [METADATA_KEY]: {
      'dam:assetStatus': 'approved',
      'dam:activationTarget': 'delivery',
    },
  },
};

function stubSelector() {
  const calls = [];
  const selectors = {
    renderAssetSelector: (panel, props) => calls.push({ panel, props }),
  };
  return { calls, loadSelector: async () => ({ selectors }) };
}

function start({ repoConfig = AUTHOR_PUBLISH_CONFIG, loadSelector, getToken } = {}) {
  const selector = stubSelector();
  const pick = selectAemAsset({
    repoConfig,
    loadSelector: loadSelector ?? selector.loadSelector,
    getToken: getToken ?? (async () => 'ims-token'),
    loadStyles: async () => {},
  });
  return { pick, calls: selector.calls };
}

const waitForRender = async (calls) => {
  while (!calls.length) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve); });
  }
  return calls[0];
};

const openDialog = () => document.querySelector('.nx-form-aem-dialog');

async function expectRejection(pick, message) {
  try {
    await pick;
    throw new Error('Expected the selection to fail.');
  } catch (error) {
    expect(error.message).to.equal(message);
  }
}

describe('selectAemAsset', () => {
  afterEach(() => {
    document.querySelectorAll('.nx-form-aem-dialog').forEach((dialog) => dialog.remove());
  });

  it('renders the hosted selector in a modal dialog with the IMS token and repository', async () => {
    const { pick, calls } = start();
    const { panel, props } = await waitForRender(calls);

    expect(openDialog().open).to.equal(true);
    expect(openDialog().contains(panel)).to.equal(true);
    expect(props.imsToken).to.equal('ims-token');
    expect(props.repositoryId).to.equal('author-p1-e1.adobeaemcloud.com');
    expect(props.aemTierType).to.equal('author');

    props.onClose();
    await pick;
  });

  it('resolves the delivery URL and name of the selected asset and removes the dialog', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([IMAGE_ASSET]);

    expect(await pick).to.deep.equal({
      href: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/photo.jpg',
      name: 'photo.jpg',
    });
    expect(openDialog()).to.equal(null);
  });

  it('rejects an asset that is not approved for delivery', async () => {
    const { pick, calls } = start({ repoConfig: AUTHOR_DM_CONFIG });
    const { props } = await waitForRender(calls);

    props.handleSelection([{
      ...IMAGE_ASSET,
      _embedded: { [METADATA_KEY]: { 'dam:assetStatus': 'draft' } },
    }]);

    await expectRejection(pick, DM_ERROR_MSG);
    expect(openDialog()).to.equal(null);
  });

  it('rejects an asset that is not published', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([{ ...IMAGE_ASSET, 'repo:scene7FileStatus': 'PublishIncomplete' }]);

    await expectRejection(pick, PUBLISH_ERROR_MSG);
  });

  it('rejects an asset without a format', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([{ ...IMAGE_ASSET, 'aem:formatName': undefined }]);

    await expectRejection(pick, MISSING_FORMAT_ERROR_MSG);
  });

  it('cancels when the selector closes', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.onClose();

    expect(await pick).to.deep.equal({ cancelled: true });
    expect(openDialog()).to.equal(null);
  });

  it('cancels when the dialog is dismissed', async () => {
    const { pick, calls } = start();
    await waitForRender(calls);

    openDialog().dispatchEvent(new Event('close'));

    expect(await pick).to.deep.equal({ cancelled: true });
    expect(openDialog()).to.equal(null);
  });

  it('cancels an empty selection', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([]);

    expect(await pick).to.deep.equal({ cancelled: true });
  });

  it('fails without opening a dialog when the selector cannot load', async () => {
    const { pick } = start({ loadSelector: async () => ({ error: 'The AEM Assets selector could not be loaded.' }) });

    await expectRejection(pick, 'The AEM Assets selector could not be loaded.');
    expect(openDialog()).to.equal(null);
  });

  it('fails when the loaded script does not provide a selector', async () => {
    const { pick } = start({ loadSelector: async () => ({ selectors: {} }) });

    await expectRejection(pick, 'The AEM Assets selector could not be loaded.');
    expect(openDialog()).to.equal(null);
  });

  it('asks the user to sign in without loading the selector when there is no IMS token', async () => {
    let loads = 0;
    const { pick } = start({
      getToken: async () => undefined,
      loadSelector: async () => { loads += 1; return { selectors: {} }; },
    });

    await expectRejection(pick, 'Sign in to select an image from AEM Assets.');
    expect(loads).to.equal(0);
    expect(openDialog()).to.equal(null);
  });
});
