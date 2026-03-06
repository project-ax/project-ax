# Acceptance Test Results: Cortex Infrastructure Fixes Verification (K8s)

**Date run:** 2026-03-06 17:09
**Server version:** e199f8e
**LLM provider:** OpenRouter (google/gemini-3-flash-preview)
**Embedding provider:** DeepInfra (Qwen/Qwen3-Embedding-0.6B, 1024 dims)
**Environment:** K8s/kind (subprocess sandbox, NATS eventbus, PostgreSQL storage)
**PostgreSQL username:** ax (custom -- testing FIX-11)
**Namespace:** ax-test-cortex-fixes-d8fc6294

## Infrastructure Fix Verification

| Fix | Description | Result | Evidence |
|-----|-------------|--------|----------|
| FIX-10 | pgvector auto-enabled by Helm hook | PASS | `vector 0.8.2` extension present, owned by `postgres` superuser |
| FIX-11 | Custom user/database created | PASS | User `ax` exists with LOGIN + CREATEDB, owns all 20 tables, host pod Running |
| FIX-12 | Advisory lock prevents duplicate backfill | PASS | Host: `backfill_start`/`backfill_done` (3 items); Agent-runtime: `backfill_skipped` (advisory lock) |

## Behavioral Test Results

| Test | Result | Notes |
|------|--------|-------|
| BT-8 | PASS | 2 items stored with embeddings on write |
| IT-7 | PASS | Semantic recall returned AWS ECS/Fargate from memory; "2+2" returned "4" (no recall) |
| IT-8 | PASS | Backfill ran on restart, 3 test items embedded, all 7 items have embeddings |

## Detailed Results

### FIX-10: pgvector auto-enabled by Helm hook

The `postgresql-init-job.yaml` Helm hook (post-install, hook-weight=1) ran successfully after
`helm install`. The job was cleaned up by `hook-delete-policy: hook-succeeded,before-hook-creation`
(no job resource visible after completion, which is expected).

Evidence:
```
SELECT extname, extversion, extowner::regrole FROM pg_extension;
 extname | extversion | extowner
---------+------------+----------
 plpgsql | 1.0        | postgres
 vector  | 0.8.2      | postgres
```

The `vector` extension is owned by `postgres` (superuser), confirming it was created by the init job
rather than by the application (which connects as `ax`).

### FIX-11: Custom user/database created

Deployed with `postgresql.internal.auth.username=ax` (non-postgres) plus the Bitnami subchart
settings `postgresql.auth.username=ax` and `postgresql.auth.password=ax-test-password`.

**Key finding:** The Bitnami subchart creates the user and generates the `password` key in the
secret ONLY when `postgresql.auth.username` and `postgresql.auth.password` are explicitly set at
the subchart level (not just at `postgresql.internal.auth.username`). The AX chart's
`_helpers.tpl:ax.databaseEnv` looks for the `password` key when username != postgres, so both
settings are required.

Evidence:
```
-- User exists with correct privileges
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname = 'ax';
 rolname | rolsuper | rolcreatedb | rolcreaterole | rolcanlogin
---------+----------+-------------+---------------+-------------
 ax      | f        | t           | f             | t

-- All 20 tables owned by 'ax'
SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'ax';
 count = 20

-- Secret has both keys
kubectl get secret ...-postgresql -o jsonpath='{.data}':
  password: YXgtdGVzdC1wYXNzd29yZA== (ax-test-password)
  postgres-password: aUh3ZGNZWHhINw==

-- Host pod status: Running (not CrashLoopBackOff)
```

**Note on first deployment attempt:** Without `postgresql.auth.password` at the subchart level,
the Bitnami chart only creates the `postgres-password` key. The host pod fails with
`CreateContainerConfigError: couldn't find key password in Secret`. This confirms both the
`postgresql.internal.auth.*` (AX templates) AND `postgresql.auth.*` (Bitnami subchart) settings
are needed. The `ax k8s init` CLI should set both when a custom username is configured.

