import { dateMath, dateTime, DateTimeInput } from '@grafana/data';

// Grafana's RawTimeRange.from / .to are typed as DateTimeInput, which is a
// union of relative strings ('now-6h'), numeric strings ('1735345200000'),
// numbers, DateTime instances, and Dates. We need normalized forms in two
// places — milliseconds for comparison and a human-readable string for
// display — so the discrimination logic lives here in one place.

// Resolve a DateTimeInput to absolute milliseconds. Used wherever we need to
// compare two raw time-range bounds regardless of how they were serialized.
// Relative expressions resolve against the wall clock at call time, so two
// calls for the same relative string can differ slightly — callers must
// tolerate render-lag drift.
export const toAbsoluteMs = (v: DateTimeInput | undefined | null, roundUp: boolean): number => {
  if (v === undefined || v === null) {
    return 0;
  }
  if (typeof v === 'string') {
    if (dateMath.isMathString(v)) {
      const parsed = dateMath.toDateTime(v, { roundUp });
      return parsed ? parsed.valueOf() : 0;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === 'number') {
    return v;
  }
  if (v instanceof Date) {
    return v.valueOf();
  }
  const asDt = v as { valueOf?: () => number };
  if (typeof asDt.valueOf === 'function') {
    return asDt.valueOf();
  }
  return 0;
};

// Format a DateTimeInput for display. Relative expressions pass through
// verbatim (the relative form *is* the user's intent and reads as a stable
// label); everything else is rendered as a wall-clock date.
export const formatTimeBound = (v: DateTimeInput | undefined | null): string => {
  if (v === undefined || v === null) {
    return '';
  }
  if (typeof v === 'string') {
    if (dateMath.isMathString(v)) {
      return v;
    }
    const n = Number(v);
    return Number.isFinite(n) ? dateTime(n).format('YYYY-MM-DD HH:mm:ss') : v;
  }
  if (typeof v === 'number') {
    return dateTime(v).format('YYYY-MM-DD HH:mm:ss');
  }
  if (v instanceof Date) {
    return dateTime(v.valueOf()).format('YYYY-MM-DD HH:mm:ss');
  }
  const asDt = v as { format?: (s: string) => string; valueOf?: () => number };
  if (typeof asDt.format === 'function') {
    return asDt.format('YYYY-MM-DD HH:mm:ss');
  }
  if (typeof asDt.valueOf === 'function') {
    return dateTime(asDt.valueOf()).format('YYYY-MM-DD HH:mm:ss');
  }
  return String(v);
};
