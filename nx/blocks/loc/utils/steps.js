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

// function hasSync(urls, options) {
//   const location = options['source.language']?.location || '/';
//   return urls.some((url) => !url.suppliedPath.startsWith(location));
// }

// function hasTranslate(langs) {
//   return langs?.some((lang) => lang.action === 'translate');
// }

// function hasRollout(langs) {
//   return langs?.some((lang) => lang.locales?.length > 0);
// }

// function getDashboardPrevView(project) {
//   return { href: `/apps#/${project.org}/${project.site}` };
// }

// function getBasicsPrevView(project) {
//   if (project.org && project.site) return { view: 'dashboard' };
//   return { href: '/apps' };
// }

// function getBasicsPrevText(project) {
//   if (project.org && project.site) return 'Dashboard';
//   return 'All apps';
// }

// function getOptionsNextView(project) {
//   const needsSync = hasSync(project.urls, project.options);
//   if (needsSync) return { view: 'sync' };

//   const needsTranslate = hasTranslate(project.langs);
//   if (needsTranslate) return { view: 'translate' };

//   const needsRollout = hasRollout(project.langs);
//   if (needsRollout) return { view: 'rollout' };

//   return { view: 'complete' };
// }

// function getSyncNextView(project) {

// }

// function getSyncNextText() {
//   return 'Translate sources';
// }

// function getTranslatePrevView(project) {

// }

// function getTranslatePrevText() {
//   return 'Sync sources';
// }

// function getTranslateNextView(project) {}

// function getTranslateNextText() {
//   return 'Rollout locales';
// }

// function getRolloutPrevView(project) {

// }

// function getRolloutPrevText() {
//   return 'Translate sources';
// }

function getBasicsPrev(org, site) {
  if (org && site) return { text: 'Dashboard', hash: `/dashboard/${org}/${site}` };
  return { text: 'All apps', href: '/apps' };
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
    visible: view !== 'dashboard',
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

  const prev = getBasicsPrev(org, site);
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

function options({ view, options: projOptions }) {
  const { style, icon } = getStyle(projOptions, 'options', view, '#S2_Icon_Properties_20_N');

  const step = {
    style,
    icon,
    text: 'Confirm options',
    visible: VIEW_TYPES[view] === 'setup',
  };

  const prev = { view: 'validate', text: 'Validate sources' };
  const next = { view: 'options', text: 'Start project' };

  return { step, prev, next };
}

function start({ view }) {
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

export const VIEWS = {
  dashboard,
  basics,
  validate,
  options,
  start,
};

export function calculateView({ project, currentView, direction }) {
  return VIEWS[currentView](project)[direction];
}
