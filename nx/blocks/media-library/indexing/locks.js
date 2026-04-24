/**
 * Index Lock Management - For indexing operations only
 *
 * This module manages index build locks to prevent concurrent builds.
 * It handles lock creation, refresh (heartbeat), removal, and ownership.
 *
 * Lock queries (checkIndexLock, isFreshIndexLock) are re-exported from
 * display/data.js since both layers need read access.
 */

import { daFetch } from '../../../utils/daFetch.js';
import { createSheet } from './admin-api.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { t } from '../core/messages.js';
import { DA_ORIGIN } from '../core/constants.js';
import {
  checkIndexLock as _checkIndexLock,
  isFreshIndexLock as _isFreshIndexLock,
  getIndexLockPath as _getIndexLockPath,
} from '../display/data.js';

// Re-export read-only lock functions from display layer
export const checkIndexLock = _checkIndexLock;
export const isFreshIndexLock = _isFreshIndexLock;
export const getIndexLockPath = _getIndexLockPath;

const LOCK_OWNER_STORAGE_KEY = 'media-library-lock-owner-id';

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
