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

function getSyncNextView(project) {

}

function getSyncNextText() {
  return 'Translate sources';
}

function getSyncNextEnabled() {
  return true;
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

function getTranslateNextEnabled() {
  return true;
}

function getRolloutPrevView(project) {

}

function getRolloutPrevText() {
  return 'Translate sources';
}

function getRolloutNextEnabled() {
  return true;
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
    },
    next: {
      view: () => ({ view: 'validate' }),
      text: getSyncNextText,
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
      enabled: getSyncNextEnabled,
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
      enabled: getTranslateNextEnabled,
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
      enabled: getRolloutNextEnabled,
    },
  },
};

export default VIEWS;
