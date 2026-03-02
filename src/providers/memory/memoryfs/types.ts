// src/providers/memory/memoryfs/types.ts — MemoryFS provider types
import type { LLMProvider } from '../../llm/types.js';

/** The six memory types, matching memU's MemoryType literal. */
export const MEMORY_TYPES = [
  'profile',    // Stable user facts, preferences, traits
  'event',      // Specific happenings with time/place context
  'knowledge',  // Domain facts and learned information
  'behavior',   // Behavioral patterns and habits
  'skill',      // Comprehensive skill/procedure profiles
  'tool',       // Tool usage patterns with when_to_use hints
] as const;

export type MemoryType = typeof MEMORY_TYPES[number];

/** A single atomic memory item stored in SQLite. */
export interface MemoryFSItem {
  id: string;
  content: string;
  memoryType: MemoryType;
  category: string;               // slug matching .md filename (e.g. 'preferences')
  contentHash: string;            // sha256("{type}:{normalized}")[:16]
  source?: string;                // conversation ID or resource reference
  confidence: number;             // 0.0-1.0, set at extraction time
  reinforcementCount: number;     // incremented on dedup + retrieval
  lastReinforcedAt: string;       // ISO 8601
  createdAt: string;              // ISO 8601
  updatedAt: string;              // ISO 8601
  scope: string;                  // namespace, default 'default'
  agentId?: string;               // enterprise scoping
  userId?: string;                // multi-user scoping
  taint?: string;                 // JSON-serialized TaintTag
  extra?: string;                 // JSON for type-specific metadata
}

/** Short ref ID for [ref:ID] citations in summaries. */
export type RefId = string; // first 6 hex chars of content hash

/** Configuration for the MemoryFS provider. */
export interface MemoryFSConfig {
  memoryDir: string;              // root directory for .md files and _store.db
  enableItemReferences?: boolean; // default false -- opt-in [ref:ID] in summaries
  summaryTargetTokens?: number;   // default 400
  recencyDecayDays?: number;      // default 30 (half-life for salience scoring)
  defaultMemoryTypes?: MemoryType[]; // default ['profile', 'event']
  llmProvider?: LLMProvider;      // needed for LLM extraction + summary generation
  extractionModel?: string;       // model for extraction (cheapest available)
  summaryModel?: string;          // model for summary generation
}

/** Default categories matching memU's defaults. */
export const DEFAULT_CATEGORIES = [
  'personal_info',
  'preferences',
  'relationships',
  'activities',
  'goals',
  'experiences',
  'knowledge',
  'opinions',
  'habits',
  'work_life',
] as const;
