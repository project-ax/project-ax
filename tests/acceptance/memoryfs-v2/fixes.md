# Fix List: MemoryFS v2

**Generated from:** acceptance test results (2026-03-03)
**Total issues:** 5 (Critical: 0, Major: 3, Minor: 2)

## Major

### FIX-1: LLM summary output wrapped in markdown code fences
**Test:** IT-4
**Root cause:** Incorrect — LLM output not post-processed
**Location:** `src/providers/memory/memoryfs/provider.ts:updateCategorySummary` (lines 94-109) and `src/providers/memory/memoryfs/prompts.ts:buildSummaryPrompt`
**What's wrong:** The LLM returns summary content wrapped in ` ```markdown ... ``` ` code fences. The code passes the raw LLM output directly to `writeSummary()` without stripping fences. This corrupts the memU format (files should start with `# category_name`, not a code fence).
**What to fix:** Either:
1. Strip code fences from LLM output before writing (regex: remove leading ` ```markdown\n ` and trailing ` ``` `)
2. OR update the prompt to explicitly instruct "Do NOT wrap output in code fences"
3. Ideally both — belt and suspenders
**Estimated scope:** 1-2 files (prompts.ts + provider.ts or a shared helper)

### FIX-2: LLM extraction produces different phrasings defeating content-hash dedup
**Test:** BT-2, IT-1
**Root cause:** Design flaw — content-hash dedup assumes identical text, but LLM extraction rephrases
**Location:** `src/providers/memory/memoryfs/extractor.ts:extractByLLM` and `src/providers/memory/memoryfs/provider.ts:memorize`
**What's wrong:** The LLM extractor produces semantically identical but textually different items for the same fact across conversations (e.g., "Prefers dark mode in all editors" vs "Prefers dark mode in all code and text editors"). Since content-hash dedup normalizes only whitespace and case, these produce different hashes and create duplicate rows.
**What to fix:** Options (in order of complexity):
1. **Prompt engineering:** Update the extraction prompt to produce canonical, minimal phrasings (e.g., "output facts as short, canonical statements using the simplest possible wording")
2. **Embedding-based dedup:** Before inserting, embed the candidate and check if any existing item in the same category has cosine similarity > 0.95. Requires OPENAI_API_KEY.
3. **Fuzzy hash:** Use a locality-sensitive hash or n-gram similarity before insertion
Option 1 is the cheapest fix and should be tried first.
**Estimated scope:** 1 file (extractor.ts prompt changes) for option 1; 2-3 files for option 2

### FIX-3: Slack App log level causes debug spam in ax.log
**Test:** N/A (discovered during test setup)
**Root cause:** Incorrect — App logLevel set to DEBUG
**Location:** `src/providers/channel/slack.ts:123` and `src/providers/channel/slack.ts:103`
**What's wrong:** The Slack Bolt `App` was created with `logLevel: LogLevel.DEBUG` and `boltLogger.getLevel()` returned `LogLevel.DEBUG`. This caused the SDK's internal socket-mode heartbeat ("isActive(): websocket ready state is OPEN") to emit every few seconds, flooding ax.log and making it impossible to monitor actual server activity.
**What to fix:** Already fixed during this test run — changed both to `LogLevel.INFO`. Needs commit.
**Estimated scope:** 1 file (already done)

## Minor

### FIX-4: query() does not reinforce accessed items (plan deviation)
**Test:** ST-16-old (DEV-1)
**Root cause:** Incomplete — plan specifies read-path reinforcement but implementation omits it
**Location:** `src/providers/memory/memoryfs/provider.ts:query()` (lines 177-253)
**What's wrong:** The plan's data flow specifies "Reinforce accessed items → return" in the read path. The implementation does not call `store.reinforce()` on items returned by query. This means frequently-accessed memories don't get a salience boost from reads, only from writes/memorize.
**What to fix:** After ranking and slicing results, add: `for (const { item } of ranked) store.reinforce(item.id);`
**Estimated scope:** 1 file

### FIX-5: Explicit write() uses reinforcement_count=10 instead of plan's 1
**Test:** IT-3 (DEV-2)
**Root cause:** Incorrect — hardcoded value differs from plan
**Location:** `src/providers/memory/memoryfs/provider.ts:write()` (around line 155)
**What's wrong:** The plan specifies `reinforcementCount: 1` for new items via `write()`. The implementation uses `reinforcementCount: 10`, making explicit writes 3.4x more salient than memorize-extracted items.
**What to fix:** This may be intentional (explicit "remember this" should be more salient than auto-extracted facts). If so, document the deviation. If not, change to 1.
**Estimated scope:** 1 file (or just documentation)

## Suggested Fix Order

1. **FIX-3** — Already done, just needs commit. Unblocks log monitoring.
2. **FIX-1** — Summary code fence stripping. Quick fix, high visibility (corrupts on-disk files).
3. **FIX-2** — LLM dedup phrasing. Most impactful user-facing bug. Start with prompt engineering.
4. **FIX-4** — Read-path reinforcement. Simple addition, improves salience accuracy.
5. **FIX-5** — Document or adjust write() reinforcement count.

## Not Tested (Requires OPENAI_API_KEY)

The following tests were skipped and should be run when an OpenAI API key is available:
- BT-8: Embedding generated on write and queryable via semantic search
- BT-9: Long-term memory recall injects context into conversation
- IT-7: Write → embed → semantic recall across sessions
- IT-8: Embedding backfill covers items created before embeddings were available
