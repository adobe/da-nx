import { Operation } from '../core/constants.js';

// Creates media entry with consistent property order.
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

// Creates entry for external media (markdown refs).
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

// Creates entry for linked content (PDFs, SVGs, fragments).
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

// Creates orphan/unused media entry (no doc reference).
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
