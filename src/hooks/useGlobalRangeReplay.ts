import { useCallback, useEffect, useRef, useState } from 'react';
import { dateTime, EventBus, RawTimeRange, TimeRange } from '@grafana/data';
import { TimeRangeUpdatedEvent } from '@grafana/runtime';
import { TimeStep } from '../types';
import { clampToBoundary, makeTimeRange, shiftRange, stepToMillis } from '../utils/timeRange';
import { getGlobalRange, setGlobalRange } from '../utils/globalRange';
import { toAbsoluteMs } from '../utils/timeBound';
import { PlaybackState, TickResult, useReplay } from './useReplay';
import { PanelKeyboardProps, usePanelKeyboard } from './usePanelKeyboard';
import { useLiveRef } from './useLiveRef';

// Playback engine for BasicMode — drives the dashboard's global time range
// directly (no template variables). Sibling to `useWindowedReplay` which
// handles the variable-driven window modes. Both compose `useReplay` for
// the transport state machine and `usePanelKeyboard` for keyboard
// plumbing; this hook adds the global-range write model, baseline
// tracking, and Reset semantics specific to BasicMode.

// Relative writes ('now-6h') resolve against the wall clock at write time
// and again at parse time — those two moments can be a few hundred
// milliseconds apart, which would otherwise look like an "external change".
// 1.5s is well above realistic render lag and well below any user-driven
// change.
const EXTERNAL_CHANGE_TOLERANCE_MS = 1500;

export interface UseGlobalRangeReplayOptions {
  // The dashboard's current time range, as the panel prop. Used for the
  // initial baseline; subsequent changes arrive via `eventBus`.
  timeRange: TimeRange;
  // Dashboard-scoped event bus from PanelProps — Grafana publishes
  // TimeRangeUpdatedEvent here when the user changes the picker or an
  // auto-refresh re-resolves a relative range.
  eventBus: EventBus;
  // Current step size — drives how far each tick moves the range.
  step: TimeStep;
  // Delay between ticks while playing.
  tickIntervalMs: number;
}

export interface UseGlobalRangeReplayResult {
  // The time range to restore on Reset. Updated when the user picks an
  // external range; preserved across our own Step / Play / Reset writes.
  baselineRaw: RawTimeRange;
  // Playback state machine.
  state: PlaybackState;
  // True after the user (or playback) has shifted the range. Reset turns
  // this off; an external time-picker change also turns it off because the
  // baseline becomes the new range.
  hasStepped: boolean;
  // Direction-disabled flags. Forward disabled when a full step would land
  // at or past "now"; backward is a sanity check against the epoch.
  forwardDisabled: boolean;
  backwardDisabled: boolean;
  // True when there's no baseline to restore to (hasn't stepped yet).
  resetDisabled: boolean;
  // Transport.
  startPlayback: (forward: boolean) => void;
  pause: () => void;
  step: (forward: boolean) => void;
  reset: () => void;
  // Spread onto the mode's outer wrapper for panel-level keyboard
  // shortcuts and click-to-focus.
  panelKeyboard: PanelKeyboardProps;
}

const computeShiftedRange = (
  timeStep: TimeStep,
  forward: boolean
): { newRaw: RawTimeRange; boundaryHit: boolean } => {
  const currentRange = getGlobalRange();
  // Hard boundaries: epoch on the left, wall-clock "now" on the right.
  // Right boundary is dynamic — every tick re-evaluates against the current
  // moment, so playback meaningfully stops at "right now" rather than at the
  // value of now at panel mount.
  const globalBoundary = makeTimeRange(dateTime(0), dateTime());
  const candidate = shiftRange(currentRange, timeStep, forward);
  const { adjustedTimeRange, boundaryHit } = clampToBoundary(candidate, globalBoundary, forward);
  return {
    newRaw: {
      // Floor to whole seconds. Without this, ticks accumulate sub-second
      // drift, producing URLs with millisecond-level jitter that are hard
      // to read and impossible to align between runs.
      from: adjustedTimeRange.from.startOf('seconds'),
      to: adjustedTimeRange.to.startOf('seconds'),
    },
    boundaryHit,
  };
};

