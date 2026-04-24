/**
 * Worker-safe version of bulk-status.js
 * Extracted verbatim from main branch, modified only to:
 * - Use worker-fetch.js functions instead of admin-api.js
 * - Accept runtime context (imsToken, isPerfEnabled) as parameters
 * - No window/localStorage dependencies
 */

import {
  createBulkStatusJob,
  pollStatusJob,
  getStatusJobDetails,
} from './fetch.js';
// Use worker-safe helper functions (avoids admin-api.js → daFetch.js → public/utils/constants.js)
import {
  extractJobPaths,
  extractJobPhase,
  extractJobIsComplete,
  parseResourcesFromDetailsRaw,
} from './admin-helpers.js';

const REQ_PER_SEC = 10;
const THROTTLE_MS = 1000 / REQ_PER_SEC;

const LARGE_SITE_PATH_THRESHOLD = 20_000;
const TARGET_PARTITION_RESOURCE_COUNT = 20_000;
const MAX_PARTITION_PATHS = 250;

function normalizePath(p) {
  if (!p || typeof p !== 'string') return '';
  return p.startsWith('/') ? p : `/${p}`;
}

function createSlotQueue(intervalMs = THROTTLE_MS) {
  const queue = [];
  const interval = setInterval(() => {
    const item = queue.shift();
    if (item) {
      Promise.resolve(item.fn()).then(item.resolve).catch(item.reject);
    }
  }, intervalMs);
  return {
    run(fn) {
      return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
      });
    },
    stop() { clearInterval(interval); },
  };
}

function mergeResourceRecords(existing, incoming) {
  return {
    ...existing,
    ...incoming,
    previewLastModified: existing.previewLastModified || incoming.previewLastModified || '',
    previewLastModifiedBy: existing.previewLastModifiedBy || incoming.previewLastModifiedBy || '',
  };
}

function mergeResourcesByPath(...resourceLists) {
  const byPath = new Map();
  resourceLists.forEach((resources) => {
    resources.forEach((resource) => {
      if (!resource?.path) return;
      const existing = byPath.get(resource.path);
      if (!existing) {
        byPath.set(resource.path, resource);
      } else {
        byPath.set(resource.path, mergeResourceRecords(existing, resource));
      }
    });
  });
  return Array.from(byPath.values());
}

function packPathBuckets(buckets) {
  const partitions = [];
  const sortedBuckets = [...buckets].sort((a, b) => (
    b.estimatedCount - a.estimatedCount
    || a.paths[0].localeCompare(b.paths[0])
  ));

  sortedBuckets.forEach((bucket) => {
    const targetPartition = partitions.find((partition) => (
      partition.estimatedCount + bucket.estimatedCount <= TARGET_PARTITION_RESOURCE_COUNT
      && partition.paths.length + bucket.paths.length <= MAX_PARTITION_PATHS
    ));

    if (targetPartition) {
      targetPartition.paths.push(...bucket.paths);
      targetPartition.estimatedCount += bucket.estimatedCount;
      return;
    }

    partitions.push({
      paths: [...bucket.paths],
      estimatedCount: bucket.estimatedCount,
    });
  });

  return partitions.map((partition) => ({
    ...partition,
    paths: partition.paths.slice().sort((a, b) => a.localeCompare(b)),
  }));
}

