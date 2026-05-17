import { useEffect, useRef, useState } from 'react';
import { RawTimeRange, TimeRange } from '@grafana/data';
import { toAbsoluteMs } from '../utils/timeBound';

// Relative writes ('now-6h') resolve against the wall clock at write time
// and again at parse time — those two moments can be a few hundred
// milliseconds apart, which would otherwise look like an "external change".
// 1.5s is well above realistic render lag and well below any user-driven
// change.
const EXTERNAL_CHANGE_TOLERANCE_MS = 1500;

export interface UseExternalTimeRangeWatcherOptions {
  // The dashboard's current time range, as a panel prop. The watcher reacts
  // to changes in this value.
  timeRange: TimeRange;
  // The last range our plugin wrote, in absolute ms. The watcher reads this
  // ref to discriminate our own URL writes from external time-picker changes.
  // Owned by the caller because only the caller knows when it writes.
  lastWrittenAbsRef: React.MutableRefObject<{ from: number; to: number } | null>;
  // Invoked when an external time-range change is detected. Memoize with
  // useCallback in the caller, or the watcher will re-run unnecessarily.
  onExternalChange: () => void;
}

// Tracks the "baseline" — the time range to return to on Reset — and reacts
// to external time-range changes (global time picker, share link, browser
// back) by adopting the new range as the baseline and notifying the caller.
//
// Why a prop watch rather than Grafana's TimeRangeUpdatedEvent: Grafana 12
// (Scenes architecture) doesn't publish that event on either the app or panel
// event bus. Verified empirically. Prop changes still arrive reliably, and
// React only ever re-renders with the latest range, so there's no async-event
// race to worry about.
//
// Classification, in order:
//   1. Matches the caller's last write → our echo, skip.
//   2. Matches the current baseline → initial-mount echo or Reset write
//      being reflected back, skip.
//   3. Otherwise → external. Adopt as new baseline, notify the caller.
// Both (1) and (2) are needed: (1) alone misses "user picks before
// interacting with our panel" (last write is null); (2) alone misses our
// own step/play writes (baseline still points at the original).
export const useExternalTimeRangeWatcher = ({
  timeRange,
  lastWrittenAbsRef,
  onExternalChange,
}: UseExternalTimeRangeWatcherOptions): RawTimeRange => {
  const [baselineRaw, setBaselineRaw] = useState<RawTimeRange>(timeRange.raw);
  // Synced from state so the external-change effect can read the latest
  // baseline without taking it as a dep (which would re-run the effect on
  // every baseline change).
  const baselineRawRef = useRef<RawTimeRange>(timeRange.raw);
  useEffect(() => {
    baselineRawRef.current = baselineRaw;
  }, [baselineRaw]);

  useEffect(() => {
    const fromMs = timeRange.from.valueOf();
    const toMs = timeRange.to.valueOf();

    const last = lastWrittenAbsRef.current;
    if (
      last &&
      Math.abs(last.from - fromMs) <= EXTERNAL_CHANGE_TOLERANCE_MS &&
      Math.abs(last.to - toMs) <= EXTERNAL_CHANGE_TOLERANCE_MS
    ) {
      return;
    }

    const baselineFromMs = toAbsoluteMs(baselineRawRef.current.from, false);
    const baselineToMs = toAbsoluteMs(baselineRawRef.current.to, true);
    if (
      Math.abs(baselineFromMs - fromMs) <= EXTERNAL_CHANGE_TOLERANCE_MS &&
      Math.abs(baselineToMs - toMs) <= EXTERNAL_CHANGE_TOLERANCE_MS
    ) {
      return;
    }

    setBaselineRaw(timeRange.raw);
    onExternalChange();
  }, [timeRange, lastWrittenAbsRef, onExternalChange]);

  return baselineRaw;
};
