function getPathLength(urlPattern) {
  const path = urlPattern.replace(/^https?:\/\/[^/]+/, '');
  return (path.match(/[^/]+/g) || []).length;
}

function isPatternMatch(pattern, testUrl) {
  const normalizeUrl = (urlToNormalize) => urlToNormalize.replace(/\/langstore\/en\//g, '/');
  const urlPath = typeof testUrl === 'object' && testUrl.suppliedPath ? testUrl.suppliedPath : testUrl;
  const regexPattern = normalizeUrl(pattern)
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');
  return new RegExp(`^${regexPattern}$`).test(normalizeUrl(urlPath));
}

function parseLocPageRules(config) {
  const pageRules = {};
  if (config?.['loc-page-rules']?.data) {
    config['loc-page-rules'].data.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const {
        url = '',
        languages = '',
        workflow = '',
        workflowName = '',
      } = entry;
      if (!url || typeof url !== 'string' || !languages) return;
      if (!pageRules[url]) {
        pageRules[url] = {};
      }
      const ruleLanguages = languages.split(',').map((language) => language.trim());
      ruleLanguages.forEach((lang) => {
        pageRules[url][lang] = {
          workflow,
          workflowName,
        };
      });
    });
  }
  return pageRules;
}

function addAssignment(assignments, workflow, workflowName, lang, url) {
  const assignment = {
    lang,
    url,
    workflow,
    workflowName,
  };
  assignments.push(assignment);
}

function findMatchingRules(url, pageRules) {
  const matches = Object.entries(pageRules)
    .filter(([pattern]) => isPatternMatch(pattern, url))
    .map(([pattern, rule]) => ({
      pattern,
      rule,
      isExact: pattern === url,
      pathLength: getPathLength(pattern),
    }));

  return matches.sort((a, b) => {
    if (a.isExact !== b.isExact) return b.isExact - a.isExact;
    if (a.pathLength !== b.pathLength) return b.pathLength - a.pathLength;
    return b.pattern.length - a.pattern.length;
  });
}

function processLanguageWithRules(assignments, sortedMatches, lang, url) {
  let hasRuleAssignment = false;
  const trimmedLang = lang.trim();
  sortedMatches.forEach((match) => {
    if (hasRuleAssignment) return;
    const { rule } = match;
    if (rule[trimmedLang]) {
      const { workflow, workflowName } = rule[trimmedLang];
      addAssignment(assignments, workflow, workflowName, trimmedLang, url);
      hasRuleAssignment = true;
    }
  });
  return hasRuleAssignment;
}

function processLanguageWithDefaults(assignments, langObj, url) {
  if (langObj.workflow && langObj.workflowName) {
    const trimmedCode = langObj.code.trim();
    addAssignment(assignments, langObj.workflow, langObj.workflowName, trimmedCode, url);
  }
}

function processUrl(assignments, url, languageObjects, pageRules) {
  const matches = findMatchingRules(url, pageRules);
  const languagesForDefaultWorkflow = [];

  languageObjects.forEach((langObj) => {
    if (matches.length > 0) {
      const hasRuleAssignment = processLanguageWithRules(assignments, matches, langObj.code, url);
      if (!hasRuleAssignment) {
        languagesForDefaultWorkflow.push(langObj);
      }
    } else {
      languagesForDefaultWorkflow.push(langObj);
    }
  });

  languagesForDefaultWorkflow.forEach((langObj) => {
    processLanguageWithDefaults(assignments, langObj, url);
  });
}

function buildLanguageUrlSets(assignments) {
  const languageUrlSets = {};

  assignments.forEach((assignment) => {
    const { lang, url, workflow, workflowName } = assignment;
    const workflowKey = `${workflow}/${workflowName}`;

    if (!languageUrlSets[lang]) {
      languageUrlSets[lang] = {};
    }
    if (!languageUrlSets[lang][workflowKey]) {
      languageUrlSets[lang][workflowKey] = new Set();
    }
    languageUrlSets[lang][workflowKey].add(url);
  });

  return languageUrlSets;
}

function groupLanguagesByWorkflow(languageUrlSets) {
  const workflowGroups = {};
  Object.entries(languageUrlSets).forEach(([language, workflows]) => {
    Object.entries(workflows).forEach(([workflowKey, urlSet]) => {
      const urlSetKey = Array.from(urlSet).sort().join(',');
      if (!workflowGroups[workflowKey]) {
        workflowGroups[workflowKey] = new Map();
      }

      const existingEntry = Array.from(workflowGroups[workflowKey].entries())
        .find(([existingUrls]) => existingUrls === urlSetKey);
      if (existingEntry) {
        const [, languages] = existingEntry;
        if (!languages.includes(language)) {
          languages.push(language);
        }
      } else {
        workflowGroups[workflowKey].set(urlSetKey, [language]);
      }
    });
  });
  return workflowGroups;
}

function buildWorkflowGroups(workflowGroups) {
  const finalResult = {};

  Object.entries(workflowGroups).forEach(([workflowKey, urlSets]) => {
    finalResult[workflowKey] = [];

    urlSets.forEach((value, key) => {
      const urlPaths = key.split(',');

      finalResult[workflowKey].push({
        languages: value.sort(),
        urlPaths: urlPaths.sort(),
      });
    });
  });
  return finalResult;
}

function groupAssignments(assignments) {
  const languageUrlSets = buildLanguageUrlSets(assignments);
  const workflowGroups = groupLanguagesByWorkflow(languageUrlSets);
  return buildWorkflowGroups(workflowGroups);
}

function getAssignments(urls, languageObjects, pageRules) {
  const assignments = [];
  urls.forEach((url) => {
    processUrl(assignments, url, languageObjects, pageRules);
  });
  return assignments;
}

/**
 * Group URLs based on loc-page-rules workflow assignments
 *
 * @param {Array<string>} urls Array of URLs to get workflows for
 * @param {Array<Object>} languageObjects Array of language objects with code & workflow properties
 * @param {Object} config Configuration data containing loc-page-rules
 * @returns {Object} Mapping of workflows to arrays of language-URL groups
 */
export function groupUrlsByWorkflow(urls, languageObjects, config) {
  if (!config) {
    return {};
  }
  const pageRules = parseLocPageRules(config);
  const assignments = getAssignments(urls, languageObjects, pageRules);
  return groupAssignments(assignments);
}
