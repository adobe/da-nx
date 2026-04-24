/**
 * Worker-safe helper functions extracted from admin-api.js
 *
 * These are pure data parsing functions with no window/localStorage dependencies.
 * Duplicated here to avoid importing admin-api.js which imports
 * utils/daFetch.js → public/utils/constants.js (has window.location)
 */

function asJobData(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  let nested = obj.job && typeof obj.job === 'object' ? obj.job : null;
  if (!nested && obj.data?.job && typeof obj.data.job === 'object') {
    nested = obj.data.job;
  }
  return nested && Object.keys(nested).length > 0 ? nested : obj;
}

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

export function parseResourcesFromDetailsRaw(raw) {
  const jobData = asJobData(raw);
  const dataRoot = (jobData && typeof jobData === 'object') ? jobData.data : null;
  const resources = dataRoot && typeof dataRoot === 'object' ? dataRoot.resources : null;
  return Array.isArray(resources) ? resources : [];
}

export function extractJobPhase(rawJobData) {
  const jobData = asJobData(rawJobData);
  const dataRoot = asObject(jobData.data);
  return typeof dataRoot.phase === 'string' ? dataRoot.phase : '';
}

export function extractJobState(rawJobData) {
  if (typeof rawJobData?.state === 'string' && rawJobData.state) {
    return rawJobData.state;
  }
  const jobData = asJobData(rawJobData);
  return typeof jobData.state === 'string' ? jobData.state : '';
}

export function extractJobError(rawJobData) {
  const jobData = asJobData(rawJobData);
  return typeof jobData.error === 'string' ? jobData.error : '';
}

export function extractJobCancelled(rawJobData) {
  const jobData = asJobData(rawJobData);
  return jobData.cancelled === true;
}

export function extractJobIsComplete(rawJobData, pathsOnly) {
  const state = extractJobState(rawJobData);
  const phase = extractJobPhase(rawJobData);
  const error = extractJobError(rawJobData);
  const cancelled = extractJobCancelled(rawJobData);

  if (state !== 'stopped' || error || cancelled) {
    return false;
  }
  if (phase === 'completed') {
    return true;
  }
  if (!pathsOnly) {
    const resources = parseResourcesFromDetailsRaw(rawJobData);
    return resources.length > 0;
  }
  return false;
}

export function extractJobPaths(rawJobData) {
  const jobData = asJobData(rawJobData);
  const resources = asObject(asObject(jobData.data).resources);
  const paths = new Set();
  Object.values(resources).forEach((partitionPaths) => {
    if (!Array.isArray(partitionPaths)) return;
    partitionPaths.forEach((path) => {
      if (typeof path === 'string' && path.startsWith('/')) {
        paths.add(path);
      }
    });
  });
  return Array.from(paths);
}
