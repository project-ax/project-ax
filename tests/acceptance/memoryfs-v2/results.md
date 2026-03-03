# Acceptance Test Results: MemoryFS v2

**Date run:** 2026-03-03 14:35
**Server version:** 86f484e
**LLM provider:** OpenRouter (via Anthropic Claude)
**Embedding provider:** None (OPENAI_API_KEY not set)

## Summary

| Test | Category | Result | Notes |
|------|----------|--------|-------|
| ST-1 | Structural | PASS | 6 types in const tuple, MemoryType derived correctly |
| ST-2 | Structural | PASS | All 15 fields present with correct types |
| ST-3 | Structural | PASS | All 10 default categories match memU |
| ST-4 | Structural | PASS | SQL schema matches, all 4 indexes created |
| ST-5 | Structural | PASS | sha256 with type prefix, normalize+lowercase, slice(0,16) |
| ST-6 | Structural | PASS | Salience formula matches memU spec exactly |
| ST-7 | Structural | PASS | All paths use safePath, no raw path.join |
| ST-8 | Structural | PASS | Atomic writes via temp+UUID+rename |
| ST-9 | Structural | PASS | memoryfs registered in static PROVIDER_MAP |
| ST-10 | Structural | PASS | create() factory returns all 6 MemoryProvider methods |
| ST-11 | Structural | PASS | No extractByRegex, LLM-only, errors propagate |
| ST-12 | Structural | PASS | All 4 prompt functions exported, memU format |
| ST-13 | Structural | PASS | All 6 types mapped to valid categories |
| ST-14 | Structural | PASS | write() deduplicates via computeContentHash → findByHash |
| ST-15 | Structural | PASS | 4-step pipeline: extract → dedup → summaries → embed |
| ST-16 | Structural | PASS | embedItem() called fire-and-forget after insert |
| ST-17 | Structural | PASS | Batch embed in memorize(), non-blocking IIFE |
| ST-18 | Structural | PASS | 3-table schema, scoped L2, unscoped vec0 MATCH |
| ST-19 | Structural | PASS | query() has embedding branch with 1/(1+distance) |
| ST-20 | Structural | PASS | MemoryQuery.embedding?: Float32Array exists |
| ST-21 | Structural | PASS | recallMemoryForMessage() with 2-strategy approach |
| ST-22 | Structural | PASS | Configurable: enabled, limit, scope with defaults |
| ST-23 | Structural | PASS | backfillEmbeddings() non-blocking in create() |
| ST-24 | Structural | PASS | memorize() called after every completion in server-completions |
| ST-16-old | Structural | PASS | Results sorted by salienceScore descending |
| ST-17-old | Structural | PASS | Taint JSON.stringify on write, JSON.parse on read/query/list |
| ST-18-old | Structural | PASS | All imports resolve to existing modules, zero new deps |
| BT-1 | Behavioral | PASS | Agent acknowledged, item stored, summary updated |
| BT-2 | Behavioral | FAIL | LLM produces different phrasings → hash dedup fails → 3 items instead of 1 |
| BT-3 | Behavioral | PASS | Scope isolation verified: no cross-scope leakage |
| BT-4 | Behavioral | PASS | Summary .md file created with memU format |
| BT-5 | Behavioral | PASS | write→read→delete round-trip works correctly |
| BT-6 | Behavioral | PASS | Taint tags preserved through write/read/query/list |
| BT-7 | Behavioral | PASS | memorize() throws when LLM unavailable, no items stored |
| BT-8 | Behavioral | SKIP | Requires OPENAI_API_KEY for embeddings |
| BT-9 | Behavioral | SKIP | Requires OPENAI_API_KEY for embeddings + memory recall |
| IT-1 | Integration | PARTIAL FAIL | Pipeline works but dedup fails (8 items, 4 dark-mode variants) |
| IT-2 | Integration | PASS | Multi-scope + agentId isolation verified |
| IT-3 | Integration | PASS | Content hash dedup works for identical content (whitespace/case normalized) |
| IT-4 | Integration | PARTIAL FAIL | 10 files + 2 DBs exist, but LLM wraps summaries in ```markdown fences |
| IT-5 | Integration | PASS | Salience ranking: fresh > reinforced-old > stale |
| IT-6 | Integration | PASS | All CRUD works without embedding support |
| IT-7 | Integration | SKIP | Requires OPENAI_API_KEY for cross-session semantic recall |
| IT-8 | Integration | SKIP | Requires OPENAI_API_KEY for embedding backfill |

**Overall: 30/37 evaluated, 27 PASS, 2 FAIL, 1 PARTIAL FAIL x2, 4 SKIP**

## Detailed Results

### Failures

#### BT-2: Deduplication on repeated facts
**Result:** FAIL
**Evidence:**
After sending "Remember that I use TypeScript for all my projects" twice:
- Expected: 1 item with reinforcement_count > 1
- Actual: 3 items, each with reinforcement_count=1:
  - `Uses TypeScript for all projects` (memorize extraction #1)
  - `User uses TypeScript for all projects. Apply this context...` (explicit write, reinforcement=10)
  - `The user uses TypeScript for all of their projects.` (memorize extraction #2)
**Root cause:** Content-hash dedup only catches exact (normalized) duplicates. The LLM produces different phrasings each time, so different hashes are generated. The dedup mechanism works correctly at the API level (IT-3 confirms identical content is deduplicated), but the LLM extraction layer defeats it by rephrasing.

#### IT-1: Full memorize → query → reinforcement lifecycle
**Result:** PARTIAL FAIL
**Evidence:**
- Pipeline works: extract → store → summary all succeed
- Dedup fails: 8 items in default scope, 4 variants of "dark mode" preference
- All content hashes are different because LLM rephrases:
  - `ff20b674283101c9` → "Prefers using dark mode in all editors."
  - `ce5b1ff5afd0ae54` → "Prefers dark mode in all code and text editors"
  - `9f27c851ddf86ab4` → "Prefers dark mode in all editors."
  - `57dac455b60e6dad` → "Prefers dark mode in all text and code editors."
- Summary files are correctly maintained despite dedup failure

#### IT-4: Default category initialization
**Result:** PARTIAL FAIL
**Evidence:**
- All 10 .md files created: PASS
- Both _store.db and _vec.db exist: PASS
- 6 files start with `# category_name` (correct memU format): PASS
- 4 files start with ` ```markdown ` code fence (corrupted): FAIL
  - Affected: habits.md, knowledge.md, preferences.md, work_life.md
  - These are files updated by the LLM summary generator
- The LLM wraps its output in markdown code blocks, corrupting the expected memU format
- The `updateCategorySummary` function does not strip code fences from LLM output

### Plan Deviations Observed

#### DEV-1: Read-path reinforcement
**Plan says:** "Reinforce accessed items → return" in query
**Actual:** `query()` is read-only — does NOT reinforce accessed items
**Impact:** Minor — frequently accessed items don't get a salience boost from reads

#### DEV-2: Write reinforcement count
**Plan says:** `reinforcementCount: 1` for explicit writes
**Actual:** `write()` uses `reinforcementCount: 10` for explicit writes
**Impact:** Explicit writes are 3.4x more salient than memorize-extracted items (log(11) vs log(2))

#### DEV-3: Summary search in read path
**Plan says:** "query → Search summaries (grep .md files) → sufficient? → Search items"
**Actual:** `query()` goes straight to SQLite (keyword search) or embedding search. Summary files are never searched.
**Impact:** Summary files are effectively write-only from the provider's perspective
