function hasSync(urls, options) {
  const location = options['source.language']?.location || '/';
  return urls.some((url) => !url.suppliedPath.startsWith(location));
}

function hasTranslate(langs) {
  return langs?.some((lang) => lang.action === 'translate');
}

function hasRollout(langs) {
  return langs?.some((lang) => lang.locales?.length > 0);
}

function getDashboardPrevView(project) {
  return { href: `/apps#/${project.org}/${project.site}` };
}

function getBasicsPrevView(project) {
  if (project.org && project.site) return { view: 'dashboard' };
  return { href: '/apps' };
}

function getBasicsPrevText(project) {
  if (project.org && project.site) return 'Dashboard';
  return 'All apps';
}

function getOptionsNextView(project) {
  const needsSync = hasSync(project.urls, project.options);
  if (needsSync) return { view: 'sync' };

  const needsTranslate = hasTranslate(project.langs);
  if (needsTranslate) return { view: 'translate' };

  const needsRollout = hasRollout(project.langs);
  if (needsRollout) return { view: 'rollout' };

  return { view: 'complete' };
}


function getSyncNextView(project) {

}

function getSyncNextText() {
  return 'Translate sources';
}

function getTranslatePrevView(project) {

}

function getTranslatePrevText() {
  return 'Sync sources';
}

function getTranslateNextView(project) {}

function getTranslateNextText() {
  return 'Rollout locales';
}

function getRolloutPrevView(project) {

}

function getRolloutPrevText() {
  return 'Translate sources';
}

const VIEWS = {
  dashboard: {
    prev: {
      view: getDashboardPrevView,
      text: () => ('All apps'),
    },
    next: {
      view: () => ({ view: 'basics' }),
      text: () => ('Create project'),
      enabled: () => (true),
    },
  },
  basics: {
    prev: {
      view: getBasicsPrevView,
      text: getBasicsPrevText,
      save: true,
    },
    next: {
      view: () => ({ view: 'validate' }),
      text: () => ('Validate sources'),
      enabled: () => (true),
      save: true,
    },
  },
  validate: {
    prev: {
      view: () => ({ view: 'basics' }),
      text: () => ('Basics'),
      save: true,
    },
    next: {
      view: () => ({ view: 'options' }),
      text: () => ('Confirm options'),
      enabled: () => (true),
      save: true,
    },
  },
  options: {
    prev: {
      view: () => ({ view: 'validate' }),
      text: () => ('Validate sources'),
      save: true,
    },
    next: {
      view: getOptionsNextView,
      text: () => ('Start project'),
      enabled: () => (true),
      save: true,
    },
  },
  sync: {
    prev: {
      view: () => ({ view: 'dashboard' }),
      text: () => ('Validate sources'),
    },
    next: {
      view: getSyncNextView,
      text: getSyncNextText,
      enabled: () => (true),
    },
  },
  translate: {
    prev: {
      view: getTranslatePrevView,
      text: getTranslatePrevText,
    },
    next: {
      view: getTranslateNextView,
      text: getTranslateNextText,
      enabled: () => (true),
      save: true,
    },
  },
  rollout: {
    prev: {
      view: getRolloutPrevView,
      text: getRolloutPrevText,
    },
    next: {
      view: () => ({ view: 'complete' }),
      text: () => ({ view: 'Complete project' }),
      enabled: () => (true),
    },
  },
};

export default VIEWS;
