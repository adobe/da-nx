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

import { formatDate } from '../../utils/utils.js';

const DB_NAME = 'nx-loc-cache';
const CACHE_TIMESTAMP_TOLERANCE = 5 * 1000;

/**
 * Creates a project cache instance for a specific org/site
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {Function} onError - Optional error handler callback
 * @returns {Object} Cache instance with getCachedData and setCachedData methods
 */
const createProjectCache = (org, site, onError = null) => {
  const storeName = `projects-${org}-${site}`;
  let dbPromise = null;

  /**
   * Report error to handler if provided
   */
  const reportError = (operation, error) => {
    if (onError) {
      onError({ operation, error, org, site });
    }
  };

  /**
   * Helper to wrap IndexedDB request in a promise
   */
  const idbRequest = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  /**
   * Ensure object store exists during upgrade
   */
  const ensureStoreExists = (db) => {
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName);
    }
  };

  /**
   * Wrap indexedDB.open in a promise with common handlers
   */
  const openDBRequest = (version) => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);

    request.onerror = () => {
      reportError(version ? 'upgrade' : 'open', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      ensureStoreExists(event.target.result);
    };
  });

  /**
   * Force upgrade to create new store
   * @param {number} currentVersion - Current database version
   */
  const openDBWithUpgrade = async (currentVersion) => {
    const newVersion = currentVersion + 1;
    const upgradedDb = await openDBRequest(newVersion);

    return { db: upgradedDb, storeName };
  };

  /**
   * Open database and ensure store exists (internal, no caching)
   */
  const openDBInternal = async () => {
    const db = await openDBRequest();

    // Ensure the store exists
    if (!db.objectStoreNames.contains(storeName)) {
      // Store doesn't exist, need to upgrade
      const currentVersion = db.version;
      db.close();
      // Trigger upgrade by incrementing version
      return openDBWithUpgrade(currentVersion);
    }

    return { db, storeName };
  };

  /**
   * Open IndexedDB connection (cached)
   */
  const openDB = () => {
    if (!dbPromise) {
      dbPromise = openDBInternal().catch((error) => {
        dbPromise = null;
        throw error;
      });
    }

    return dbPromise;
  };

  /**
   * Rehydrate cached data with formatted dates and path-derived fields
   */
  const rehydrateCachedData = (cached, projectPath) => ({
    ...cached,
    created: formatDate(cached.createdOn),
    modified: formatDate(cached.lastModified),
    isArchived: projectPath.includes('archive'),
  });

  const getLocalesTotal = (langs) => langs.reduce(
    (acc, lang) => acc + (lang.locales?.length || 0),
    0,
  );

  const getActionStatus = (actionableLangs, action) => {
    const counts = actionableLangs.reduce((acc, lang) => {
      const status = lang[action]?.status || 'not started';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const total = actionableLangs.length;
    if (counts.complete === total) return 'complete';
    if (counts['not started'] === total) return 'not started';
    if ((counts.cancelled || 0) === total - (counts.waiting || 0)) return 'cancelled';
    return 'in progress';
  };

  const getRolloutStatus = (langs) => {
    // Anything with locales is assumed to need rollout
    const actionableLangs = langs.filter((lang) => lang.locales);
    if (!actionableLangs.length) return null;
    return getActionStatus(actionableLangs, 'rollout');
  };

  const getTranslationStatus = (langs) => {
    const actionableLangs = langs.filter((lang) => lang.action === 'translate');
    if (!actionableLangs.length) return null;
    return getActionStatus(actionableLangs, 'translation');
  };

  /**
   * Enrich project data with calculated fields and formatted dates
   */
  const enrichProjectData = (project, projectPath, listLastModified) => {
    const baseData = {
      ...project,
      path: projectPath,
      langsTotal: project.langs?.length || 0,
      localesTotal: project.langs ? getLocalesTotal(project.langs) : 0,
      translateStatus: getTranslationStatus(project.langs ?? []),
      rolloutStatus: getRolloutStatus(project.langs ?? []),
      createdOn: Number(projectPath.split('/').pop()),
      lastModified: listLastModified,
    };
    return rehydrateCachedData(baseData, projectPath);
  };

  /**
   * Get cached data from IndexedDB and rehydrate it
   * @param {string} key - Cache key (project path)
   * @param {number} listLastModified - Last modified timestamp from project list
   * @returns {Promise<Object|null>} Rehydrated cached data or null
   */
  const getCachedData = async (key, listLastModified) => {
    try {
      const { db } = await openDB();
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      const cached = await idbRequest(request);

      if (!cached) return null;

      // Use cache if it exists and is still fresh
      // eslint-disable-next-line @stylistic/max-len
      if (cached.lastModified && Math.abs(cached.lastModified - listLastModified) < CACHE_TIMESTAMP_TOLERANCE) {
        return rehydrateCachedData(cached, key);
      }

      return null;
    } catch (error) {
      reportError('get', error);
      return null;
    }
  };

  /**
   * Enrich project data and cache it in IndexedDB
   * @param {string} key - Cache key (project path)
   * @param {Object} project - Raw project data
   * @param {number} listLastModified - Last modified timestamp
   * @returns {Promise<Object>} Enriched project data
   */
  const setCachedData = async (key, project, listLastModified) => {
    // Enrich the project data
    const enrichedProject = enrichProjectData(project, key, listLastModified);

    try {
      // Extract only the fields needed for cache storage
      const cacheData = {
        path: enrichedProject.path,
        view: enrichedProject.view,
        title: enrichedProject.title,
        modifiedBy: enrichedProject.modifiedBy,
        createdBy: enrichedProject.createdBy,
        langsTotal: enrichedProject.langsTotal,
        localesTotal: enrichedProject.localesTotal,
        translateStatus: enrichedProject.translateStatus,
        rolloutStatus: enrichedProject.rolloutStatus,
        isArchived: enrichedProject.isArchived,
        createdOn: enrichedProject.createdOn,
        lastModified: enrichedProject.lastModified,
      };

      const { db } = await openDB();
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(cacheData, key);
      await idbRequest(request);
    } catch (error) {
      reportError('set', error);
    }

    return enrichedProject;
  };

  return {
    getCachedData,
    setCachedData,
  };
};

export default createProjectCache;
