const MESSAGES = {
  INDEX_PARSE_ERROR: "Your media results couldn't be loaded. It may be damaged or in an unexpected format. Try refreshing the page.",
  LOCK_CREATE_FAILED_PERMISSION: 'You need write access on the DA site to save the latest media data. You can still browse through existing data.',
  LOCK_CREATE_FAILED_GENERIC: "Couldn't start discovery. Try again.",
  LOCK_REMOVE_FAILED: "Couldn't clear the previous discovery session. Try again.",
  DA_READ_DENIED: 'You can\'t access this site with your current profile. Check you\'re signed in to the right account.',
  DA_READ_DENIED_SUGGESTION: 'Are you logged into the correct profile?',
  VALIDATION_SITE_403: 'Site not found or you don\'t have access. Check the org and site name.',
  VALIDATION_SITE_403_SUGGESTION: 'If the site exists, try signing in with a different account.',
  VALIDATION_PATH_403: 'Path not found or you don\'t have access. Check the folder path.',
  VALIDATION_PATH_403_SUGGESTION: 'If the path exists, try signing in with a different account.',
  VALIDATION_SITE_NOT_FOUND: 'Site not found: {path}. Check org and site spelling.',
  VALIDATION_PATH_NOT_FOUND: 'Folder not found: {path}. Open a parent folder or update the URL.',
  VALIDATION_PATH_NOT_FOUND_CHILD: 'Folder not found: {path}. Open a parent folder or update the URL.',
  VALIDATION_PATH_NOT_FOUND_SUGGESTION: 'Check that {segment} exists in {parentPath}',
  VALIDATION_PATH_EMPTY: 'Parent path not found or empty: {path}',
  VALIDATION_SITE_PATH_FILE: 'Site path cannot point to a file',
  VALIDATION_ENTER_SITE_URL: 'Enter a site URL to start. Example: https://main--site--org.aem.page',
  DA_WRITE_DENIED: "Couldn't save your media results. You can still browse current results, but your changes weren't saved. Try again, refresh the page, or contact your admin for write access.",
  DA_SAVE_FAILED: "Couldn't save your media results. You can still browse current results, but your changes weren't saved. Try again, refresh the page, or contact your admin.",
  PARTIAL_SAVE: "Some save steps didn't complete. Media results may be incomplete or out of date. Try refreshing the page.",
  EDS_LOG_DENIED: 'You need Author or higher permissions on EDS to see the latest media data. You can still browse existing media.',
  EDS_AUTH_EXPIRED: 'Session expired. Sign in again.',

  NOTIFY_SIGN_IN: 'Sign in to run discovery.',
  NOTIFY_VERIFY_AUTH: 'Failed to verify authentication.',
  NOTIFY_POLLING_UNAVAILABLE: 'Auto-refresh unavailable. Refresh the page to get latest results.',
  NOTIFY_DISCOVERY_FAILED: "Discovery didn't complete. Try again.",
  NOTIFY_ALREADY_PINNED: 'Already Pinned!',
  NOTIFY_ALREADY_PINNED_MSG: 'Folder :{folder} is already pinned',
  NOTIFY_FOLDER_PINNED: 'Folder Pinned',
  NOTIFY_FOLDER_PINNED_MSG: 'Folder :{folder} pinned',
  NOTIFY_LINK_COPIED: 'Link Copied',
  NOTIFY_LINK_COPIED_MSG: 'Media library link copied to clipboard',
  NOTIFY_COPIED: 'Copied',
  NOTIFY_COPIED_IMAGE: 'Resource Copied.',
  NOTIFY_COPIED_URL: 'Resource URL Copied.',
  NOTIFY_COPY_ERROR: 'Failed to copy Resource.',
  NOTIFY_EXPORT_NO_DATA: 'No data to export.',
  NOTIFY_EXPORT_SUCCESS: 'Export complete.',
  NOTIFY_EXPORT_ERROR: 'Failed to export.',
  NOTIFY_ERROR: 'Error',
  NOTIFY_INFO: 'Info',
  NOTIFY_SUCCESS: 'Success',
  NOTIFY_WARNING: 'Warning',

  UI_DISCOVERING: 'Discovering',
  UI_DISCOVERY_IN_PROGRESS: 'Discovery session in progress',
  UI_DISCOVERY_HINT: 'Media will appear automatically when discovery is complete.',
  UI_NO_ITEMS_FOUND: 'No {filterLabel} found',
  UI_NO_ITEMS_IN_PATH: 'No {filterLabel} in {path}',
  UI_NO_ITEMS_MATCHING: 'No {filterLabel} matching "{query}"',
  UI_TRY_DIFFERENT_SEARCH: 'Try a different search or type selection',
  UI_DISMISS: 'Dismiss',
  UI_EXTERNAL_RESOURCE: 'External resource',
  UI_UNABLE_TO_FETCH: 'Unable to fetch file ({error})',
  UI_UNABLE_TO_FETCH_HTTP: 'Unable to fetch file (HTTP {status})',
};

export function t(key, params = {}) {
  const str = MESSAGES[key];
  if (str == null) return key;

  return str.replace(/\{(\w+)\}/g, (_, name) => {
    const val = params[name];
    return val != null ? String(val) : `{${name}}`;
  });
}

export { MESSAGES };
