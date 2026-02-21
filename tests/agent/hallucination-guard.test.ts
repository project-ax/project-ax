import { describe, test, expect } from 'vitest';
import { detectSchedulerHallucination } from '../../src/agent/hallucination-guard.js';

describe('detectSchedulerHallucination', () => {
  test('returns false when no scheduling language in text', () => {
    expect(detectSchedulerHallucination('Hello, how can I help?', [])).toBe(false);
  });

  test('returns false when scheduler tool was actually called', () => {
    const text = 'I\'ve scheduled a task for you at 3pm.';
    expect(detectSchedulerHallucination(text, ['scheduler_run_at'])).toBe(false);
  });

  test('detects "scheduled a task" with no tool call', () => {
    const text = 'I\'ve scheduled a task for you. It will run at 3pm.';
    expect(detectSchedulerHallucination(text, [])).toBe(true);
  });

  test('detects "set up a reminder" with no tool call', () => {
    const text = 'I\'ve set up a reminder for tomorrow morning.';
    expect(detectSchedulerHallucination(text, [])).toBe(true);
  });

  test('detects fake job ID pattern with no tool call', () => {
    const text = 'Done! Job ID: c7a5db0b-1234-5678-abcd-ef0123456789';
    expect(detectSchedulerHallucination(text, [])).toBe(true);
  });

  test('detects literal scheduler_run_at in text but not called', () => {
    const text = 'I called scheduler_run_at to set up your task.';
    expect(detectSchedulerHallucination(text, [])).toBe(true);
  });

  test('returns false for unrelated text with unrelated tool calls', () => {
    const text = 'I read the file for you. Here are the contents.';
    expect(detectSchedulerHallucination(text, ['read_file', 'write_file'])).toBe(false);
  });

  test('detects scheduling text when only non-scheduler tools called', () => {
    const text = 'I\'ve scheduled a job for you at 5pm.';
    expect(detectSchedulerHallucination(text, ['read_file', 'memory_read'])).toBe(true);
  });

  test('detects "schedule a task" variation', () => {
    const text = 'Let me schedule a task to remind you later.';
    expect(detectSchedulerHallucination(text, [])).toBe(true);
  });

  test('returns false when scheduler_add_cron was called', () => {
    const text = 'I\'ve scheduled a job using scheduler_add_cron.';
    expect(detectSchedulerHallucination(text, ['scheduler_add_cron'])).toBe(false);
  });
});
