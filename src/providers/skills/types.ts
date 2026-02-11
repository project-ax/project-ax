// src/providers/skills/types.ts — Skills provider types

export interface SkillMeta {
  name: string;
  description?: string;
  path: string;
}

export interface SkillProposal {
  skill: string;
  content: string;
  reason?: string;
}

export interface ProposalResult {
  id: string;
  verdict: 'AUTO_APPROVE' | 'NEEDS_REVIEW' | 'REJECT';
  reason: string;
}

export interface LogOptions {
  limit?: number;
  since?: Date;
}

export interface SkillLogEntry {
  id: string;
  skill: string;
  action: 'propose' | 'approve' | 'reject' | 'revert';
  timestamp: Date;
  reason?: string;
}

export interface SkillStoreProvider {
  list(): Promise<SkillMeta[]>;
  read(name: string): Promise<string>;
  propose(proposal: SkillProposal): Promise<ProposalResult>;
  approve(proposalId: string): Promise<void>;
  reject(proposalId: string): Promise<void>;
  revert(commitId: string): Promise<void>;
  log(opts?: LogOptions): Promise<SkillLogEntry[]>;
}

export interface ScreeningVerdict {
  allowed: boolean;
  reasons: string[];
}

export interface SkillScreenerProvider {
  screen(content: string, declaredPermissions?: string[]): Promise<ScreeningVerdict>;
}
