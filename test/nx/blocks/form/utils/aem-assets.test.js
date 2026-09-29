import { expect } from '@esm-bundle/chai';
import { getAemAssetsAvailability } from '../../../../../nx/blocks/form/utils/aem-assets.js';

const configSheet = (entries) => ({ data: entries });
const config = (value) => ({ key: 'aem.repositoryId', value });

describe('form AEM Assets availability', () => {
  it('shows AEM Assets when the organization config provides a repository', async () => {
    const result = await getAemAssetsAvailability({
      org: 'example',
      site: 'site',
      fetchConfigs: () => [Promise.resolve(configSheet([config('delivery-aem.example')])), Promise.resolve(configSheet([]))],
    });
    expect(result).to.deep.equal({ available: true });
  });

  it('hides AEM Assets when the site has no repository', async () => {
    const result = await getAemAssetsAvailability({
      org: 'example',
      site: 'site',
      fetchConfigs: () => [Promise.resolve(configSheet([])), Promise.resolve(configSheet([]))],
    });
    expect(result).to.deep.equal({ available: false });
  });

  it('lets the site config disable an organization repository', async () => {
    const result = await getAemAssetsAvailability({
      org: 'example',
      site: 'site',
      fetchConfigs: () => [
        Promise.resolve(configSheet([config('author-aem.example')])),
        Promise.resolve(configSheet([config('')])),
      ],
    });
    expect(result).to.deep.equal({ available: false });
  });

  it('uses a site repository when the organization config does not exist', async () => {
    const result = await getAemAssetsAvailability({
      org: 'example',
      site: 'site',
      fetchConfigs: () => [
        Promise.resolve({ error: 'not found', status: 404 }),
        Promise.resolve(configSheet([config('author-aem.example')])),
      ],
    });
    expect(result).to.deep.equal({ available: true });
  });

  it('surfaces configuration failures instead of treating them as no opt-in', async () => {
    const result = await getAemAssetsAvailability({
      org: 'example',
      site: 'site',
      fetchConfigs: () => [
        Promise.resolve(configSheet([config('author-aem.example')])),
        Promise.resolve({ error: 'Forbidden', status: 403 }),
      ],
    });
    expect(result.available).to.equal(false);
    expect(result.error).to.include('Forbidden');
  });
});
