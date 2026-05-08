/**
 * Index Lock Management - For indexing operations only
 *
 * This module manages index build locks to prevent concurrent builds.
 * It handles lock creation, refresh (heartbeat), removal, ownership, and checking.
 */

import { daFetch } from '../../../utils/daFetch.js';
import { createSheet } from './admin-api.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { t } from '../core/messages.js';
import { DA_ORIGIN, IndexFiles, IndexConfig } from '../core/constants.js';

const LOCK_OWNER_STORAGE_KEY = 'media-library-lock-owner-id';

function getMediaLibraryPath(sitePath) {
  return `${sitePath}/${IndexFiles.FOLDER}`;
}

export function getIndexLockPath(sitePath) {
  return `${getMediaLibraryPath(sitePath)}/${IndexFiles.INDEX_LOCK}`;
}

export async function checkIndexLock(sitePath) {
  const path = getIndexLockPath(sitePath);
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (resp.ok) {
      const data = await resp.json();
      const lockData = data.data?.[0] || data;
      return {
        exists: true,
        locked: lockData.locked || false,
        timestamp: lockData.timestamp || null,
        startedAt: lockData.startedAt || lockData.timestamp || null,
        lastUpdated: lockData.lastUpdated || lockData.timestamp || null,
        ownerId: lockData.ownerId || '',
        mode: lockData.mode || '',
      };
    }
  } catch (e) {
    return {
      exists: false,
      locked: false,
      timestamp: null,
      startedAt: null,
      lastUpdated: null,
      ownerId: '',
      mode: '',
    };
  }
  return {
    exists: false,
    locked: false,
    timestamp: null,
    startedAt: null,
    lastUpdated: null,
    ownerId: '',
    mode: '',
  };
}

export function isFreshIndexLock(lock, now = Date.now()) {
  if (!(lock?.exists && lock?.locked)) return false;
  const heartbeat = lock.lastUpdated || lock.timestamp || lock.startedAt;
  if (!heartbeat) return false;
  return (now - heartbeat) < IndexConfig.LOCK_STALE_THRESHOLD_MS;
}

export function getIndexLockOwnerId() {
  if (typeof window === 'undefined' || !window.sessionStorage) return '';

  let ownerId = window.sessionStorage.getItem(LOCK_OWNER_STORAGE_KEY);
  if (ownerId) return ownerId;

  ownerId = `ml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(LOCK_OWNER_STORAGE_KEY, ownerId);
  return ownerId;
}

export async function createIndexLock(sitePath) {
  const path = getIndexLockPath(sitePath);
  const ownerId = getIndexLockOwnerId();
  const now = Date.now();
  const lockData = [{
    timestamp: now,
    startedAt: now,
    lastUpdated: now,
    ownerId,
    locked: true,
  }];
  const formData = await createSheet(lockData);
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
  if (!resp.ok) {
    logMediaLibraryError(ErrorCodes.LOCK_CREATE_FAILED, { status: resp.status, path });
    const isDenied = resp.status === 401 || resp.status === 403;
    const msg = isDenied ? t('LOCK_CREATE_FAILED_PERMISSION') : t('LOCK_CREATE_FAILED_GENERIC');
    throw new MediaLibraryError(ErrorCodes.LOCK_CREATE_FAILED, msg, { status: resp.status, path });
  }
  return resp;
}

export async function refreshIndexLock(sitePath, lockData = {}) {
  const path = getIndexLockPath(sitePath);
  const now = Date.now();
  const formData = await createSheet([{
    locked: true,
    timestamp: lockData.timestamp || lockData.startedAt || now,
    startedAt: lockData.startedAt || lockData.timestamp || now,
    lastUpdated: now,
    ownerId: lockData.ownerId || getIndexLockOwnerId(),
    mode: lockData.mode || '',
  }]);
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
  if (!resp.ok) {
    logMediaLibraryError(ErrorCodes.LOCK_CREATE_FAILED, { status: resp.status, path });
    const isDenied = resp.status === 401 || resp.status === 403;
    const msg = isDenied ? t('LOCK_CREATE_FAILED_PERMISSION') : t('LOCK_CREATE_FAILED_GENERIC');
    throw new MediaLibraryError(ErrorCodes.LOCK_CREATE_FAILED, msg, { status: resp.status, path });
  }
  return resp;
}

export async function removeIndexLock(sitePath) {
  const path = getIndexLockPath(sitePath);
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
  if (!resp.ok) {
    if (resp.status === 404) return resp;
    logMediaLibraryError(ErrorCodes.LOCK_REMOVE_FAILED, { status: resp.status, path });
    throw new MediaLibraryError(ErrorCodes.LOCK_REMOVE_FAILED, t('LOCK_REMOVE_FAILED'), { status: resp.status, path });
  }
  return resp;
}
