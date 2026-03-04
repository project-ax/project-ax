# Config: Dependencies

Package management, lock file maintenance, npm/CI sync issues.

## [2026-03-04 03:30] — Fix npm ci failure: override unpublished sqlite-vec-linux-arm64

**Task:** Fix recurring CI failure: `npm ci` fails with "Missing: sqlite-vec-linux-arm64@ from lock file"
**What I did:** `sqlite-vec-linux-arm64@0.1.6` was never published to npm (only 0.1.7-alpha.x exists), but `sqlite-vec@0.1.6` declares it as an optional dependency. npm 11.x (Node 24, used in CI) requires all declared optional dependencies to have complete lock file entries, even for non-matching platforms. Fix: (1) added npm override in package.json mapping `sqlite-vec-linux-arm64` to `0.1.7-alpha.2` (the closest available version), (2) added a complete lock file entry with real resolved URL and integrity hash. The package is platform-gated (linux+arm64) so it won't install on CI's x64 runners.
**Files touched:** package.json (modified — added override), package-lock.json (modified — added proper entry, removed broken stub)
**Outcome:** Success — `npm ci` passes locally, all 2298 tests pass
**Notes:** First attempt (just removing the stub) worked on npm 10.x but not npm 11.x. npm 11.x cross-references sqlite-vec's optionalDependencies against lock file entries even for non-matching platforms. The override + complete entry approach satisfies both npm versions.
