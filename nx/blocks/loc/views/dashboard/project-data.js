/* ***********************************************************************
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 * Copyright 2025 Adobe
 * All Rights Reserved.
 *
 * NOTICE: All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 ************************************************************************* */

import { Queue } from '../../../../public/utils/tree.js';
import createProjectCache from './project-cache.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { fetchProject } from './index.js';

const MAX_CONCURRENT_REQUESTS = 50;

const createProjectData = async ({
  org, site, currentUser, initialType, handleError, initialSignal,
}) => {
  const TYPE_ACTIVE = 'active';
  const TYPE_ARCHIVE = 'archive';

  const projectListsByType = {
    [TYPE_ACTIVE]: null,
    [TYPE_ARCHIVE]: null,
  };

  let activeListType = initialType === TYPE_ARCHIVE ? initialType : TYPE_ACTIVE;
  let projectList = [];
  let filteredProjectList = [];
  let hasAnyFilters = false;

  const pathToTimestampMap = {};

  const filters = {
    searchQuery: null,
    startDate: null,
    endDate: null,
    selectedTranslationStatuses: [],
    selectedRolloutStatuses: [],
    viewAllProjects: true,
    showArchivedProjects: false,
  };

  const cache = createProjectCache(org, site, (errorInfo) => {
    // eslint-disable-next-line
    console.log(errorInfo);
  });

  const removeJsonExtension = (path) => (path.endsWith('.json') ? path.slice(0, -5) : path);

  const setError = (status, message = '') => {
    let error;
    if (status === 401 || status === 403) {
      error = {
        message: `Not authorized for: ${org} / ${site}.`,
        help: 'Are you logged into the correct profile?',
        status,
      };
    } else {
      error = {
        message: `Unknown error: ${message}.`,
        status,
      };
    }
    handleError({ criticalError: error });
  };

  const fetchProjectList = async (signal, type) => {
    const resp = await daFetch(`${DA_ORIGIN}/list/${org}/${site}/.da/translation/${type}`, { signal });
    if (!resp.ok) {
      setError(resp.status, resp.statusText);
      return { projects: [] };
    }
    const json = await resp.json();
    return { projects: json.reverse() };
  };

  const populateLastModifiedMap = (projects) => {
    projects.forEach((project) => {
      const cleanPath = removeJsonExtension(project.path);
      pathToTimestampMap[cleanPath] = project.lastModified;
    });
  };

  const getProjectListForType = async (signal) => {
    if (projectListsByType[activeListType] === null) {
      // eslint-disable-next-line max-len
      projectListsByType[activeListType] = (await fetchProjectList(signal, activeListType)).projects;
      populateLastModifiedMap(projectListsByType[activeListType]);
    }
    return projectListsByType[activeListType];
  };

  const fetchProjectDetails = async (projectPath, signal) => {
    const listLastModified = pathToTimestampMap[projectPath];

    // Check cache first (returns rehydrated data if fresh)
    const cachedProject = await cache.getCachedData(projectPath, listLastModified);
    if (cachedProject) return cachedProject;

    const result = await fetchProject(`${projectPath}.json`, { signal });
    if (!result.ok) return { failedToLoad: `Error while loading project ${projectPath} - ${result.status}` };

    // Enrich and cache (returns enriched data)
    return cache.setCachedData(projectPath, result.data, listLastModified);
  };

  const matchesSearchQuery = (project, query) => {
    if (!query) return true;
    return (project.title?.toLowerCase() ?? '').includes(query);
  };

  const matchesDateRange = (project, startDate, endDate) => {
    if (!startDate && !endDate) return true;
    const projectDate = new Date(project.createdOn);
    const afterStart = !startDate || projectDate >= new Date(startDate);
    const beforeEnd = !endDate || projectDate <= new Date(endDate);
    return afterStart && beforeEnd;
  };

  const matchesStatusList = (projectStatus, selectedStatuses) => {
    if (!selectedStatuses?.length) return true;
    return selectedStatuses.includes(projectStatus);
  };

  const matchesOwnership = (project, viewAllProjects, user) => (
    viewAllProjects || project.createdBy === user
  );

  const projectMatchesFilters = (project) => matchesSearchQuery(project, filters.searchQuery)
      && matchesDateRange(project, filters.startDate, filters.endDate)
      && matchesStatusList(project.translateStatus, filters.selectedTranslationStatuses)
      && matchesStatusList(project.rolloutStatus, filters.selectedRolloutStatuses)
      && matchesOwnership(project, filters.viewAllProjects, currentUser);

  const updateFilters = (newFilters) => {
    const {
      searchQuery,
      startDate,
      endDate,
      selectedTranslationStatuses,
      selectedRolloutStatuses,
      viewAllProjects,
    } = newFilters;
    filters.searchQuery = searchQuery?.toLowerCase();
    filters.startDate = startDate;
    filters.endDate = endDate;
    filters.selectedTranslationStatuses = selectedTranslationStatuses?.slice();
    filters.selectedRolloutStatuses = selectedRolloutStatuses?.slice();
    filters.viewAllProjects = viewAllProjects;

    hasAnyFilters = searchQuery?.length
      || !!startDate
      || !!endDate
      || selectedTranslationStatuses?.length
      || selectedRolloutStatuses?.length
      || !viewAllProjects;

    // Clear filtered list when no filters
    if (!hasAnyFilters) {
      filteredProjectList = [];
    }
  };

  const fetchAllProjectDetails = async (signal) => {
    const results = [];
    const queue = new Queue(async (project) => {
      const result = await fetchProjectDetails(project, signal);
      results.push(result);
    }, MAX_CONCURRENT_REQUESTS);

    await Promise.all(projectList.map((project) => queue.push(project)));
    return results.sort((a, b) => b.createdOn - a.createdOn);
  };

  const addNewProject = async (projectPath, projectData) => {
    const cleanPath = removeJsonExtension(projectPath);
    projectList.unshift(cleanPath);

    // Track lastModified for the new project
    if (projectData?.lastModified) {
      pathToTimestampMap[cleanPath] = projectData.lastModified;
    }

    // Add to cached active list to keep it in sync
    if (projectListsByType[TYPE_ACTIVE] !== null && projectData?.lastModified) {
      const newProjectEntry = {
        path: `${cleanPath}.json`,
        lastModified: projectData.lastModified,
        ext: 'json',
        name: cleanPath.split('/').pop(),
      };
      projectListsByType[TYPE_ACTIVE].unshift(newProjectEntry);
    }

    if (projectData) {
      // Enrich and cache (returns enriched data)
      const enrichedData = await cache.setCachedData(
        cleanPath,
        projectData,
        projectData.lastModified,
      );
      if (hasAnyFilters) {
        if (projectMatchesFilters(enrichedData)) {
          filteredProjectList.unshift(enrichedData);
        }
      }
    }
  };

  const removeFromList = (list, predicate) => {
    const index = list?.findIndex((item) => predicate(item)) ?? -1;
    if (index > -1) {
      list.splice(index, 1);
    }
  };

  const removeProjectFromActiveLists = (projectPath) => {
    delete pathToTimestampMap[projectPath];
    removeFromList(projectListsByType[TYPE_ACTIVE], (p) => p.path === projectPath);
    removeFromList(projectList, (p) => p === projectPath);
    removeFromList(filteredProjectList, (p) => p.path === projectPath);
  };

  const insertIntoArchiveList = (archivedProjectData) => {
    // Archive list is sorted in descending order by path (newest first)
    // Find the first project with a path less than the new path
    const insertIndex = projectListsByType[TYPE_ARCHIVE].findIndex(
      (p) => p.path < archivedProjectData.path,
    );

    if (insertIndex === -1) {
      // No smaller path found, append to end
      projectListsByType[TYPE_ARCHIVE].push(archivedProjectData);
    } else {
      // Insert at the found position to maintain sort order
      projectListsByType[TYPE_ARCHIVE].splice(insertIndex, 0, archivedProjectData);
    }
  };

  const archiveProject = (oldPath, newPath) => {
    // Remove project from all active lists
    removeProjectFromActiveLists(oldPath);

    // Add to archive list if it's been loaded
    if (projectListsByType[TYPE_ARCHIVE] !== null) {
      const archivedProjectData = {
        ext: 'json',
        lastModified: Date.now(),
        name: newPath.split('/').pop(),
        path: newPath,
      };
      insertIntoArchiveList(archivedProjectData);
    }
  };

  const checkForListChange = async (signal, showArchivedProjects = false) => {
    if (showArchivedProjects !== filters.showArchivedProjects) {
      filters.showArchivedProjects = showArchivedProjects;
      activeListType = showArchivedProjects ? TYPE_ARCHIVE : TYPE_ACTIVE;
      const newList = await getProjectListForType(signal);
      projectList = newList.map((project) => removeJsonExtension(project.path));
    }
  };

  const applyFilters = async (newFilters, signal) => {
    updateFilters(newFilters);
    await checkForListChange(signal, newFilters.showArchivedProjects);
    if (hasAnyFilters) {
      const allDetails = await fetchAllProjectDetails(signal);
      filteredProjectList = allDetails.filter(projectMatchesFilters);
    }
  };

  const getTotalCount = () => (hasAnyFilters ? filteredProjectList : projectList).length;

  const getDetailsForProjects = async (from, to, signal) => {
    if (hasAnyFilters) {
      return filteredProjectList.slice(from, to);
    }
    return Promise.all(
      projectList.slice(from, to).map((project) => fetchProjectDetails(project, signal)),
    );
  };

  const hasFiltersWithNoResults = () => hasAnyFilters && getTotalCount() === 0;

  const tempListForType = await getProjectListForType(initialSignal);
  if (tempListForType) {
    projectList = tempListForType.map((project) => removeJsonExtension(project.path));
  }

  return {
    getDetailsForProjects,
    addNewProject,
    archiveProject,
    applyFilters,
    getTotalCount,
    hasFiltersWithNoResults,
  };
};

export default createProjectData;
