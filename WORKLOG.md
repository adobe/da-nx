# Worklog

## 2026-10-01

MSM's public boundary is deliberately limited to direct `mergeCopy` at
`nx/public/plugins/rollout/utils.js`. Private state is reused per fetch/origin.
SDK unchanged; AEM Apps remains DA-only until a proper HLX6 SDK exists.
Deploy the NX entrypoint before merging the AEM Apps migration.
Other private AEM Apps dependencies are documented, not migrated.
Diff algorithm restored to its original file; explicit config avoids legacy
IMS imports. Shared copy extraction remains necessary for the public boundary.
Legacy loc utils unchanged; copy operations use the shared config loader.
