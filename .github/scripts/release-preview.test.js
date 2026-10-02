import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { previewRelease } from './release-preview.js';

const logger = { log() {} };

function repository(t, { tagged = true } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'da-nx-release-preview-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.email', 'preview@example.com');
  git('config', 'user.name', 'Release Preview');
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({
    name: 'preview-fixture',
    repository: { url: 'git+https://github.com/adobe/da-nx.git' },
  }));
  git('add', 'package.json');
  git('commit', '--quiet', '-m', 'chore: initialize');
  if (tagged) git('tag', 'v1.7.1');
  const baseRef = git('rev-parse', 'HEAD');
  git('switch', '--quiet', '-c', 'fork-only-branch');
  const commit = (message) => git('commit', '--quiet', '--allow-empty', '-m', message);
  return { cwd, baseRef, git, commit };
}

[
  { message: 'fix(form): remove double scrollbar', type: 'patch', version: '1.7.2' },
  { message: 'feat(form): add a field', type: 'minor', version: '1.8.0' },
  {
    message: 'feat(form): replace API\n\nBREAKING CHANGE: remove the old API',
    type: 'major',
    version: '2.0.0',
  },
  { message: 'docs: clarify setup', type: null, version: undefined },
].forEach(({ message, type, version }) => {
  test(`previews ${type || 'no release'} from a detached fork checkout`, async (t) => {
    const fixture = repository(t);
    fixture.commit(message);
    fixture.git('checkout', '--quiet', '--detach');
    const refs = fixture.git('show-ref');
    const status = fixture.git('status', '--porcelain');
    const result = await previewRelease({ ...fixture, logger });
    assert.equal(result.type, type);
    assert.equal(result.version, version);
    assert.equal(fixture.git('show-ref'), refs);
    assert.equal(fixture.git('status', '--porcelain'), status);
    if (version) {
      assert.ok(result.notes.includes(version));
      assert.ok(result.notes.includes('https://github.com/adobe/da-nx'));
    } else {
      assert.equal(result.notes, 'No release would be created from these commits.');
    }
  });
});

test('selects the latest stable base tag, not prerelease or PR-only tags', async (t) => {
  const fixture = repository(t);
  fixture.git('tag', 'v1.6.0');
  fixture.git('tag', 'v2.0.0-beta.1');
  fixture.commit('fix: update form');
  fixture.git('tag', 'v9.0.0');
  const result = await previewRelease({ ...fixture, logger });
  assert.equal(result.version, '1.7.2');
});

test('includes unreleased base commits and preserves multiline commit messages', async (t) => {
  const fixture = repository(t);
  fixture.commit('feat: add a field\n\nCloses #804');
  const baseRef = fixture.git('rev-parse', 'HEAD');
  fixture.commit('fix: remove scrollbar');
  const result = await previewRelease({ ...fixture, baseRef, logger });
  assert.equal(result.version, '1.8.0');
  assert.ok(result.notes.includes('add a field'));
  assert.ok(result.notes.includes('remove scrollbar'));
  assert.ok(result.notes.includes('/issues/804'));
});

test('previews the initial release when there is no stable release tag', async (t) => {
  const fixture = repository(t, { tagged: false });
  fixture.commit('fix: update form');
  const result = await previewRelease({ ...fixture, logger });
  assert.equal(result.version, '1.0.0');
});

test('reports no release for an empty range', async (t) => {
  const fixture = repository(t);
  const result = await previewRelease({ ...fixture, logger });
  assert.equal(result.type, null);
});

test('does not release when a fix is reverted', async (t) => {
  const fixture = repository(t);
  fixture.commit('fix: update form');
  const hash = fixture.git('rev-parse', 'HEAD');
  fixture.commit(`revert: fix: update form\n\nThis reverts commit ${hash}.`);
  const result = await previewRelease({ ...fixture, logger });
  assert.equal(result.type, null);
});

test('fails explicitly for an unavailable base', async (t) => {
  const fixture = repository(t);
  await assert.rejects(
    previewRelease({ ...fixture, baseRef: 'missing-base', logger }),
    /Command failed/,
  );
});

test('fails explicitly if the checkout does not include the base commit', async (t) => {
  const fixture = repository(t);
  fixture.commit('feat: update base');
  const baseRef = fixture.git('rev-parse', 'HEAD');
  fixture.git('checkout', '--quiet', '--detach', fixture.baseRef);
  fixture.commit('fix: update form');
  await assert.rejects(previewRelease({ ...fixture, baseRef, logger }), /Command failed/);
});

test('CLI works in fork CI without a remote or tokens and writes the job summary', (t) => {
  const fixture = repository(t);
  fixture.commit('fix(form): remove double scrollbar');
  fixture.git('checkout', '--quiet', '--detach');
  const summaryPath = join(fixture.cwd, 'summary.md');
  const scriptPath = fileURLToPath(new URL('./release-preview.js', import.meta.url));
  const output = execFileSync(process.execPath, [scriptPath], {
    cwd: fixture.cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      GITHUB_REF: 'refs/pull/804/merge',
      GITHUB_HEAD_REF: 'fork-only-branch',
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
      RELEASE_BASE_REF: fixture.baseRef,
      GITHUB_STEP_SUMMARY: summaryPath,
    },
  });
  const summary = readFileSync(summaryPath, 'utf8');
  assert.ok(output.includes('Proposed release: **1.7.2** (patch)'));
  assert.ok(summary.includes('Proposed release: **1.7.2** (patch)'));
  assert.ok(summary.includes('remove double scrollbar'));
  assert.equal(fixture.git('tag', '--list'), 'v1.7.1');
});