function buildPathPartitions(paths, base = null) {
  const topLevelBuckets = new Map();
  const rootPaths = new Set();

  paths.forEach((path) => {
    if (typeof path !== 'string' || !path.startsWith('/')) return;
    if (base && !path.startsWith(base) && path !== base) return;
    const pathNorm = path.replace(/\/$/, '');
    let relPath;
    if (!base) {
      relPath = pathNorm;
    } else if (pathNorm === base) {
      relPath = '';
    } else {
      relPath = pathNorm.slice(base.length + 1);
    }
    const segments = relPath.split('/').filter(Boolean);

    if (!segments.length) {
      rootPaths.add(base || path);
      return;
    }

    // When base is set, bucket by first segment under base;
    // otherwise by first segment from repo root.
    const exactPath = base ? `${base}/${segments[0]}` : `/${segments[0]}`;
    const bucket = topLevelBuckets.get(exactPath) || {
      exactPath,
      wildcardPath: `${exactPath}/*`,
      hasExactRoot: false,
      hasWildcardContent: false,
      estimatedCount: 0,
      pathList: [],
    };

    if (segments.length === 1) {
      if (path.endsWith('/')) {
        bucket.hasWildcardContent = true;
        bucket.estimatedCount += 1;
      } else {
        bucket.hasExactRoot = true;
      }
    } else {
      bucket.hasWildcardContent = true;
      bucket.estimatedCount += 1;
    }
    bucket.pathList.push(path);
    topLevelBuckets.set(exactPath, bucket);
  });

  const folderBuckets = [];
  topLevelBuckets.forEach((bucket) => {
    if (bucket.hasWildcardContent) {
      /* Subdivide buckets that exceed target size - e.g. /en/** with 25k paths */
      if (bucket.estimatedCount > TARGET_PARTITION_RESOURCE_COUNT && bucket.pathList.length > 0) {
        const subResult = buildPathPartitions(bucket.pathList, bucket.exactPath);
        folderBuckets.push(...subResult.partitions);
        return;
      }
      folderBuckets.push({
        paths: bucket.hasExactRoot
          ? [bucket.exactPath, bucket.wildcardPath]
          : [bucket.wildcardPath],
        estimatedCount: bucket.estimatedCount + (bucket.hasExactRoot ? 1 : 0),
      });
      return;
    }

    if (bucket.hasExactRoot) {
      rootPaths.add(bucket.exactPath);
    }
  });

  const rootBuckets = Array.from(rootPaths)
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({
      paths: [path],
      estimatedCount: 1,
    }));
  const partitions = packPathBuckets([...folderBuckets, ...rootBuckets]).sort((a, b) => (
    b.estimatedCount - a.estimatedCount
    || a.paths[0].localeCompare(b.paths[0])
  ));

  return { partitions };
}

async function runPartitionedStatusJobs(org, repo, ref, partitions, opts) {
  const {
    onProgress, slotQueue, pollInterval, maxDurationMs, perf, imsToken, isPerfEnabled,
  } = opts;
  if (!partitions.length) return [];

  let resources = [];
  const interval = partitions.length > 5 ? Math.min(pollInterval * 2, 3000) : pollInterval;
  const jobDurationsMs = [];
  const jobResults = [];
  let incompleteCount = 0;

  const LOG = '[MediaIndexer:bulk-status]';

  if (isPerfEnabled) {
    // eslint-disable-next-line no-console
    console.log(`${LOG} running ${partitions.length} partition jobs sequentially (matching backfill behavior)`);
  }

  // Run jobs sequentially like backfill to avoid incomplete jobs
  // eslint-disable-next-line no-restricted-syntax
  for (let i = 0; i < partitions.length; i += 1) {
    if (isPerfEnabled) {
      // eslint-disable-next-line no-console
      console.log(`${LOG} Starting partition job ${i + 1}/${partitions.length}`);
    }
    // Create job just before polling it
    const partition = partitions[i];
    const paths = Array.isArray(partition) ? partition : (partition?.paths || []);
    // eslint-disable-next-line no-await-in-loop
    const { jobUrl } = await createBulkStatusJob(org, repo, ref, imsToken, null, { paths });

    const jobStart = Date.now();

    // eslint-disable-next-line no-await-in-loop
    await pollStatusJob(jobUrl, imsToken, interval, (progress) => {
      if (onProgress && progress) {
        const pct = progress.processed && progress.total
          ? Math.round((progress.processed / progress.total) * 100)
          : 0;
        onProgress({
          stage: 'fetching',
          message: `Status job ${i + 1}/${partitions.length}: ${pct}%`,
        });
      }
    }, maxDurationMs);

    jobDurationsMs[i] = Date.now() - jobStart;
    if (isPerfEnabled) {
      // eslint-disable-next-line no-console
      console.log(`${LOG} Partition job ${i + 1}/${partitions.length} completed poll in ${jobDurationsMs[i]}ms`);
    }

    // Get details and check completion
    // eslint-disable-next-line no-await-in-loop
    const jobDetails = await slotQueue.run(() => getStatusJobDetails(jobUrl, imsToken));
    const isComplete = extractJobIsComplete(jobDetails, false);

    if (!isComplete) {
      incompleteCount += 1;
      const phase = extractJobPhase(jobDetails);
      // eslint-disable-next-line no-console
      console.warn(`${LOG} Partition job ${i + 1}/${partitions.length} stopped before completion (phase=${phase || 'unknown'})`);
    }

    // Extract resources from this partition
    const partResources = parseResourcesFromDetailsRaw(jobDetails);
    jobResults[i] = { resources: partResources, isComplete };
  }

  // Merge all resources
  jobResults.forEach((result) => {
    if (result?.resources) {
      resources = mergeResourcesByPath(resources, result.resources);
    }
  });

  if (perf) {
    perf.partitionJobMs = jobDurationsMs;
    perf.partitionJobMaxMs = Math.max(...jobDurationsMs, 0);
    perf.partitionCount = partitions.length;
    perf.jobCount = partitions.length;
    perf.incompleteJobCount = incompleteCount;
    // Wall-clock polling time (max of concurrent jobs)
    perf.pollingMs = Math.max(...jobDurationsMs, 0);
  }

  if (isPerfEnabled) {
    // eslint-disable-next-line no-console
    console.log(`${LOG} completed ${partitions.length} partition jobs (incomplete=${incompleteCount}, resources=${resources.length})`);
  }

  return resources;
}

