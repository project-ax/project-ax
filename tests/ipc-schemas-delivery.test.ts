import { describe, test, expect, expectTypeOf } from 'vitest';
import { SchedulerAddCronSchema } from '../src/ipc-schemas.js';
import type { CronDelivery } from '../src/providers/scheduler/types.js';
import type { z } from 'zod';

/**
 * Tests for the `delivery` field on SchedulerAddCronSchema.
 *
 * The delivery field is optional and controls where a cron job's output is
 * routed (channel DM, thread, etc.) or explicitly silenced (mode: 'none').
 */
describe('SchedulerAddCronSchema — delivery field', () => {
  /** Minimal valid payload without delivery (the pre-existing shape). */
  const base = {
    action: 'scheduler_add_cron' as const,
    schedule: '*/5 * * * *',
    prompt: 'check system health',
  };

  // ── 1. Backward compatibility ────────────────────────────
  test('accepts payload WITHOUT delivery (backward compat)', () => {
    const result = SchedulerAddCronSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delivery).toBeUndefined();
    }
  });

  // ── 2. mode: 'none' ─────────────────────────────────────
  test('accepts delivery with mode: "none"', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: { mode: 'none' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delivery!.mode).toBe('none');
      expect(result.data.delivery!.target).toBeUndefined();
    }
  });

  // ── 3. mode: 'channel', target: 'last' ──────────────────
  test('accepts delivery with mode: "channel", target: "last"', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: { mode: 'channel', target: 'last' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delivery!.mode).toBe('channel');
      expect(result.data.delivery!.target).toBe('last');
    }
  });

  // ── 4. mode: 'channel', target: SessionAddress ──────────
  test('accepts delivery with mode: "channel" and a SessionAddress target', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: {
        mode: 'channel',
        target: {
          provider: 'slack',
          scope: 'channel',
          identifiers: {
            workspace: 'T01234',
            channel: 'C56789',
          },
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const target = result.data.delivery!.target as {
        provider: string;
        scope: string;
        identifiers: Record<string, string | undefined>;
      };
      expect(target.provider).toBe('slack');
      expect(target.scope).toBe('channel');
      expect(target.identifiers.workspace).toBe('T01234');
      expect(target.identifiers.channel).toBe('C56789');
    }
  });

  test('accepts SessionAddress target with all identifiers populated', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: {
        mode: 'channel',
        target: {
          provider: 'slack',
          scope: 'thread',
          identifiers: {
            workspace: 'T01234',
            channel: 'C56789',
            thread: 'ts1234567890.123456',
            peer: 'U99999',
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  test('accepts SessionAddress target with empty identifiers', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: {
        mode: 'channel',
        target: {
          provider: 'discord',
          scope: 'dm',
          identifiers: {},
        },
      },
    });
    expect(result.success).toBe(true);
  });

  // ── 5. Invalid mode ─────────────────────────────────────
  test('rejects delivery with invalid mode', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: { mode: 'email' },
    });
    expect(result.success).toBe(false);
  });

  test('rejects delivery with missing mode', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: { target: 'last' },
    });
    expect(result.success).toBe(false);
  });

  // ── 6. mode: 'channel', no target ───────────────────────
  test('accepts delivery with mode: "channel" and no target', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: { mode: 'channel' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delivery!.mode).toBe('channel');
      expect(result.data.delivery!.target).toBeUndefined();
    }
  });

  // ── 7. CronDelivery type alignment ──────────────────────
  test('CronDelivery type is assignable from parsed delivery', () => {
    // Infer the delivery field type from the schema
    type Parsed = z.infer<typeof SchedulerAddCronSchema>;
    type ParsedDelivery = NonNullable<Parsed['delivery']>;

    // The parsed delivery should be assignable to CronDelivery.
    // This is a compile-time check — if the types diverge the build fails.
    expectTypeOf<ParsedDelivery>().toMatchTypeOf<CronDelivery>();
  });

  // ── Extra field rejection (strict mode) ─────────────────
  test('rejects extra fields inside delivery (strict mode)', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: { mode: 'none', evil: true },
    });
    expect(result.success).toBe(false);
  });

  test('rejects extra fields inside SessionAddress target (strict mode)', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: {
        mode: 'channel',
        target: {
          provider: 'slack',
          scope: 'dm',
          identifiers: { peer: 'U123' },
          extra: 'bad',
        },
      },
    });
    expect(result.success).toBe(false);
  });

  test('rejects extra fields inside identifiers (strict mode)', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: {
        mode: 'channel',
        target: {
          provider: 'slack',
          scope: 'channel',
          identifiers: { channel: 'C123', evil: 'field' },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  // ── Invalid scope in SessionAddress ─────────────────────
  test('rejects SessionAddress target with invalid scope', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: {
        mode: 'channel',
        target: {
          provider: 'slack',
          scope: 'broadcast',
          identifiers: {},
        },
      },
    });
    expect(result.success).toBe(false);
  });

  // ── Null byte rejection ─────────────────────────────────
  test('rejects null bytes in delivery target provider', () => {
    const result = SchedulerAddCronSchema.safeParse({
      ...base,
      delivery: {
        mode: 'channel',
        target: {
          provider: 'slack\0evil',
          scope: 'dm',
          identifiers: {},
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
