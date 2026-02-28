/**
 * Central factory for creating all entry types with consistent property order.
 * Follows helix-admin pattern: single source of truth for data structures.
 */

import { Operation } from '../core/constants.js';

/**
 * Property order for all entries: hash, url, name, timestamp, user, operation, type, doc, status
 */

export function createMediaEntry({
  hash,
  url,
  name,
  timestamp,
  user,
  operation,
  type,
  doc = '',
  status = 'referenced',
}) {
  return {
    hash,
    url,
    name,
    timestamp,
    user,
    operation,
    type,
    doc,
    status,
  };
}

export function createExternalMediaEntry(url, doc, latestPageTimestamp, info) {
  return {
    hash: url,
    url,
    name: info.name,
    timestamp: latestPageTimestamp,
    user: '',
    operation: Operation.EXTLINKS,
    type: info.type,
    doc: doc || '',
    status: 'referenced',
  };
}

export function createLinkedContentEntry(filePath, doc, fileEvent, status, type, url) {
  return {
    hash: filePath,
    url,
    name: filePath.split('/').pop() || filePath,
    timestamp: fileEvent.timestamp,
    user: fileEvent.user || '',
    operation: 'auditlog-parsed',
    type,
    doc: doc || '',
    status,
  };
}

export function createUnusedEntry(hash, url, name, timestamp, user, operation, type) {
  return {
    hash,
    url,
    name,
    timestamp,
    user,
    operation,
    type,
    doc: '',
    status: 'unused',
  };
}
