# Nexter
Next generation shell for Edge Delivery Services.

## About
Nexter provides a common set of styles, patterns, blocks, components, and libraries to accelerate building AEM Edge Delivery front-end applications. It's used heavily to build https://da.live.

## Run

### 1. Install NPM packages
```
npm install
```

### 2. Run Nexter locally
```
npm run local
```

### 3. Open Nexter consuming application
```
https://main--{NAME_OF_SITE}--{NAME_OF_ORG}.aem.live/apps/loc?nx=local
```
**Note:** `?nx=local` will tell the consuming application to load Nexter from your local environment.

## Release preview

Every PR, including fork PRs, previews the next release version and notes in the
`Semantic Release (Dry Run)` check's logs and job summary. The preview uses the
same commit analyzer and release-note generator as the actual release, with the
latest stable release tag reachable from the PR's base commit. Unreleased base
commits are included, so this previews a release of the combined history.
Squash merges may produce a different result because the PR title becomes the
commit message on `main`.

Run `npm run release-preview` locally after fetching upstream history and tags.
The base defaults to `origin/main`; set `RELEASE_BASE_REF` to select another base
commit. `npm run semantic-release-dry` is an alias for this credential-free preview.
Run its tests with `npm run test:release-preview`.

PR jobs have read-only repository permissions and do not receive release secrets.
The preview does not check publishing credentials or change files, tags, or releases.
The trusted release job on pushes to `main` still validates credentials, updates
release files, and publishes the GitHub release; nothing is published to npm.
