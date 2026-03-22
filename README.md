# Nexter
Next generation shell for Edge Delivery Services.

## About
Nexter provides a common set of styles, patterns, blocks, components, and libraries to accelerate building AEM Edge Delivery applications. It's used heavily by https://da.live.

### AGENTS.md
The project's design decisions, conventions, and gotchas that aren't obvious from reading the code. Written for AI agents, but arguably **_more useful for humans_** onboarding to the project.

### WORKLOG.md
A living diary for context. Every session logs what was investigated, what changed, what was decided, and why.

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
