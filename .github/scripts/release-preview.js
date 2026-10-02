import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';
import releaseConfig from '../../.releaserc.cjs';

function pluginOptions(name) {
  const plugin = releaseConfig.plugins.find((entry) => (
    Array.isArray(entry) ? entry[0] === name : entry === name
  ));
  if (!plugin) throw new Error(`Release configuration is missing ${name}`);
  return Array.isArray(plugin) ? plugin[1] : {};
}

export async function previewRelease({
  cwd = process.cwd(),
  baseRef = process.env.RELEASE_BASE_REF || 'origin/main',
  logger = console,
} = {}) {
  const git = (...args) => execFileSync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  }).trimEnd();
  git('merge-base', '--is-ancestor', baseRef, 'HEAD');
  const tags = git('tag', '--merged', baseRef, '--list', 'v*')
    .split('\n')
    .filter((tag) => semver.valid(tag.slice(1)) && !semver.prerelease(tag.slice(1)))
    .sort((a, b) => semver.rcompare(a.slice(1), b.slice(1)));
  const lastRelease = tags.length ? {
    version: tags[0].slice(1),
    gitTag: tags[0],
    gitHead: git('rev-list', '-1', tags[0]),
  } : {};
  const range = lastRelease.gitHead ? `${lastRelease.gitHead}..HEAD` : 'HEAD';
  const fields = git('log', range, '-z', '--format=%H%x00%B').split('\0');
  const commits = fields.slice(0, -1).reduce((result, field, index) => {
    if (index % 2 === 0) result.push({ hash: field, message: fields[index + 1] });
    return result;
  }, []);
  const packageData = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
  const context = {
    cwd,
    env: process.env,
    logger,
    commits,
    lastRelease,
    options: {
      repositoryUrl: releaseConfig.repositoryUrl || packageData.repository.url.replace(/^git\+/, ''),
    },
  };
  const type = await analyzeCommits(pluginOptions('@semantic-release/commit-analyzer'), context);
  if (!type) return { type: null, notes: 'No release would be created from these commits.' };
  const version = lastRelease.version ? semver.inc(lastRelease.version, type) : '1.0.0';
  if (!version) throw new Error(`Cannot calculate a ${type} release from ${lastRelease.version}`);
  const nextRelease = {
    type, version, gitTag: `v${version}`, gitHead: git('rev-parse', 'HEAD'),
  };
  const notes = await generateNotes(
    pluginOptions('@semantic-release/release-notes-generator'),
    { ...context, nextRelease },
  );
  return { ...nextRelease, notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const release = await previewRelease();
  const summary = [
    '## Release preview',
    '',
    'Preview only: no credentials are checked, files changed, tags created, or releases published.',
    'Analyzes commits since the latest stable release reachable from the PR base, including unreleased base commits.',
    'Squash merging can change the result because the final PR title becomes the release commit message.',
    '',
    ...(release.version ? [`Proposed release: **${release.version}** (${release.type})`, ''] : []),
    release.notes,
    '',
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
