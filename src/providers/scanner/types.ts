// src/providers/scanner/types.ts — Scanner provider types
import type { TaintTag } from '../../types.js';

export interface ScanTarget {
  content: string;
  source: string;
  taint?: TaintTag;
  sessionId: string;
}

export interface ScanResult {
  verdict: 'PASS' | 'FLAG' | 'BLOCK';
  reason?: string;
  patterns?: string[];
}

export interface ScannerProvider {
  scanInput(msg: ScanTarget): Promise<ScanResult>;
  scanOutput(msg: ScanTarget): Promise<ScanResult>;
  canaryToken(): string;
  checkCanary(output: string, token: string): boolean;
}
