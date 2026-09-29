import { fetchDaConfigs, getFirstSheet } from '../../../../nx2/utils/daConfig.js';

export async function getAemAssetsAvailability({
  org,
  site,
  fetchConfigs = fetchDaConfigs,
}) {
  if (!org || !site) {
    return { available: false, error: 'The site is not available for AEM Assets configuration.' };
  }

  try {
    const configs = await Promise.all(fetchConfigs({ org, site }));
    const failure = configs.find((entry) => entry?.error && entry.status !== 404);
    if (failure) {
      return { available: false, error: `AEM Assets configuration could not be loaded. ${failure.error}` };
    }

    const entries = configs
      .filter((entry) => !entry?.error)
      .reverse()
      .flatMap((entry) => getFirstSheet(entry) ?? []);
    // Canvas and the da-live editor check this same key, but that code lives in the consuming
    // da-live project. Nexter must not import from its consumers, so the form checks it here.
    // Sharing it means moving the check into a Nexter utility that da-live then adopts.
    const repository = entries.find((entry) => entry.key === 'aem.repositoryId')?.value;
    return { available: !!repository };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { available: false, error: `AEM Assets configuration could not be loaded. ${message}` };
  }
}
