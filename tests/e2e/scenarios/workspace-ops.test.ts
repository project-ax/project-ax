/**
 * Scenario: Workspace write operations
 *
 * Tests the workspace_write and workspace_write_file IPC actions
 * across agent and user tiers. Read/list operations are handled
 * by local tools since tiers are mounted in the sandbox.
 *
 * Note: workspace_write returns { written: true, tier, path }
 *       The IPC server wraps all with { ok: true, ... }
 */

import { describe, test, expect, afterEach } from 'vitest';
import { TestHarness } from '../harness.js';
import { textTurn, toolUseTurn } from '../scripted-llm.js';

describe('E2E Scenario: Workspace Operations', () => {
  let harness: TestHarness;

  afterEach(() => {
    harness?.dispose();
  });

  test('workspace_write to agent tier creates file', async () => {
    harness = await TestHarness.create();

    const result = await harness.ipcCall('workspace_write', {
      tier: 'agent',
      path: 'notes.md',
      content: '# Agent Notes\n\nImportant findings.',
    });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);
    expect(result.tier).toBe('agent');
  });

  test('workspace_write to user tier', async () => {
    harness = await TestHarness.create();

    const result = await harness.ipcCall('workspace_write', {
      tier: 'user',
      path: 'preferences.md',
      content: '# User Preferences\n\nTheme: dark',
    });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);
  });

  test('workspace operations are audited', async () => {
    harness = await TestHarness.create();

    await harness.ipcCall('workspace_write', {
      tier: 'agent',
      path: 'audited.md',
      content: 'Audited content',
    });

    expect(harness.wasAudited('workspace_write')).toBe(true);
  });

  test('multi-turn: LLM writes to workspace via tool_use', async () => {
    harness = await TestHarness.create({
      llmTurns: [
        // Turn 1: LLM writes shared notes
        toolUseTurn('workspace_write', {
          tier: 'agent',
          path: 'research.md',
          content: '# Research Findings\n\n- Finding 1\n- Finding 2',
        }),
        // Turn 2: After tool result, LLM confirms
        textTurn('I\'ve saved my research findings to the agent workspace.'),
      ],
    });

    const result = await harness.runAgentLoop('Research the topic and save your notes.');

    expect(result.finalText).toContain('research findings');
    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0]!.name).toBe('workspace_write');
  });

  test('workspace_write to agent tier in paranoid mode is queued', async () => {
    harness = await TestHarness.create({ profile: 'paranoid' });

    const result = await harness.ipcCall('workspace_write', {
      tier: 'agent',
      path: 'notes.md',
      content: 'Should be queued',
    });

    expect(result.ok).toBe(true);
    expect(result.queued).toBe(true);
  });
});
