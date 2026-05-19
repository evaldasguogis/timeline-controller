import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { dateTime, GrafanaTheme2, RawTimeRange, TimeRange } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { Button, useStyles2 } from '@grafana/ui';
import { HorizontalAlignment, TimeStep, TimelineControllerOptions, VerticalAlignment } from '../types';
import { clampToBoundary, makeTimeRange, shiftRange, stepToMillis } from '../utils/timeRange';
import { getGlobalRange, setGlobalRange } from '../utils/globalRange';
import { formatTimeBound, toAbsoluteMs } from '../utils/timeBound';
import { readIntervalVariable } from '../utils/intervalVariable';
import { setVariables } from '../utils/variables';
import { TimeStepDropdown } from '../components/TimeStepDropdown';
import { PlaybackControls } from '../components/PlaybackControls';
import { useExternalTimeRangeWatcher } from '../hooks/useExternalTimeRangeWatcher';
import { TickResult, useReplay } from '../hooks/useReplay';

// Basic mode is the zero-config mode: drop the panel on any dashboard and it
// works. It drives the dashboard's *global* time picker — every time-aware
// panel reacts automatically. The other modes write template variables and
// require dashboard preparation; this one doesn't.

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

  // hasStepped is an explicit "user has stepped/played away from the baseline"
  // flag, used directly for Reset's enabled state. We could derive it from a
  // current-vs-baseline range comparison, but that comparison would be fuzzy
  // (tolerance-based) and would couple Reset's UI state to the same
  // discrimination logic the watcher already does internally.
  const [hasStepped, setHasStepped] = useState(false);

  // Variable values live in the URL (`var-<name>=<value>`). Our plugin has
  // `skipDataQuery: true`, so Grafana doesn't include us in its variable-
  // driven re-render path — even though the `_grafanaUsageMarker` field
  // gets us listed as "used by" in dashboard settings, no re-render is
  // scheduled when a referenced variable changes. Subscribing to history
  // changes is the workaround: any URL update (our own writes or external
  // picks via Grafana's variable bar) bumps a render.
  //
  // Known issue: changing options in the editor sometimes leaves a blinking
  // caret on a panel button. Cause not yet identified — see CLAUDE.local.md.
  const [, bumpRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => locationService.getHistory().listen(bumpRender), []);

  // Keep `_grafanaUsageMarker` in sync with `variableStep` so Grafana's
  // static scan always sees the right `${name}` reference. The check
  // short-circuits when already synced, so this is a no-op after the first
  // pass (or on dashboards whose persisted JSON already matches).
  useEffect(() => {
    const expected = options.basic.variableStep ? `\${${options.basic.variableStep}}` : '';
    if (options.basic._grafanaUsageMarker !== expected) {
      onOptionsChange({
        ...options,
        basic: { ...options.basic, _grafanaUsageMarker: expected },
      });
    }
  }, [options, onOptionsChange]);

  // When the user has bound step to a dashboard interval variable, the
  // variable's option list and current value drive the dropdown — the
  // built-in 17-value list is bypassed. Resolves to null if the binding is
  // blank, the variable doesn't exist, or it's the wrong type; callers fall
  // back to options.basic.timeStep in that case.
  const intervalBinding = readIntervalVariable(options.basic.variableStep);
  const activeStep = intervalBinding?.current ?? options.basic.timeStep;

  // timeStep lives in a ref so the onTick callback (which is wrapped in
  // useCallback to keep useReplay's interval stable) always reads the latest
  // value rather than a closure from when it was created.
  const timeStepRef = useRef<TimeStep>(activeStep);
  useEffect(() => {
    timeStepRef.current = activeStep;
  }, [activeStep]);

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
      const { newRaw, boundaryHit } = computeShiftedRange(timeStepRef.current, forward);
      writeRange(newRaw);
      setHasStepped(true);
      return { boundaryHit };
    },
    [writeRange]
  );

  const { state, startPlayback, pause, step } = useReplay({
    tickIntervalMs: options.basic.tickIntervalMs,
    onTick: handleTick,
  });

  const handleTimeStepChange = (newTimeStep: TimeStep) => {
    if (intervalBinding) {
      // Variable-driven: write to the dashboard variable. The URL change
      // fires our location listener above, triggering a re-render with the
      // updated `intervalBinding.current`.
      setVariables({ [options.basic.variableStep]: newTimeStep });
    } else {
      onOptionsChange({ ...options, basic: { ...options.basic, timeStep: newTimeStep } });
    }
  };

  const handleExternalChange = useCallback(() => {
    pause();
    setHasStepped(false);
  }, [pause]);

  const baselineRaw = useExternalTimeRangeWatcher({
    timeRange,
    lastWrittenAbsRef,
    onExternalChange: handleExternalChange,
  });

  const handleReset = useCallback(() => {
    pause();
    writeRange(baselineRaw);
    setHasStepped(false);
  }, [pause, writeRange, baselineRaw]);

  const stepMs = stepToMillis(activeStep);
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

  return (
    <div className={styles.wrapper}>
      <PlaybackControls
        state={state}
        stepLabel={activeStep}
        backwardDisabled={backwardDisabled}
        forwardDisabled={forwardDisabled}
        onPlayBack={() => startPlayback(false)}
        onPause={pause}
        onPlayForward={() => startPlayback(true)}
        onStepBack={() => step(false)}
        onStepForward={() => step(true)}
      />
      <span className={styles.separator} aria-hidden="true" />
      <div className={styles.stepGroup}>
        <span className={styles.stepLabel}>Step</span>
        <TimeStepDropdown
          value={activeStep}
          onChange={handleTimeStepChange}
          intervalBinding={intervalBinding ?? undefined}
        />
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