### FIX-12: Advisory lock prevents duplicate backfill

Inserted 3 test items without embeddings, then deleted both host and agent-runtime pods
simultaneously to trigger concurrent backfill attempts.

Evidence (from pod logs):
```
# Host pod (acquired the lock, did the work):
{"component":"cortex","count":3,"scope":"default","msg":"backfill_start"}
{"component":"cortex","count":3,"scope":"default","msg":"backfill_done"}

# Agent-runtime pod (lock already held, skipped):
{"component":"cortex","reason":"another process holds the advisory lock","msg":"backfill_skipped"}
```

After backfill, all 7 items have embeddings (was 4 before, 3 backfilled):
```
SELECT (SELECT count(*) FROM items) as items, (SELECT count(*) FROM embedding_meta) as embeddings;
 items | embeddings
-------+------------
     7 |          7
```

### BT-8: Embedding generated on write and queryable

Sent: "Remember that the project uses PostgreSQL for the main database"
Response: "OK. I have noted that the project uses PostgreSQL for the main database."

DB state after:
- 2 items stored (one in `default` scope, one in `project_details` scope)
- Both have embeddings in `embedding_meta` table

### IT-7: Write -> embed -> semantic recall across sessions

Session A (it7v2a):
1. "Remember that our backend is written in Rust with Actix-web framework" -- stored
2. "Remember that we deploy to AWS ECS with Fargate for container orchestration" -- stored

After Session A: 4 items, 4 embeddings (all consistent).

Session B (it7v2b):
- Query: "How should I set up the deployment pipeline?"
- Response: "Set up the deployment pipeline to target AWS ECS using Fargate. The process should
  include: 1. CI/CD Tool: Use AWS CodePipeline or GitHub Actions. 2. Build: Create a Docker
  image of the application. 3. Registry: Push the image to Amazon ECR. 4. Deployment: Update
  the ECS service to use the new image. 5. Database: Ensure the pipeline has the necessary
  credentials to run migrations against the PostgreSQL database during the deployment phase."
- PASS: References AWS ECS, Fargate, AND PostgreSQL -- all recalled from memory.

Session C (it7v2c):
- Query: "What is 2 + 2?"
- Response: "4"
- PASS: No memory recall for unrelated question.

### IT-8: Embedding backfill

After BT-8 and IT-7 stored 4 items (all with embeddings), 3 test items were inserted directly
into the `items` table without embeddings. On pod restart, the cortex provider's background
backfill ran and embedded all 3 items, bringing the total to 7/7.

The backfill coordination via PostgreSQL advisory lock (FIX-12) ensured only one process
(the host) did the actual embedding work, while the agent-runtime skipped.

## Issues Found

### IMPORTANT: `ax k8s init` does not set Bitnami subchart auth values

The `ax k8s init` CLI generates `postgresql.internal.auth.username` but does NOT set
`postgresql.auth.username` or `postgresql.auth.password` at the Bitnami subchart level.
This means deploying with a custom username via `ax k8s init` alone will fail with
`CreateContainerConfigError` unless the user manually adds `--set postgresql.auth.username=...
--set postgresql.auth.password=...` to the helm install command.

**Recommended fix:** The `ax k8s init` output should include the Bitnami subchart values
(`postgresql.auth.username`, `postgresql.auth.password`) alongside the AX-level
`postgresql.internal.auth.username` whenever a non-postgres username is configured.

### pg-init hook may race with application pods

The pg-init job uses `post-install` hook timing, which means it runs AFTER all main resources
are created. If PostgreSQL takes a while to start, the host pod may try to connect before
the pg-init job creates the custom user. In practice this is mitigated by:
1. The Bitnami subchart creating the user (when auth values are properly set)
2. The host pod's CrashLoopBackOff retry eventually succeeding after pg-init completes

However, a `pre-install` or init-container approach would be more robust.
