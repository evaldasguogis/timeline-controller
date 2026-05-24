import { useCallback, useRef, useState } from 'react';
import { dateTime, RawTimeRange, TimeRange } from '@grafana/data';
import { TimeStep } from '../types';
import { clampToBoundary, makeTimeRange, shiftRange, stepToMillis } from '../utils/timeRange';
import { getGlobalRange, setGlobalRange } from '../utils/globalRange';
import { toAbsoluteMs } from '../utils/timeBound';
import { PlaybackState, TickResult, useReplay } from './useReplay';
import { PanelKeyboardProps, usePanelKeyboard } from './usePanelKeyboard';
import { useExternalTimeRangeWatcher } from './useExternalTimeRangeWatcher';
import { useLiveRef } from './useLiveRef';

// Playback engine for BasicMode — drives the dashboard's global time range
// directly (no template variables). Sibling to `useWindowedReplay` which
// handles the variable-driven window modes. Both compose `useReplay` for
// the transport state machine and `usePanelKeyboard` for keyboard
// plumbing; this hook adds the global-range write model, baseline tracking,
// and Reset semantics specific to BasicMode.

export interface UseGlobalRangeReplayOptions {
  // The dashboard's current time range, as the panel prop.
  timeRange: TimeRange;
  // Current step size — drives how far each tick moves the range.
  step: TimeStep;
  // Delay between ticks while playing.
  tickIntervalMs: number;
}

export interface UseGlobalRangeReplayResult {
  // The time range to restore on Reset. Tracked via the external-watcher.
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
  step: timeStep,
  tickIntervalMs,
}: UseGlobalRangeReplayOptions): UseGlobalRangeReplayResult => {
  // hasStepped is an explicit "user has stepped/played away from the
  // baseline" flag, used directly for Reset's enabled state. We could
  // derive it from a current-vs-baseline range comparison, but that
  // comparison would be fuzzy (tolerance-based) and would couple Reset's
  // UI state to the same discrimination logic the watcher already does.
  const [hasStepped, setHasStepped] = useState(false);

  // Live ref so the onTick closure always reads the latest step without
  // forcing useReplay to re-create its interval.
  const stepRef = useLiveRef(timeStep);

  // Most recent write's absolute ms — handed to the external-change watcher
  // so it can recognize prop updates that are echoes of our own writes.
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
    [writeRange]
  );

  const { state, startPlayback, pause, step } = useReplay({
    tickIntervalMs,
    onTick: handleTick,
  });

  const handleExternalChange = useCallback(() => {
    pause();
    setHasStepped(false);
  }, [pause]);

  const baselineRaw = useExternalTimeRangeWatcher({
    timeRange,
    lastWrittenAbsRef,
    onExternalChange: handleExternalChange,
  });

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