export const useGlobalRangeReplay = ({
  timeRange,
  eventBus,
  step: timeStep,
  tickIntervalMs,
}: UseGlobalRangeReplayOptions): UseGlobalRangeReplayResult => {
  // hasStepped is an explicit "user has stepped/played away from the
  // baseline" flag, used directly for Reset's enabled state. We could
  // derive it from a current-vs-baseline range comparison, but that
  // comparison would be fuzzy (tolerance-based) and would couple Reset's
  // UI state to the same discrimination logic the classifier below does.
  const [hasStepped, setHasStepped] = useState(false);

  // Initial baseline = current timeRange at mount. The event-bus
  // subscription handles every change after that.
  const [baselineRaw, setBaselineRaw] = useState<RawTimeRange>(timeRange.raw);
  const baselineRawRef = useLiveRef(baselineRaw);

  // Live ref so the onTick closure always reads the latest step without
  // forcing useReplay to re-create its interval.
  const stepRef = useLiveRef(timeStep);

  // Most recent write's absolute ms — the classifier reads it to
  // recognize event firings that are echoes of our own writes.
  const lastWrittenAbsRef = useRef<{ from: number; to: number } | null>(null);

  const writeRange = useCallback((raw: RawTimeRange) => {
    lastWrittenAbsRef.current = {
      from: toAbsoluteMs(raw.from, false),
      to: toAbsoluteMs(raw.to, true),
    };
    setGlobalRange(raw);
  }, []);

  const handleTick = useCallback(
    (forward: boolean): TickResult => {
      const { newRaw, boundaryHit } = computeShiftedRange(stepRef.current, forward);
      writeRange(newRaw);
      setHasStepped(true);
      return { boundaryHit };
    },
    [writeRange, stepRef]
  );

  const { state, startPlayback, pause, step } = useReplay({
    tickIntervalMs,
    onTick: handleTick,
  });

  // Subscribe to TimeRangeUpdatedEvent and classify each delivery:
  //   1. Matches the last range we wrote → our echo, skip.
  //   2. Matches the current baseline → reset echo, skip.
  //   3. Otherwise → external. Adopt as new baseline + pause + clear
  //      hasStepped so Reset disables itself.
  // Both (1) and (2) are needed: (1) alone misses "user picks a range
  // matching where we last stepped"; (2) alone misses our own Step writes
  // (which would otherwise become the new baseline).
  useEffect(() => {
    const within = (a: number, b: number) => Math.abs(a - b) <= EXTERNAL_CHANGE_TOLERANCE_MS;
    const sub = eventBus.getStream(TimeRangeUpdatedEvent).subscribe((event) => {
      const fromMs = event.payload.from.valueOf();
      const toMs = event.payload.to.valueOf();

      const last = lastWrittenAbsRef.current;
      if (last && within(last.from, fromMs) && within(last.to, toMs)) {
        return; // echo of our own write
      }

      const base = baselineRawRef.current;
      if (within(toAbsoluteMs(base.from, false), fromMs) && within(toAbsoluteMs(base.to, true), toMs)) {
        return; // mount / reset echo — already on baseline
      }

      pause();
      setBaselineRaw(event.payload.raw);
      setHasStepped(false);
    });
    return () => sub.unsubscribe();
  }, [eventBus, pause, baselineRawRef]);

  const reset = useCallback(() => {
    pause();
    writeRange(baselineRaw);
    setHasStepped(false);
  }, [pause, writeRange, baselineRaw]);

  const panelKeyboard = usePanelKeyboard({
    state,
    startPlayback,
    pause,
    step,
    reset,
  });

  const stepMs = stepToMillis(timeStep);
  // Wall-clock "now" is read at render time so the forward-disabled
  // state stays current after each prop change. Date.now() is impure
  // by definition; wrapping it in useMemo wouldn't fix the impurity,
  // just hide it.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  // Forward is disabled when a full step would land at or past "now"
  // (clampToBoundary would clamp and immediately pause). Backward is a
  // sanity-only check: nobody scrolls back 56 years to the epoch.
  const forwardDisabled = timeRange.to.valueOf() + stepMs >= nowMs;
  const backwardDisabled = timeRange.from.valueOf() - stepMs <= 0;

  return {
    baselineRaw,
    state,
    hasStepped,
    forwardDisabled,
    backwardDisabled,
    resetDisabled: !hasStepped,
    startPlayback,
    pause,
    step,
    reset,
    panelKeyboard,
  };
};
