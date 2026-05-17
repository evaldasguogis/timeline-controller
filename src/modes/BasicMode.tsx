import React, { useCallback, useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { dateMath, dateTime, DateTimeInput, GrafanaTheme2, RawTimeRange, TimeRange } from '@grafana/data';
import { Button, useStyles2 } from '@grafana/ui';
import { HorizontalAlignment, TimeStep, TimelineControllerOptions, VerticalAlignment } from '../types';
import { clampToBoundary, makeTimeRange, shiftRange, stepToMillis } from '../utils/rangeMath';
import { getGlobalRange, setGlobalRange } from '../utils/globalTimeRange';
import { formatTimeStep, TimeStepDropdown } from '../components/TimeStepDropdown';
import { PlaybackControls, PlaybackState } from '../components/PlaybackControls';

// Basic mode is the zero-config mode: drop the panel on any dashboard and it
// works. It drives the dashboard's *global* time picker — every time-aware
// panel reacts automatically. The other (future) modes write template
// variables and require dashboard preparation; this one doesn't.

interface Props {
  options: TimelineControllerOptions;
  onOptionsChange: (options: TimelineControllerOptions) => void;
  timeRange: TimeRange;
}

const horizontalToJustify: Record<HorizontalAlignment, string> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
};

const verticalToAlignItems: Record<VerticalAlignment, string> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
};

