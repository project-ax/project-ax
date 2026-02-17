import { describe, test, expect } from 'vitest';
import {
  parseTime,
  isWithinActiveHours,
  parseCronField,
  matchesCron,
  schedulerSession,
} from '../../../src/providers/scheduler/utils.js';

describe('scheduler/utils', () => {
  describe('parseTime', () => {
    test('parses HH:MM to minutes from midnight', () => {
      expect(parseTime('00:00')).toBe(0);
      expect(parseTime('01:30')).toBe(90);
      expect(parseTime('23:59')).toBe(1439);
      expect(parseTime('12:00')).toBe(720);
    });
  });

  describe('isWithinActiveHours', () => {
    test('returns true when within range', () => {
      // Use a 24h window so it always matches regardless of when the test runs
      expect(isWithinActiveHours({ start: 0, end: 1440, timezone: 'UTC' })).toBe(true);
    });

    test('returns false when outside range', () => {
      // Use a 1-minute window 12 hours from now
      const now = new Date();
      const currentHour = now.getUTCHours();
      const farHour = (currentHour + 12) % 24;
      const farStart = farHour * 60;
      expect(isWithinActiveHours({ start: farStart, end: farStart + 1, timezone: 'UTC' })).toBe(false);
    });
  });

  describe('parseCronField', () => {
    test('wildcard matches all values', () => {
      const result = parseCronField('*', 0, 59);
      expect(result.size).toBe(60);
      expect(result.has(0)).toBe(true);
      expect(result.has(59)).toBe(true);
    });

    test('single value', () => {
      const result = parseCronField('5', 0, 59);
      expect(result.size).toBe(1);
      expect(result.has(5)).toBe(true);
    });

    test('range', () => {
      const result = parseCronField('1-3', 0, 59);
      expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    });

    test('step over wildcard', () => {
      const result = parseCronField('*/15', 0, 59);
      expect([...result].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
    });

    test('step over range', () => {
      const result = parseCronField('1-10/3', 0, 59);
      expect([...result].sort((a, b) => a - b)).toEqual([1, 4, 7, 10]);
    });

    test('comma-separated list', () => {
      const result = parseCronField('1,5,10', 0, 59);
      expect([...result].sort((a, b) => a - b)).toEqual([1, 5, 10]);
    });

    test('combined comma + range', () => {
      const result = parseCronField('1-3,10', 0, 59);
      expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 10]);
    });
  });

  describe('matchesCron', () => {
    test('"* * * * *" matches any date', () => {
      expect(matchesCron('* * * * *', new Date('2026-02-17T12:30:00Z'))).toBe(true);
    });

    test('specific minute matches', () => {
      expect(matchesCron('30 * * * *', new Date('2026-02-17T12:30:00Z'))).toBe(true);
      expect(matchesCron('31 * * * *', new Date('2026-02-17T12:30:00Z'))).toBe(false);
    });

    test('*/5 matches every 5 minutes', () => {
      expect(matchesCron('*/5 * * * *', new Date('2026-02-17T12:00:00Z'))).toBe(true);
      expect(matchesCron('*/5 * * * *', new Date('2026-02-17T12:05:00Z'))).toBe(true);
      expect(matchesCron('*/5 * * * *', new Date('2026-02-17T12:03:00Z'))).toBe(false);
    });

    test('specific hour and minute', () => {
      // Use local-time dates since matchesCron uses getHours() (local)
      const at9 = new Date();
      at9.setHours(9, 0, 0, 0);
      const at10 = new Date();
      at10.setHours(10, 0, 0, 0);
      expect(matchesCron('0 9 * * *', at9)).toBe(true);
      expect(matchesCron('0 9 * * *', at10)).toBe(false);
    });

    test('day of week', () => {
      const now = new Date();
      const dow = now.getDay(); // local day of week
      expect(matchesCron(`* * * * ${dow}`, now)).toBe(true);
      expect(matchesCron(`* * * * ${(dow + 1) % 7}`, now)).toBe(false);
    });

    test('invalid expression (not 5 fields) returns false', () => {
      expect(matchesCron('* * *', new Date())).toBe(false);
      expect(matchesCron('', new Date())).toBe(false);
    });
  });

  describe('schedulerSession', () => {
    test('returns correct SessionAddress shape', () => {
      const session = schedulerSession('heartbeat');
      expect(session).toEqual({
        provider: 'scheduler',
        scope: 'dm',
        identifiers: { peer: 'heartbeat' },
      });
    });

    test('uses sender as peer identifier', () => {
      const session = schedulerSession('cron:job-1');
      expect(session.identifiers.peer).toBe('cron:job-1');
    });
  });
});
