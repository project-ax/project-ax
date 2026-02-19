// src/providers/sandbox/types.ts — Sandbox provider types

export interface SandboxConfig {
  workspace: string;
  skills: string;
  ipcSocket: string;
  agentDir?: string;
  timeoutSec?: number;
  memoryMB?: number;
  command: string[];
}

export interface SandboxProcess {
  pid: number;
  exitCode: Promise<number>;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  stdin: NodeJS.WritableStream;
  kill(): void;
}

export interface SandboxProvider {
  spawn(config: SandboxConfig): Promise<SandboxProcess>;
  kill(pid: number): Promise<void>;
  isAvailable(): Promise<boolean>;
}