const getStyles = (theme: GrafanaTheme2, justifyContent: string, alignItems: string) => ({
  wrapper: css`
    display: flex;
    flex-direction: row;
    align-items: ${alignItems};
    justify-content: ${justifyContent};
    gap: ${theme.spacing(1)};
    height: 100%;
    width: 100%;
  `,
  separator: css`
    width: 1px;
    // Match the height of the adjacent ToolbarButtons so the divider doesn't
    // look like a tiny tick against full-height button borders.
    height: ${theme.spacing(4)};
    background: ${theme.colors.border.medium};
  `,
  stepGroup: css`
    display: inline-flex;
    align-items: center;
    gap: ${theme.spacing(1)};
  `,
  stepLabel: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  tooltipSecondary: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    margin-top: ${theme.spacing(0.25)};
  `,
});

// We write DateTime instances to the URL (via globalTimeRange.setGlobalRange),
// but Grafana hands back the same range with whatever shape it has decided on
// — sometimes a string of milliseconds, sometimes a DateTime, sometimes a
// relative expression. To compare "did this range come from us?" we normalize
// every shape down to a single number: absolute milliseconds.
const toAbsoluteMs = (v: DateTimeInput | undefined | null, roundUp: boolean): number => {
  if (v === undefined || v === null) {
    return 0;
  }
  if (typeof v === 'string') {
    // Relative expressions like 'now-6h' are resolved against current wall-clock,
    // so the same string parses to a slightly different number on each call.
    // The render-lag tolerance below absorbs that drift.
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

// Relative writes ('now-6h') resolve against the wall clock at write time and
// again at parse time — those two moments can be a few hundred milliseconds
// apart, which would otherwise look like an "external change". 1.5s is well
// above realistic render lag and well below any user-driven change.
const EXTERNAL_CHANGE_TOLERANCE_MS = 1500;

// Tooltip subtitle shows where Reset will jump to. We pass relative strings
// through verbatim ('now-6h') instead of resolving them — the relative form is
// the user's intent and reads as a stable label, whereas the resolved absolute
// would jitter every render.
const formatRawDateTime = (v: DateTimeInput | undefined | null): string => {
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
      // drift, producing URLs with millisecond-level jitter that are hard to
      // read and impossible to align between runs.
      from: adjustedTimeRange.from.startOf('seconds'),
      to: adjustedTimeRange.to.startOf('seconds'),
    },
    boundaryHit,
  };
};

export const BasicMode: React.FC<Props> = ({ options, onOptionsChange, timeRange }) => {
  const justifyContent = horizontalToJustify[options.basic.horizontalAlignment] ?? 'center';
  const alignItems = verticalToAlignItems[options.basic.verticalAlignment] ?? 'center';
  const styles = useStyles2((theme) => getStyles(theme, justifyContent, alignItems));

  const [state, setState] = useState<PlaybackState>('paused');
  // hasStepped is an explicit "have we moved from the baseline" flag rather
  // than a derived range-equality check. We learned the hard way that
  // Grafana's `timeRange.raw` does NOT always reflect our absolute-timestamp
  // writes back (sometimes it stays as the user's original relative string),
  // so equality on `raw` was unreliable. An explicit flag is honest about
  // what we're tracking: user intent ("I've stepped"), not URL state.
  const [hasStepped, setHasStepped] = useState(false);
  // Baseline is *state* (not a ref) because changing it changes the Reset
  // tooltip's subtitle, which is rendered.
  const [baselineRaw, setBaselineRaw] = useState<RawTimeRange>(timeRange.raw);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // timeStep / tickInterval live in refs so the interval callback always
  // reads the latest values, not the closure from when setInterval started.
  // Without this, changing the step or speed mid-playback would have no
  // effect until the user paused and replayed.
  const timeStepRef = useRef<TimeStep>(options.basic.timeStep);
  const tickIntervalMsRef = useRef<number>(options.basic.tickIntervalMs);
  // Tracks what we last wrote in *parsed absolute ms*. The external-change
  // detector compares this to the props' from/to ms; if they match within
  // tolerance, the change came from us, not the user.
  const lastWrittenAbsRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    timeStepRef.current = options.basic.timeStep;
  }, [options.basic.timeStep]);

  useEffect(() => {
    tickIntervalMsRef.current = options.basic.tickIntervalMs;
  }, [options.basic.tickIntervalMs]);

  const writeRange = useCallback((raw: RawTimeRange) => {
    lastWrittenAbsRef.current = {
      from: toAbsoluteMs(raw.from, false),
      to: toAbsoluteMs(raw.to, true),
    };
    setGlobalRange(raw);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // External-change detector. Fires every render where timeRange changes; if
  // the new range doesn't match what we just wrote, it must have come from
  // the user (global time picker, share link, browser back). In that case we
  // pause playback (the user is navigating elsewhere; continuing to tick
  // would be jarring), adopt the new range as the baseline (the new "reset
  // target"), and clear hasStepped.
  useEffect(() => {
    const last = lastWrittenAbsRef.current;
    if (!last) {
      return;
    }
    const fromMs = timeRange.from.valueOf();
    const toMs = timeRange.to.valueOf();
    if (
      Math.abs(last.from - fromMs) > EXTERNAL_CHANGE_TOLERANCE_MS ||
      Math.abs(last.to - toMs) > EXTERNAL_CHANGE_TOLERANCE_MS
    ) {
      clearTimer();
      setState('paused');
      setBaselineRaw(timeRange.raw);
      setHasStepped(false);
    }
  }, [timeRange, clearTimer]);

  // Stop any active interval on unmount so an out-of-tree tick can't fire
  // (which would try to setState on an unmounted component).
  useEffect(() => clearTimer, [clearTimer]);

  const tick = useCallback(
    (forward: boolean) => {
      const { newRaw, boundaryHit } = computeShiftedRange(timeStepRef.current, forward);
      writeRange(newRaw);
      setHasStepped(true);
      if (boundaryHit) {
        clearTimer();
        setState('paused');
      }
    },
    [clearTimer, writeRange]
  );

  const startPlayback = useCallback(
    (forward: boolean) => {
      clearTimer();
      timerRef.current = setInterval(() => tick(forward), tickIntervalMsRef.current);
      setState(forward ? 'playing-forward' : 'playing-back');
    },
    [clearTimer, tick]
  );

  const handlePause = useCallback(() => {
    clearTimer();
    setState('paused');
  }, [clearTimer]);

  const handleStep = useCallback(
    (forward: boolean) => {
      // Stepping while playing is implicitly a pause + step. Otherwise the
      // user has to pause before stepping, which feels redundant.
      handlePause();
      const { newRaw } = computeShiftedRange(timeStepRef.current, forward);
      writeRange(newRaw);
      setHasStepped(true);
    },
    [handlePause, writeRange]
  );

  const handleReset = useCallback(() => {
    handlePause();
    writeRange(baselineRaw);
    setHasStepped(false);
  }, [handlePause, writeRange, baselineRaw]);

  const handleTimeStepChange = (newTimeStep: TimeStep) => {
    onOptionsChange({ ...options, basic: { ...options.basic, timeStep: newTimeStep } });
  };

  const stepMs = stepToMillis(options.basic.timeStep);
  // Wall-clock "now" is intentionally read at render time so the forward-
  // disabled state stays current after each prop change. Date.now() is
  // impure by definition; React's purity rule is fine to suppress here —
  // wrapping it in useMemo wouldn't actually fix the impurity, just hide it.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  // Forward is disabled when a full step would land at or past "now"
  // (clampToBoundary would clamp and immediately pause). Backward is a
  // sanity-only check: nobody scrolls back 56 years to the epoch.
  const forwardDisabled = timeRange.to.valueOf() + stepMs >= nowMs;
  const backwardDisabled = timeRange.from.valueOf() - stepMs <= 0;
  const resetDisabled = !hasStepped;
  const stepLabel = formatTimeStep(options.basic.timeStep);

  return (
    <div className={styles.wrapper}>
      <PlaybackControls
        state={state}
        stepLabel={stepLabel}
        backwardDisabled={backwardDisabled}
        forwardDisabled={forwardDisabled}
        onPlayBack={() => startPlayback(false)}
        onPause={handlePause}
        onPlayForward={() => startPlayback(true)}
        onStepBack={() => handleStep(false)}
        onStepForward={() => handleStep(true)}
      />
      <span className={styles.separator} aria-hidden="true" />
      <div className={styles.stepGroup}>
        <span className={styles.stepLabel} id="step-label">
          Step
        </span>
        <TimeStepDropdown value={options.basic.timeStep} onChange={handleTimeStepChange} />
      </div>
      <span className={styles.separator} aria-hidden="true" />
      <Button
        aria-label="Reset"
        tooltip={
          <div>
            <div>Restore the original time range</div>
            <div className={styles.tooltipSecondary}>
              {formatRawDateTime(baselineRaw.from)} → {formatRawDateTime(baselineRaw.to)}
            </div>
          </div>
        }
        variant="secondary"
        icon="history-alt"
        disabled={resetDisabled}
        onClick={handleReset}
      >
        Reset
      </Button>
    </div>
  );
};
