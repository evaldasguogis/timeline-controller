import { dateTime, DateTime, RawTimeRange, TimeRange } from '@grafana/data';
import { TimeStep } from '../types';

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
  const from: DateTime = forward
    ? dateTime(range.from).add(timeStep.value, timeStep.unit)
    : dateTime(range.from).subtract(timeStep.value, timeStep.unit);
  const to: DateTime = forward
    ? dateTime(range.to).add(timeStep.value, timeStep.unit)
    : dateTime(range.to).subtract(timeStep.value, timeStep.unit);
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
  const time = dateTime(0);
  const toValue = dateTime(time).add(timeStep.value, timeStep.unit);
  return toValue.toDate().getTime();
};
