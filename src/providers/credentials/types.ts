// src/providers/credentials/types.ts — Credential provider types

export interface CredentialProvider {
  get(service: string): Promise<string | null>;
  set(service: string, value: string): Promise<void>;
  delete(service: string): Promise<void>;
  list(): Promise<string[]>;
}
