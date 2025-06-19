const VIEW_TYPES = {
  dashboard: 'none',
  basics: 'setup',
  validate: 'setup',
  options: 'setup',
  sync: 'manage',
  translate: 'manage',
  rollout: 'manage',
  complete: 'none',
};

function hasSync({ urls, options }) {
  if (!urls || !options) return false;
  const location = options['source.language']?.location || '/';
  return urls.some((url) => !url.suppliedPath.startsWith(location));
}

function hasTranslate({ langs }) {
  if (!langs) return false;
  return langs?.some((lang) => lang.action === 'translate');
}

function hasCopy({ langs }) {
  if (!langs) return false;
  return langs?.some((lang) => lang.action === 'copy');
}

function hasRollout({ langs }) {
  if (!langs) return false;
  return langs?.some((lang) => lang.locales?.length > 0);
}

function isTranslateComplete({ langs }) {
  if (!langs) return false;
  const notComplete = langs.reduce((acc, lang) => {
    const { action } = lang;
    if (action === 'translate' || action === 'copy') {
      const objName = action === 'translate' ? 'translation' : action;
      if (!lang[objName] || lang[objName].status !== 'complete') acc.push(lang);
    }
    return acc;
  }, []);
  return notComplete.length === 0;
}

function isRolloutComplete({ langs }) {
  if (!langs) return false;
  const notComplete = langs.reduce((acc, lang) => {
    const { action, rollout } = lang;
    if (action === 'translate' || action === 'copy' || action === 'rollout') {
      const { status } = rollout || {};
      if (status !== 'complete') acc.push(lang);
    }
    return acc;
  }, []);
  return notComplete.length === 0;
}

function getSyncStep(project) {
  const needsSync = hasSync(project);
  if (!needsSync) return null;
  return { text: 'Sync sources', view: 'sync' };
}

function getTranslateStep(project) {
  const needsTranslate = hasTranslate(project);
  const needsCopy = hasCopy(project);
  if (!(needsTranslate || needsCopy)) return null;

  const view = 'translate';
  if (needsTranslate && !needsCopy) return { view, text: 'Translate sources' };
  if (!needsTranslate && needsCopy) return { view, text: 'Copy sources' };
  return { view, text: 'Translate & copy' };
}

function getOptionsNext(project) {
  const needsSync = hasSync(project);
  if (needsSync) return { view: 'sync', text: 'Sync sources' };

  const translate = getTranslateStep(project);
  if (translate) return translate;

  const needsRollout = hasRollout(project);
  if (needsRollout) return { view: 'rollout', text: 'Rollout' };

  return { view: 'complete' };
}

function getSyncNext(project) {
  const disabled = !project.urls?.every((url) => url.synced === 'synced' || url.synced === 'skipped');

  const translate = getTranslateStep(project);
  if (translate) return { ...translate, disabled };

  const needsRollout = hasRollout(project);
  if (needsRollout) return { view: 'rollout', text: 'Rollout', disabled };

  return { view: 'complete', text: 'Complete project', disabled };
}

function getDashboardStep({ org, site }) {
  if (org && site) return { text: 'Dashboard', hash: `/dashboard/${org}/${site}` };
  return { text: 'All apps', href: '/apps' };
}

function getRolloutPrev(project) {
  const translate = getTranslateStep(project);
  if (translate) return translate;

  const needsSync = hasSync(project);
  if (needsSync) return { text: 'Sync sources', view: 'sync' };

  return { text: 'Dashboard', hash: `/dashboard/${project.org}/${project.site}` };
}

function canRollout({ langs }) {
  if (!langs || !langs.length) return false;
  return langs.some((lang) => {
    const rolloutOnly = lang.action === 'rollout';
    const tranlateComplete = lang.translation?.status === 'complete';
    const copyComplete = lang.copy?.status === 'complete';
    return rolloutOnly || tranlateComplete || copyComplete;
  });
}

function canComplete(project) {
  if (!project.langs) return false;
  const needsRollout = hasRollout(project);
  if (needsRollout) return isRolloutComplete(project);
  return isTranslateComplete(project);
}

function getStyle(comparison, name, view, defaultIcon) {
  const checkedIcon = '#S2_Icon_CheckmarkCircleGreen_20_N';
  const styles = [];
  if (comparison) styles.push('filled');
  if (name === view) styles.push('highlight');
  const icon = comparison && name !== view ? checkedIcon : defaultIcon;
  return { style: styles.join(' '), icon };
}

