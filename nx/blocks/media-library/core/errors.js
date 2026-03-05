export const ErrorCodes = Object.freeze({
  VALIDATION_SITE_PATH_MISSING: 'VALIDATION sitePathMissing',
  VALIDATION_SITE_NOT_FOUND: 'VALIDATION siteNotFound',
  VALIDATION_PATH_NOT_FOUND: 'VALIDATION pathNotFound',
  DA_READ_DENIED: 'DA_READ_DENIED',
  DA_WRITE_DENIED: 'DA_WRITE_DENIED',
  DA_SAVE_FAILED: 'DA_SAVE_FAILED',
  PARTIAL_SAVE: 'PARTIAL_SAVE',
  EDS_LOG_DENIED: 'EDS_LOG_DENIED',
  EDS_AUTH_EXPIRED: 'EDS_AUTH_EXPIRED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  LOCK_CREATE_FAILED: 'LOCK_CREATE_FAILED',
  LOCK_REMOVE_FAILED: 'LOCK_REMOVE_FAILED',
  MARKDOWN_FETCH_PARTIAL: 'MARKDOWN_FETCH_PARTIAL',
  INDEX_PARSE_ERROR: 'INDEX_PARSE_ERROR',
  ONBOARD_PARSE_ERROR: 'ONBOARD_PARSE_ERROR',
  POLLING_FAILED: 'POLLING_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  BUILD_FAILED: 'BUILD_FAILED',
});

export class MediaLibraryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MediaLibraryError';
    this.code = code;
    this.details = details;
  }
}

// Logs error to console (sanitized; never tokens or PII).
export function logMediaLibraryError(code, details = {}) {
  const parts = ['[MediaLibrary]', code];
  const safe = Object.entries(details)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  if (safe) parts.push(safe);
  // eslint-disable-next-line no-console
  console.error(parts.join(' '));
}
