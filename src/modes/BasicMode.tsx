import React, { useCallback, useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { dateTime, GrafanaTheme2, RawTimeRange, TimeRange } from '@grafana/data';
import { Button, useStyles2 } from '@grafana/ui';
import { HorizontalAlignment, TimeStep, TimelineControllerOptions, VerticalAlignment } from '../types';
import { clampToBoundary, makeTimeRange, shiftRange, stepToMillis } from '../utils/timeRange';
import { getGlobalRange, setGlobalRange } from '../utils/globalRange';
import { formatTimeBound, toAbsoluteMs } from '../utils/timeBound';
import { formatTimeStep, TimeStepDropdown } from '../components/TimeStepDropdown';
import { PlaybackControls, PlaybackState } from '../components/PlaybackControls';
import { useExternalTimeRangeWatcher } from '../hooks/useExternalTimeRangeWatcher';

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
  // hasStepped is an explicit "user has stepped/played away from the baseline"
  // flag, used directly for Reset's enabled state. We could derive it from a
  // current-vs-baseline range comparison, but that comparison would be fuzzy
  // (tolerance-based) and would couple Reset's UI state to the same
  // discrimination logic the watcher already does internally.
  const [hasStepped, setHasStepped] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // timeStep / tickInterval live in refs so the interval callback always
  // reads the latest values, not the closure from when setInterval started.
  // Without this, changing either option mid-playback would have no effect
  // until the user paused and resumed.
  const timeStepRef = useRef<TimeStep>(options.basic.timeStep);
  const tickIntervalMsRef = useRef<number>(options.basic.tickIntervalMs);
  // Most recent write's absolute ms — handed to the external-change watcher
  // so it can recognize prop updates that are echoes of our own writes.
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

  const handleExternalChange = useCallback(() => {
    clearTimer();
    setState('paused');
    setHasStepped(false);
  }, [clearTimer]);

  const baselineRaw = useExternalTimeRangeWatcher({
    timeRange,
    lastWrittenAbsRef,
    onExternalChange: handleExternalChange,
  });

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
              {formatTimeBound(baselineRaw.from)} → {formatTimeBound(baselineRaw.to)}
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