function dashboard({ view, org, site }) {
  const { style } = getStyle((org && site), 'dashboard', view, '#S2_Icon_Archive_20_N');
  const step = {
    style,
    visible: view !== 'dashboard' && view !== 'complete',
    icon: '#S2_Icon_Archive_20_N',
    text: 'All projects',
  };

  const prev = { href: `/apps#/${org}/${site}`, text: 'All apps' };
  const next = { hash: `/basics/${org}/${site}`, text: 'Create new project', style: 'accent' };

  return { step, prev, next };
}

function basics({ view, org, site, urls }) {
  const { style, icon } = getStyle(urls?.length, 'basics', view, '#S2_Icon_ListBulleted_20_N');

  const step = {
    icon,
    style,
    text: 'Setup basics',
    visible: VIEW_TYPES[view] === 'setup',
  };

  const prev = getDashboardStep({ org, site });
  const next = { view: 'validate', text: 'Validate sources' };

  return { step, prev, next };
}

function validate({ view, urls }) {
  const checked = urls?.every((url) => url.checked);
  const { style, icon } = getStyle(checked, 'validate', view, '#S2_Icon_Binoculars_20_N');
  const step = {
    icon,
    style,
    text: 'Validate sources',
    visible: VIEW_TYPES[view] === 'setup',
  };

  const prev = { view: 'basics', text: 'Setup basics' };
  const next = { view: 'options', text: 'Confirm options' };

  return { step, prev, next };
}

function optionsStep(project) {
  const { style, icon } = getStyle(project.options, 'options', project.view, '#S2_Icon_Properties_20_N');

  const step = {
    style,
    icon,
    text: 'Confirm options',
    visible: VIEW_TYPES[project.view] === 'setup',
  };

  const prev = { view: 'validate', text: 'Validate sources' };
  const next = { ...getOptionsNext(project), text: 'Start project' };

  return { step, prev, next };
}

function syncStep(project) {
  const needsSync = hasSync(project);
  const synced = project.urls?.every((url) => url.synced === 'synced' || url.synced === 'skipped');
  const { style, icon } = getStyle(needsSync && synced, 'sync', project.view, '#S2_Icon_Refresh_20_N');

  const step = {
    style,
    icon,
    text: 'Sync sources',
    visible: VIEW_TYPES[project.view] === 'manage' && needsSync,
  };

  const prev = { text: 'Dashboard', hash: `/dashboard/${project.org}/${project.site}` };
  const next = getSyncNext(project);

  return { step, prev, next };
}

function translateStep(project) {
  const translateComplete = isTranslateComplete(project);
  const { style, icon } = getStyle(translateComplete, 'translate', project.view, '#S2_Icon_GlobeGrid_20_N');

  const translate = getTranslateStep(project);

  const step = {
    style,
    icon,
    text: translate?.text,
    visible: VIEW_TYPES[project.view] === 'manage' && !!translate,
  };

  const sync = getSyncStep(project);

  const prev = sync || getDashboardStep(project);
  const next = hasRollout(project)
    ? { text: 'Rollout locales', view: 'rollout', disabled: !canRollout(project) }
    : { text: 'Complete project', view: 'complete', disabled: !canComplete(project) };

  return { step, prev, next };
}

function rolloutStep(project) {
  const needsRollout = hasRollout(project);
  const rolloutComplete = isRolloutComplete(project);
  const { style, icon } = getStyle(rolloutComplete, 'rollout', project.view, '#S2_Icon_FileConvert_20_N');

  const step = {
    style,
    icon,
    text: 'Rollout locales',
    visible: VIEW_TYPES[project.view] === 'manage' && needsRollout,
  };

  const prev = getRolloutPrev(project);
  const next = { text: 'Complete project', view: 'complete', disabled: !canComplete(project) };

  return { step, prev, next };
}

function startStep({ view }) {
  const step = {
    visible: VIEW_TYPES[view] === 'setup',
    style: false,
    icon: '#S2_Icon_GlobeGrid_20_N',
    text: 'Start project',
  };

  const prev = { };
  const next = { };

  return { step, prev, next };
}

function completeStep({ view }) {
  const step = {
    style: '',
    icon: '#S2_Icon_GlobeGrid_20_N',
    text: 'Project complete',
    visible: VIEW_TYPES[view] === 'manage',
  };

  const prev = { };
  const next = { };

  return { step, prev, next };
}

export const VIEWS = {
  dashboard,
  basics,
  validate,
  options: optionsStep,
  start: startStep,
  sync: syncStep,
  translate: translateStep,
  rollout: rolloutStep,
  complete: completeStep,
};

export function calculateView({ project, currentView, direction }) {
  return VIEWS[currentView](project)[direction];
}
