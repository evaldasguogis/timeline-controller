import { dateTime, TimeRange } from '@grafana/data';
import { TimeStep } from '../types';
import { clampToBoundary, makeTimeRange, parseDuration, shiftRange, stepToMillis } from './timeRange';

const forwardCases: Array<{ step: TimeStep; from: string; to: string; expectedFrom: string; expectedTo: string }> = [
  { step: '1s', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2021-01-01T00:00:01Z', expectedTo: '2021-01-01T01:00:01Z' },
  { step: '1m', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2021-01-01T00:01:00Z', expectedTo: '2021-01-01T01:01:00Z' },
  { step: '1h', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2021-01-01T01:00:00Z', expectedTo: '2021-01-01T02:00:00Z' },
];

const backwardCases: typeof forwardCases = [
  { step: '1s', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2020-12-31T23:59:59Z', expectedTo: '2021-01-01T00:59:59Z' },
  { step: '1m', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2020-12-31T23:59:00Z', expectedTo: '2021-01-01T00:59:00Z' },
  { step: '1h', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2020-12-31T23:00:00Z', expectedTo: '2021-01-01T00:00:00Z' },
];

describe('timeRange', () => {
  describe.each(forwardCases)('shiftRange forward $step', ({ step, from, to, expectedFrom, expectedTo }) => {
    it(`steps from ${from}/${to} -> ${expectedFrom}/${expectedTo}`, () => {
      const range: TimeRange = makeTimeRange(dateTime(from), dateTime(to));
      const result = shiftRange(range, step, true);
      expect(result.from.utc().format()).toBe(expectedFrom);
      expect(result.to.utc().format()).toBe(expectedTo);
    });
  });

  describe.each(backwardCases)('shiftRange backward $step', ({ step, from, to, expectedFrom, expectedTo }) => {
    it(`steps from ${from}/${to} -> ${expectedFrom}/${expectedTo}`, () => {
      const range: TimeRange = makeTimeRange(dateTime(from), dateTime(to));
      const result = shiftRange(range, step, false);
      expect(result.from.utc().format()).toBe(expectedFrom);
      expect(result.to.utc().format()).toBe(expectedTo);
    });
  });

  describe('shiftRange across leap years', () => {
    const range = makeTimeRange(dateTime('2020-02-29T00:00:00Z'), dateTime('2020-02-29T01:00:00Z'));
    const step: TimeStep = '1y';

    it('steps forward one year from leap day to non-leap Feb 28', () => {
      const result = shiftRange(range, step, true);
      expect(result.from.utc().format()).toBe('2021-02-28T00:00:00Z');
      expect(result.to.utc().format()).toBe('2021-02-28T01:00:00Z');
    });

    it('steps backward one year from leap day to non-leap Feb 28', () => {
      const result = shiftRange(range, step, false);
      expect(result.from.utc().format()).toBe('2019-02-28T00:00:00Z');
      expect(result.to.utc().format()).toBe('2019-02-28T01:00:00Z');
    });
  });

  describe('shiftRange with an unparseable duration', () => {
    it('returns the range unchanged', () => {
      const range = makeTimeRange(dateTime('2021-01-01T00:00:00Z'), dateTime('2021-01-01T01:00:00Z'));
      const result = shiftRange(range, 'auto', true);
      expect(result).toBe(range);
    });
  });

  describe('clampToBoundary', () => {
    it('clamps forward when the window crosses the upper boundary', () => {
      const range = makeTimeRange(dateTime('2021-01-01T00:30:00Z'), dateTime('2021-01-01T02:00:00Z'));
      const boundary = makeTimeRange(dateTime('2021-01-01T00:00:00Z'), dateTime('2021-01-01T01:30:00Z'));
      const result = clampToBoundary(range, boundary, true);

      expect(result.boundaryHit).toBe(true);
      expect(result.adjustedTimeRange.to.utc().format()).toBe('2021-01-01T01:30:00Z');
      expect(result.adjustedTimeRange.from.utc().format()).toBe('2021-01-01T00:00:00Z');
    });

    it('clamps backward when the window crosses the lower boundary', () => {
      const range = makeTimeRange(dateTime('2021-01-01T00:00:00Z'), dateTime('2021-01-01T01:00:00Z'));
      const boundary = makeTimeRange(dateTime('2021-01-01T00:30:00Z'), dateTime('2021-01-01T02:00:00Z'));
      const result = clampToBoundary(range, boundary, false);

      expect(result.boundaryHit).toBe(true);
      expect(result.adjustedTimeRange.from.utc().format()).toBe('2021-01-01T00:30:00Z');
      expect(result.adjustedTimeRange.to.utc().format()).toBe('2021-01-01T01:30:00Z');
    });

    it('returns the range unchanged when inside the boundary', () => {
      const range = makeTimeRange(dateTime('2021-01-01T00:30:00Z'), dateTime('2021-01-01T01:00:00Z'));
      const boundary = makeTimeRange(dateTime('2021-01-01T00:00:00Z'), dateTime('2021-01-01T02:00:00Z'));
      const result = clampToBoundary(range, boundary, true);

      expect(result.boundaryHit).toBe(false);
      expect(result.adjustedTimeRange).toBe(range);
    });
  });

  describe('stepToMillis', () => {
    it.each<[TimeStep, number]>([
      ['1s', 1_000],
      ['30s', 30_000],
      ['1m', 60_000],
      ['5m', 5 * 60_000],
      ['1h', 60 * 60_000],
      ['2h', 2 * 60 * 60_000],
      ['1d', 24 * 60 * 60_000],
    ])('converts %s to %i ms', (step, expected) => {
      expect(stepToMillis(step)).toBe(expected);
    });

    it('returns 0 for an unparseable duration', () => {
      expect(stepToMillis('auto')).toBe(0);
    });
  });

  describe('parseDuration', () => {
    it.each([
      ['1s', { value: 1, unit: 's' }],
      ['30s', { value: 30, unit: 's' }],
      ['5m', { value: 5, unit: 'm' }],
      ['1h', { value: 1, unit: 'h' }],
      ['1d', { value: 1, unit: 'd' }],
      ['1w', { value: 1, unit: 'w' }],
      ['1M', { value: 1, unit: 'month' }],
      ['1y', { value: 1, unit: 'y' }],
    ])('parses "%s"', (input, expected) => {
      expect(parseDuration(input)).toEqual(expected);
    });

    it.each(['', 'auto', '$__auto', '5', 'm', '5x', '1.5m', '-5m'])('returns null for unparseable "%s"', (input) => {
      expect(parseDuration(input)).toBeNull();
    });
  });
});
