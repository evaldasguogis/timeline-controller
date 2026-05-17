import { dateTime, TimeRange } from '@grafana/data';
import { TimeStep } from '../types';
import { clampToBoundary, makeTimeRange, shiftRange, stepToMillis } from './timeRange';

const forwardCases: Array<{ value: number; unit: TimeStep['unit']; from: string; to: string; expectedFrom: string; expectedTo: string }> = [
  { value: 1, unit: 's', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2021-01-01T00:00:01Z', expectedTo: '2021-01-01T01:00:01Z' },
  { value: 1, unit: 'm', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2021-01-01T00:01:00Z', expectedTo: '2021-01-01T01:01:00Z' },
  { value: 1, unit: 'h', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2021-01-01T01:00:00Z', expectedTo: '2021-01-01T02:00:00Z' },
];

const backwardCases: typeof forwardCases = [
  { value: 1, unit: 's', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2020-12-31T23:59:59Z', expectedTo: '2021-01-01T00:59:59Z' },
  { value: 1, unit: 'm', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2020-12-31T23:59:00Z', expectedTo: '2021-01-01T00:59:00Z' },
  { value: 1, unit: 'h', from: '2021-01-01T00:00:00Z', to: '2021-01-01T01:00:00Z', expectedFrom: '2020-12-31T23:00:00Z', expectedTo: '2021-01-01T00:00:00Z' },
];

describe('timeRange', () => {
  describe.each(forwardCases)(
    'shiftRange forward $value$unit',
    ({ value, unit, from, to, expectedFrom, expectedTo }) => {
      it(`steps from ${from}/${to} -> ${expectedFrom}/${expectedTo}`, () => {
        const range: TimeRange = makeTimeRange(dateTime(from), dateTime(to));
        const result = shiftRange(range, { value, unit }, true);
        expect(result.from.utc().format()).toBe(expectedFrom);
        expect(result.to.utc().format()).toBe(expectedTo);
      });
    }
  );

  describe.each(backwardCases)(
    'shiftRange backward $value$unit',
    ({ value, unit, from, to, expectedFrom, expectedTo }) => {
      it(`steps from ${from}/${to} -> ${expectedFrom}/${expectedTo}`, () => {
        const range: TimeRange = makeTimeRange(dateTime(from), dateTime(to));
        const result = shiftRange(range, { value, unit }, false);
        expect(result.from.utc().format()).toBe(expectedFrom);
        expect(result.to.utc().format()).toBe(expectedTo);
      });
    }
  );

  describe('shiftRange across leap years', () => {
    const range = makeTimeRange(dateTime('2020-02-29T00:00:00Z'), dateTime('2020-02-29T01:00:00Z'));
    const step: TimeStep = { value: 1, unit: 'y' };

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
      [{ value: 1, unit: 's' }, 1_000],
      [{ value: 30, unit: 's' }, 30_000],
      [{ value: 1, unit: 'm' }, 60_000],
      [{ value: 5, unit: 'm' }, 5 * 60_000],
      [{ value: 1, unit: 'h' }, 60 * 60_000],
      [{ value: 2, unit: 'h' }, 2 * 60 * 60_000],
      [{ value: 1, unit: 'd' }, 24 * 60 * 60_000],
    ])('converts %o to %i ms', (step, expected) => {
      expect(stepToMillis(step)).toBe(expected);
    });
  });
});