async function runStatusJob(org, repo, ref, paths, opts = {}) {
  const {
    pathsOnly = false,
    onProgress,
    slotQueue,
    pollInterval = 1000,
    maxDurationMs = 30 * 60 * 1000,
    imsToken,
  } = opts;
  const normalizedPaths = Array.isArray(paths) ? paths : [paths];
  const { jobUrl } = await createBulkStatusJob(org, repo, ref, imsToken, null, {
    paths: normalizedPaths,
    pathsOnly,
  });

  await pollStatusJob(jobUrl, imsToken, pollInterval, (progress) => {
    if (onProgress && progress) {
      const pct = progress.processed && progress.total
        ? Math.round((progress.processed / progress.total) * 100)
        : 0;
      onProgress({ progress: pct });
    }
  }, maxDurationMs);

  const detailsRaw = await slotQueue.run(() => getStatusJobDetails(jobUrl, imsToken));
  const phase = extractJobPhase(detailsRaw);
  const resources = pathsOnly ? [] : parseResourcesFromDetailsRaw(detailsRaw);
  const isComplete = extractJobIsComplete(detailsRaw, pathsOnly);
  const discoveredPaths = pathsOnly ? extractJobPaths(detailsRaw) : [];

  return {
    phase,
    isComplete,
    resources,
    paths: discoveredPaths,
  };
}

/**
 * Worker-safe version of runBulkStatus
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} ref - Reference (branch)
 * @param {string|null} contentPath - Content path filter
 * @param {object} options - Configuration
 * @param {Function} options.onProgress - Progress callback
 * @param {number} options.pollInterval - Poll interval in ms
 * @param {number} options.maxDurationMs - Max duration in ms
 * @param {number} options.pollConcurrency - Concurrency limit
 * @param {string} options.imsToken - IMS access token (REQUIRED)
 * @param {boolean} options.isPerfEnabled - Enable perf logging
 */
