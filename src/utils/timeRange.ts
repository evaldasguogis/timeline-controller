import { dateTime, DateTime, DurationUnit, RawTimeRange, TimeRange } from '@grafana/data';
import { TimeStep } from '../types';

// Grafana duration units map to moment.js `DurationUnit`. `M` is month
// (uppercase) — lowercase `m` is minutes, the standard moment convention
// Grafana inherits.
const UNIT_BY_LETTER: Record<string, DurationUnit> = {
  s: 's',
  m: 'm',
  h: 'h',
  d: 'd',
  w: 'w',
  M: 'month',
  y: 'y',
};

interface ParsedDuration {
  value: number;
  unit: DurationUnit;
}

// Parse a Grafana duration string into the {value, unit} pair moment.js
// `dateTime().add()` wants. Returns null when the string doesn't match the
// expected `<digits><unit>` shape — math sites treat null as "0 ms" so a
// malformed step degrades to a no-op rather than throwing.
export const parseDuration = (s: TimeStep): ParsedDuration | null => {
  const match = /^(\d+)([smhdwMy])$/.exec(s);
  if (!match) {
    return null;
  }
  return { value: parseInt(match[1], 10), unit: UNIT_BY_LETTER[match[2]] };
};

export const makeTimeRange = (from: DateTime, to: DateTime | undefined): TimeRange => {
  if (!to) {
    to = from;
  }
  const raw: RawTimeRange = {
    from: from.toISOString(),
    to: to.toISOString(),
  };
  return { from, to, raw };
};

export const shiftRange = (range: TimeRange, timeStep: TimeStep, forward: boolean): TimeRange => {
  const parsed = parseDuration(timeStep);
  if (!parsed) {
    return range;
  }
  const from: DateTime = forward
    ? dateTime(range.from).add(parsed.value, parsed.unit)
    : dateTime(range.from).subtract(parsed.value, parsed.unit);
  const to: DateTime = forward
    ? dateTime(range.to).add(parsed.value, parsed.unit)
    : dateTime(range.to).subtract(parsed.value, parsed.unit);
  return makeTimeRange(from, to);
};

export const clampToBoundary = (
  range: TimeRange,
  boundary: TimeRange,
  forward: boolean
): { adjustedTimeRange: TimeRange; boundaryHit: boolean } => {
  const boundaryFrom = dateTime(boundary.from);
  const boundaryTo = dateTime(boundary.to);
  const from = dateTime(range.from);
  const to = dateTime(range.to);

  if (forward && to.valueOf() >= boundaryTo.valueOf()) {
    const adjustedTo = dateTime(boundaryTo);
    const adjustedFrom = dateTime(boundaryTo.add(from.diff(to)));
    return { adjustedTimeRange: makeTimeRange(adjustedFrom, adjustedTo), boundaryHit: true };
  }

  if (!forward && from.valueOf() <= boundaryFrom.valueOf()) {
    const adjustedFrom = dateTime(boundaryFrom);
    const adjustedTo = dateTime(boundaryFrom.add(to.diff(from)));
    return { adjustedTimeRange: makeTimeRange(adjustedFrom, adjustedTo), boundaryHit: true };
  }

  return { adjustedTimeRange: range, boundaryHit: false };
};

export const stepToMillis = (timeStep: TimeStep): number => {
  const parsed = parseDuration(timeStep);
  if (!parsed) {
    return 0;
  }
  return dateTime(0).add(parsed.value, parsed.unit).valueOf();
};
