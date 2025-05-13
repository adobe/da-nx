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

export function formatConfig(options) {
  const config = options.config.data.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  const service = formatService(config);
  return { ...config, service };
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
