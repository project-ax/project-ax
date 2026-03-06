## [2026-03-06 00:00] — Helm Chart Deployment Improvements (5 fixes)

**Task:** Fix 5 deployment issues found during kind cluster deployment
**What I did:**
1. Added `global.imageTag` fallback in `ax.image` helper — single override for all components
2. Added `{{- if ne .Values.poolController.enabled false }}` guards to all 5 pool-controller templates
3. Fixed DATABASE_URL for internal PostgreSQL — construct from PGPASSWORD + inline string instead of requiring external secret
4. Made API credential secretKeyRefs optional (`optional: true`) to prevent CreateContainerConfigError
5. Updated kind-values.yaml to use `global.imageTag: test` instead of per-component overrides
**Files touched:** `_helpers.tpl`, `values.yaml`, 5 pool-controller templates, host/deployment.yaml, agent-runtime/deployment.yaml, kind-values.yaml
**Outcome:** Success — helm template verified for both kind-values (internal PG, pool-controller disabled) and defaults (external PG, pool-controller enabled)
**Notes:** Helm `default` function treats `false` as empty, so `default true false` returns `true`. Used `ne .Values.poolController.enabled false` pattern instead.
