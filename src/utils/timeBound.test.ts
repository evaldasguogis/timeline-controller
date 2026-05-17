import { dateTime } from '@grafana/data';
import { formatTimeBound, toAbsoluteMs } from './timeBound';

describe('toAbsoluteMs', () => {
  it('returns 0 for null and undefined', () => {
    expect(toAbsoluteMs(null, false)).toBe(0);
    expect(toAbsoluteMs(undefined, false)).toBe(0);
  });

  describe('strings', () => {
    it('resolves relative expressions against the wall clock', () => {
      // dateMath.toDateTime resolves 'now' to current time. Allow a small
      // window for the parse-time vs. comparison-time drift.
      const before = Date.now();
      const result = toAbsoluteMs('now', false);
      const after = Date.now();
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after + 1);
    });

    it('subtracts time correctly for now-6h', () => {
      const now = toAbsoluteMs('now', false);
      const sixHoursAgo = toAbsoluteMs('now-6h', false);
      const sixHoursInMs = 6 * 60 * 60 * 1000;
      expect(now - sixHoursAgo).toBeGreaterThan(sixHoursInMs - 100);
      expect(now - sixHoursAgo).toBeLessThan(sixHoursInMs + 100);
    });

    it('parses numeric strings as milliseconds', () => {
      expect(toAbsoluteMs('1735345200000', false)).toBe(1735345200000);
      expect(toAbsoluteMs('0', false)).toBe(0);
    });

    it('returns 0 for an unparseable string', () => {
      expect(toAbsoluteMs('not-a-date', false)).toBe(0);
    });
  });

  it('returns numbers unchanged', () => {
    expect(toAbsoluteMs(1735345200000, false)).toBe(1735345200000);
  });

  it('extracts ms from a Date instance', () => {
    const d = new Date('2026-05-16T01:00:00Z');
    expect(toAbsoluteMs(d, false)).toBe(d.valueOf());
  });

  it('extracts ms from a DateTime instance via valueOf()', () => {
    const dt = dateTime('2026-05-16T01:00:00Z');
    expect(toAbsoluteMs(dt, false)).toBe(dt.valueOf());
  });
});

describe('formatTimeBound', () => {
  it('returns empty string for null and undefined', () => {
    expect(formatTimeBound(null)).toBe('');
    expect(formatTimeBound(undefined)).toBe('');
  });

  describe('strings', () => {
    it('passes relative expressions through verbatim', () => {
      expect(formatTimeBound('now')).toBe('now');
      expect(formatTimeBound('now-6h')).toBe('now-6h');
      expect(formatTimeBound('now-30m')).toBe('now-30m');
    });

    it('formats numeric strings as wall-clock dates (UTC)', () => {
      // process.env.TZ = 'UTC' is set in jest-setup.
      const ms = dateTime('2026-05-16T01:23:45Z').valueOf();
      expect(formatTimeBound(String(ms))).toBe('2026-05-16 01:23:45');
    });

    it('returns an unparseable string as-is', () => {
      expect(formatTimeBound('garbage')).toBe('garbage');
    });
  });

  it('formats a number as a wall-clock date', () => {
    const ms = dateTime('2026-05-16T01:23:45Z').valueOf();
    expect(formatTimeBound(ms)).toBe('2026-05-16 01:23:45');
  });

  it('formats a Date as a wall-clock date', () => {
    const d = new Date('2026-05-16T01:23:45Z');
    expect(formatTimeBound(d)).toBe('2026-05-16 01:23:45');
  });

  it('formats a DateTime via its .format method', () => {
    const dt = dateTime('2026-05-16T01:23:45Z');
    expect(formatTimeBound(dt)).toBe('2026-05-16 01:23:45');
  });
});