export default async function runBulkStatus(org, repo, ref, contentPath, options = {}) {
  const {
    onProgress,
    pollInterval = 1000,
    maxDurationMs = 30 * 60 * 1000,
    pollConcurrency = 3,
    imsToken,
    isPerfEnabled = false,
  } = options;

  if (!imsToken) {
    throw new Error('[worker-bulk-status] imsToken is required');
  }

  const effectiveRef = ref || 'main';
  const perf = {};
  perf.jobCount = 0;
  perf.jobCreationMs = 0;
  perf.pollingMs = 0;
  perf.detailsFetchMs = 0;
  perf.totalDurationMs = 0;
  const startTime = Date.now();
  const base = contentPath ? normalizePath(contentPath).replace(/\/$/, '') : null;
  const LOG = '[MediaIndexer:bulk-status]';

  const discoveryPaths = base ? [base, `${base}/*`] : ['/*'];
  const slotQueue = createSlotQueue();

  try {
    const discoveryCreateStart = Date.now();
    const pathDiscoveryJob = await runStatusJob(org, repo, effectiveRef, discoveryPaths, {
      pathsOnly: true,
      onProgress: (p) => {
        if (onProgress) {
          onProgress({
            stage: 'discovery',
            message: `Discovery: ${p.progress || 0}%`,
          });
        }
      },
      slotQueue,
      pollInterval,
      maxDurationMs,
      imsToken,
    });
    perf.discoveryMs = Date.now() - discoveryCreateStart;
    perf.discoveryCreateMs = perf.discoveryMs;

    const discoveredPaths = pathDiscoveryJob.paths;
    const pathCount = discoveredPaths.length;
    const partitionPlan = pathCount > 0 ? buildPathPartitions(discoveredPaths, base) : null;

    if (pathDiscoveryJob.isComplete && pathCount === 0) {
      if (isPerfEnabled) {
        // eslint-disable-next-line no-console
        console.log(`${LOG} discovery done in ${perf.discoveryMs}ms, no preview paths found`);
      }
      perf.totalDurationMs = Date.now() - startTime;
      return { resources: [], perf };
    }

    let resources = [];
    perf.decision = 'single';

    if (!pathDiscoveryJob.isComplete && partitionPlan) {
      perf.decision = 'partitioned';
      if (isPerfEnabled) {
        // eslint-disable-next-line no-console
        console.log(`${LOG} discovery took ${perf.discoveryMs}ms, incomplete → partitioned (${pathCount} paths, ${partitionPlan.partitions.length} jobs)`);
      }
      resources = await runPartitionedStatusJobs(
        org,
        repo,
        effectiveRef,
        partitionPlan.partitions,
        {
          onProgress,
          slotQueue,
          pollConcurrency,
          pollInterval,
          maxDurationMs,
          perf,
          imsToken,
          isPerfEnabled,
        },
      );
    } else if (pathDiscoveryJob.isComplete && pathCount > LARGE_SITE_PATH_THRESHOLD) {
      perf.decision = 'partitioned';
      if (isPerfEnabled) {
        // eslint-disable-next-line no-console
        console.log(`${LOG} discovery took ${perf.discoveryMs}ms, large site (${pathCount} > ${LARGE_SITE_PATH_THRESHOLD}) → partitioned (${partitionPlan.partitions.length} jobs)`);
      }
      resources = await runPartitionedStatusJobs(
        org,
        repo,
        effectiveRef,
        partitionPlan.partitions,
        {
          onProgress,
          slotQueue,
          pollConcurrency,
          pollInterval,
          maxDurationMs,
          perf,
          imsToken,
          isPerfEnabled,
        },
      );
    } else {
      perf.decision = 'single';
      if (isPerfEnabled) {
        // eslint-disable-next-line no-console
        console.log(`${LOG} discovery took ${perf.discoveryMs}ms, ${pathCount} paths → single job [/*]`);
      }
      const fullCreateStart = Date.now();
      const primaryStatusJob = await runStatusJob(org, repo, effectiveRef, discoveryPaths, {
        onProgress: (p) => {
          if (onProgress) {
            onProgress({
              stage: 'fetching',
              message: `Status job: ${p.progress || 0}%`,
            });
          }
        },
        slotQueue,
        pollInterval,
        maxDurationMs,
        imsToken,
      });
      perf.jobCreationMs = Date.now() - fullCreateStart;
      perf.jobCount = 1;
      resources = primaryStatusJob.resources;

      if (primaryStatusJob.isComplete) {
        if (isPerfEnabled) {
          // eslint-disable-next-line no-console
          console.log(`${LOG} single job completed in ${Date.now() - fullCreateStart}ms (phase=${primaryStatusJob.phase})`);
        }
      } else if (partitionPlan) {
        perf.decision = 'partitioned-retry';
        if (isPerfEnabled) {
          // eslint-disable-next-line no-console
          console.log(`${LOG} single job stopped, retrying with ${partitionPlan.partitions.length} partitions`);
        }
        const partitioned = await runPartitionedStatusJobs(
          org,
          repo,
          effectiveRef,
          partitionPlan.partitions,
          {
            onProgress,
            slotQueue,
            pollConcurrency,
            pollInterval,
            maxDurationMs,
            perf,
            imsToken,
            isPerfEnabled,
          },
        );
        resources = mergeResourcesByPath(resources, partitioned);
      } else if (isPerfEnabled) {
        // eslint-disable-next-line no-console
        console.log(`${LOG} primary stopped, using partial results`);
      }
    }

    if (base) {
      const prefix = base.endsWith('/') ? base : `${base}/`;
      resources = resources.filter(
        (r) => r.path === base || (r.path && r.path.startsWith(prefix)),
      );
    }

    perf.totalDurationMs = Date.now() - startTime;

    if (isPerfEnabled) {
      const parts = [
        `[MediaIndexer:bulk-status] total ${perf.totalDurationMs}ms`,
        `discovery=${perf.discoveryMs}ms`,
        `decision=${perf.decision}`,
        `resources=${resources.length}`,
      ];
      if (perf.partitionCount) {
        const maxPoll = perf.partitionJobMaxMs ?? 0;
        const incomplete = perf.incompleteJobCount ?? 0;
        let pStr = `partitionJobs=${perf.partitionCount} (pollMax=${maxPoll}ms, incomplete=${incomplete})`;
        if (perf.decision === 'partitioned-retry' && perf.jobCreationMs) {
          pStr += ` primaryFirst=${perf.jobCreationMs}ms`;
        }
        parts.push(pStr);
        if (perf.partitionJobMs?.length) {
          const times = perf.partitionJobMs.map((t, i) => `j${i + 1}=${t}ms`).join(', ');
          parts.push(`perJob: [${times}]`);
        }
      } else {
        parts.push(`singleJob=${perf.jobCreationMs}ms`);
      }
      // eslint-disable-next-line no-console
      console.log(parts.join(' | '));
    }

    return { resources, perf };
  } finally {
    slotQueue.stop();
  }
}
