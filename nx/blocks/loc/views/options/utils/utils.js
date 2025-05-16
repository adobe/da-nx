const DEFAULT_PROPS = [
  { key: 'sync.conflict.behavior', value: 'overwrite, merge' },
  { key: 'translate.conflict.behavior', value: 'overwrite, merge' },
  { key: 'copy.conflict.behavior', value: 'overwrite, merge' },
  { key: 'rollout.conflict.behavior', value: 'overwrite, merge' },
  { key: 'translation.service.all.env', value: 'prod, stage' },
];

/**
 * Determine what view should be next based on what URLs were added.
 *
 * @param {String} source the source path prefix from where translation is sent.
 * @param {Object[]} langs the active languages on the localization project
 * @param {Object[]} urls the supplied URLs
 * @param {String} urls[].suppliedPath the originally supplied path
 * @param {Boolean} urls[].checked whether or not the URL was validated
 * @returns the view
 */
function calculateView(source, langs, urls) {
  const needsSync = urls.some((url) => !url.suppliedPath.startsWith(source));
  if (needsSync && source !== '/') return 'sync';

  const needsCopy = langs.some((lang) => lang.action === 'copy');
  if (needsCopy) return 'copy';

  const needsTranslate = langs.some((lang) => lang.action === 'translate');
  if (needsTranslate) return 'translate';

  const needsRollout = langs.some((lang) => lang.action === 'rollout');
  if (needsRollout) return 'rollout';

  return 'options';
}

function formatService(config) {
  const name = config['translation.service.name'];

  const service = { name, envs: {} };
  Object.keys(config).forEach((key) => {
    if (key.startsWith('translation.service.')) {
      const serviceKey = key.replace('translation.service.', '');

      const [env, prop] = serviceKey.split('.');
      if (env === 'name' || env === 'all') return;
      service.envs[env] ??= {};
      service.envs[env][prop] = config[key];
    }
  });

  return service;
}

export function formatConfig(sheets) {
  const config = sheets.config.data.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  const service = formatService(config);

  // Setup localization project's default options
  const options = DEFAULT_PROPS.reduce((acc, prop) => {
    const strValues = config[prop.key] || prop.value;
    acc[prop.key] = strValues.split(',')[0].trim();
    return acc;
  }, {});

  // If a source lang is spec'd, set it.
  if (config['source.language']) {
    const found = sheets.languages.data
      .find((lang) => lang.name === config['source.language']);
    if (found) {
      options['source.language'] = {
        name: found.name,
        code: found.code,
        location: found.location,
      };
    }
  }

  // Add source lang if it exists

  return { options, config: { ...config, service } };
}

export function getAllActions(langs) {
  return langs.reduce((acc, lang) => {
    lang.orderedActions.forEach((action) => {
      const { value } = action;
      const hasValue = acc.some((curr) => curr.value === value);
      if (!hasValue) acc.push(action);
    });
    return acc;
  }, [])
    // Sort it to place skip at the end.
    .sort((a, b) => {
      if (a.value === 'skip') return 1;
      if (b.value === 'skip') return -1;
      return 0;
    });
}

export function formatLangs(langs) {
  return langs.map((lang) => {
    // Format language actions
    const split = lang.actions.split(',').map((action) => {
      const value = action.trim().toLowerCase();
      const name = `${String(value).charAt(0).toUpperCase()}${String(value).slice(1)}`;
      return { value, name };
    });

    // Add skip if it doesn't exist
    const hasSkip = split.some((action) => action.value === 'skip');
    if (!hasSkip) split.push({ value: 'skip', name: 'Skip' });
    lang.orderedActions = split;
    [lang.activeAction] = split;
    lang.locales = lang.locales && lang.locales.split(',').map((value) => ({ code: value.trim(), active: true }));

    return lang;
  });
}

export function finalizeOptions(config, suppliedOptions, suppliedLangs, suppliedUrls) {
  const options = { ...suppliedOptions };
  const serviceEnv = options['translation.service.all.env'];

  options.service = {
    name: config.service.name,
    ...config.service.envs[serviceEnv],
  };

  const langs = suppliedLangs.reduce((acc, lang) => {
    if (lang.activeAction.value !== 'skip') {
      // fiter out empty strings
      const filteredProps = Object.keys(lang).reduce((props, key) => {
        if (lang[key]) props[key] = lang[key];
        return props;
      }, {});

      // Get the requested action and remove the props
      const action = filteredProps.activeAction.value;
      delete filteredProps.activeAction;
      delete filteredProps.orderedActions;
      delete filteredProps.actions;

      const locales = lang.locales.filter((locale) => locale.active);
      acc.push({
        ...filteredProps,
        action,
        locales,
      });
    }
    return acc;
  }, []);

  if (langs.length === 0) {
    return {
      message: {
        text: 'Please select an action for at least one language.',
        type: 'error',
      },
    };
  }

  const view = calculateView(options['source.language'].location, langs, suppliedUrls);

  return { view, options, langs };
}
