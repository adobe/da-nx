import { expect } from '@esm-bundle/chai';
import { selectAemAsset } from '../../../../../nx/blocks/form/utils/aem-selector.js';
import { setMockIms, resetMockIms } from '../../../../../nx2/test/mocks/ims.js';

import {
  DM_ERROR_MSG,
  MISSING_FORMAT_ERROR_MSG,
  PUBLISH_ERROR_MSG,
} from '../../../../../nx2/utils/aem-assets/selection.js';

const AEM_ERRORS = {
  signIn: 'Sign in to select a file from AEM Assets.',
  unavailable: 'The AEM Assets selector could not be loaded.',
};

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

function start({ repoConfig = AUTHOR_PUBLISH_CONFIG, loadSelector } = {}) {
  const selector = stubSelector();
  const pick = selectAemAsset({
    repoConfig,
    loadSelector: loadSelector ?? selector.loadSelector,
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

async function expectError(pick, message) {
  expect(await pick).to.deep.equal({ error: message });
}

describe('selectAemAsset', () => {
  afterEach(() => {
    document.querySelectorAll('.nx-form-aem-dialog').forEach((dialog) => dialog.remove());
    resetMockIms();
  });

  it('renders the hosted selector in a modal dialog with the IMS token and repository', async () => {
    const { pick, calls } = start();
    const { panel, props } = await waitForRender(calls);

    expect(openDialog().localName).to.equal('nx-dialog');
    expect(openDialog().title).to.equal('AEM Assets');
    await openDialog().updateComplete;
    expect(openDialog().shadowRoot.querySelector('dialog').open).to.equal(true);
    expect(openDialog().contains(panel)).to.equal(true);
    expect(props.imsToken).to.equal('test-token');
    expect(props.repositoryId).to.equal('author-p1-e1.adobeaemcloud.com');
    expect(props.aemTierType).to.equal('author');

    props.onClose();
    await pick;
  });

  it('resolves the delivery URL and name of the selected asset and removes the dialog', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([IMAGE_ASSET]);

    expect(await pick).to.deep.include({
      href: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/photo.jpg',
      name: 'photo.jpg',
      type: 'image/jpeg',
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

    await expectError(pick, DM_ERROR_MSG);
    expect(openDialog()).to.equal(null);
  });

  it('rejects an asset that is not published', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([{ ...IMAGE_ASSET, 'repo:scene7FileStatus': 'PublishIncomplete' }]);

    await expectError(pick, PUBLISH_ERROR_MSG);
  });

  it('rejects an asset without a format', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([{ ...IMAGE_ASSET, 'aem:formatName': undefined }]);

    await expectError(pick, MISSING_FORMAT_ERROR_MSG);
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
    const { pick } = start({ loadSelector: async () => ({ error: AEM_ERRORS.unavailable }) });

    await expectError(pick, AEM_ERRORS.unavailable);
    expect(openDialog()).to.equal(null);
  });

  it('fails when the loaded script does not provide a selector', async () => {
    const { pick } = start({ loadSelector: async () => ({ selectors: {} }) });

    await expectError(pick, AEM_ERRORS.unavailable);
    expect(openDialog()).to.equal(null);
  });

  it('asks the user to sign in without loading the selector when there is no IMS token', async () => {
    setMockIms({ anonymous: true });
    let loads = 0;
    const { pick } = start({
      loadSelector: async () => { loads += 1; return { selectors: {} }; },
    });

    await expectError(pick, AEM_ERRORS.signIn);
    expect(loads).to.equal(0);
    expect(openDialog()).to.equal(null);
  });

  it('accepts any asset type', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    expect(props.filterSchema).to.equal(undefined);
    props.handleSelection([{ ...IMAGE_ASSET, mimetype: 'application/zip', name: 'kit.zip' }]);

    expect((await pick).type).to.equal('application/zip');
  });

  it('reads the type from dc:format when mimetype is missing', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([{ ...IMAGE_ASSET, mimetype: undefined, 'dc:format': 'Image/JPEG' }]);

    expect((await pick).type).to.equal('image/jpeg');
  });
});
