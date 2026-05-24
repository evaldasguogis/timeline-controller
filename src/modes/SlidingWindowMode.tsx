import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, TimeRange } from '@grafana/data';
import { getAppEvents, locationService, RefreshEvent, TimeRangeUpdatedEvent } from '@grafana/runtime';
import { Alert, Button, useStyles2 } from '@grafana/ui';
import {
  HorizontalAlignment,
  SlidingWindowModeOptions,
  TimeStep,
  TimelineControllerOptions,
  VerticalAlignment,
  WindowPosition,
} from '../types';
import { stepToMillis } from '../utils/timeRange';
import { encodeTimeValue, setVariables, VariableValues } from '../utils/variables';
import { validateVariableConfig } from '../utils/variableValidation';
import { readIntervalVariable } from '../utils/intervalVariable';
import { TimeStepDropdown } from '../components/TimeStepDropdown';
import { PlaybackControls } from '../components/PlaybackControls';
import { WindowProgressTrack } from '../components/WindowProgressTrack';
import { useReplay, TickResult } from '../hooks/useReplay';
import { usePlaybackShortcuts } from '../hooks/usePlaybackShortcuts';

// Sliding Window mode writes a pair of template variables instead of driving
// the global time range. The consumer data source uses the variables in its
// query (typically as a WHERE bound), so this mode requires dashboard
// preparation — variables must exist and the consumer panel's queries must
// reference them. The window is one timeStep wide and slides forward/back
// across the dashboard's global range; the global range is the boundary.

interface Props {
  options: TimelineControllerOptions;
  onOptionsChange: (options: TimelineControllerOptions) => void;
  timeRange: TimeRange;
}

interface WindowMs {
  from: number;
  to: number;
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
  // Stacked layout: progress track on top, transport controls below. Mirrors
  // a video player's "scrubber over controls" arrangement, so users instantly
  // recognize what's a position indicator vs. what's an action.
  wrapper: css`
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: ${alignItems};
    gap: ${theme.spacing(0.75)};
    height: 100%;
    width: 100%;
    padding: ${theme.spacing(0.5)};
  `,
  trackRow: css`
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;
  `,
  controlsRow: css`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: ${justifyContent};
    gap: ${theme.spacing(1)};
    width: 100%;
  `,
  separator: css`
    width: 1px;
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
  // Validation banner wrapper — replaces the entire panel chrome when errors
  // block playback, since there's nothing useful to interact with.
  errorWrapper: css`
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    height: 100%;
    width: 100%;
    padding: ${theme.spacing(1)};
  `,
});

// Compute the initial window: anchored to either edge of the dashboard's
// global range per `position`, one timeStep wide, clamped to fit. Pulling
// this out makes the "where we reset to" target explicit and shared between
// first-tick logic and jump-to-start.
const initialWindow = (
  boundary: TimeRange,
  timeStep: TimeStep,
  position: WindowPosition
): WindowMs => {
  const fromMs = boundary.from.valueOf();
  const toMs = boundary.to.valueOf();
  const stepMs = stepToMillis(timeStep);
  if (position === 'end') {
    return { from: Math.max(fromMs, toMs - stepMs), to: toMs };
  }
  return { from: fromMs, to: Math.min(fromMs + stepMs, toMs) };
};

// Shift the window by `stepMs` and clamp to the global boundary. When clamping
// engages, the window's width is preserved (the opposite edge slides too) and
// `boundaryHit` is reported so the caller can auto-pause playback.
const shiftWindow = (
  current: WindowMs,
  stepMs: number,
  boundaryFrom: number,
  boundaryTo: number,
  forward: boolean
): { next: WindowMs; boundaryHit: boolean } => {
  const span = current.to - current.from;
  let from = forward ? current.from + stepMs : current.from - stepMs;
  let to = forward ? current.to + stepMs : current.to - stepMs;
  // `>=` (not `>`) so that landing exactly on the boundary also pauses
  // playback: the next tick would clamp to the same position with no visible
  // change, just wasted queries.
  let boundaryHit = false;
  if (forward && to >= boundaryTo) {
    boundaryHit = true;
    to = boundaryTo;
    from = boundaryTo - span;
  } else if (!forward && from <= boundaryFrom) {
    boundaryHit = true;
    from = boundaryFrom;
    to = boundaryFrom + span;
  }
  return { next: { from, to }, boundaryHit };
};

// Build the synthetic per-slot usage markers Grafana's dashboard-settings
// scan reads. One field per published variable, each holding `${name}`
// when bound and empty string otherwise. Per-slot (not one combined
// marker) so Grafana's "missing variable" hint points at the specific
// binding — `_variableFrom`, `_variableTo`, or `_variableStep` — which
// tells the user immediately which one is broken.
const buildUsageMarkers = (sliding: SlidingWindowModeOptions) => ({
  _variableFrom: sliding.variableFrom.trim() ? `\${${sliding.variableFrom}}` : '',
  _variableTo: sliding.variableTo.trim() ? `\${${sliding.variableTo}}` : '',
  _variableStep: sliding.variableStep.trim() ? `\${${sliding.variableStep}}` : '',
});

export const SlidingWindowMode: React.FC<Props> = ({ options, onOptionsChange, timeRange }) => {
  const sliding = options.sliding;
  const justifyContent = horizontalToJustify[sliding.horizontalAlignment] ?? 'center';
  const alignItems = verticalToAlignItems[sliding.verticalAlignment] ?? 'center';
  const styles = useStyles2((theme) => getStyles(theme, justifyContent, alignItems));

  // null means "at the initial window position" — distinct from a window that
  // happens to coincide with the initial position numerically. That distinction
  // is what powers the jump-to-start enabled state without a fuzzy comparison
  // against initialWindow.
  const [currentWindow, setCurrentWindow] = useState<WindowMs | null>(null);

  // Mirror BasicMode's URL-history subscription: our plugin has
  // skipDataQuery, so Grafana won't re-render us when a referenced variable
  // changes. Subscribing to history changes is what keeps the step dropdown
  // in sync when the user picks a step from a bound interval variable's
  // dashboard-level dropdown.
  const [, bumpRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => locationService.getHistory().listen(bumpRender), []);

  // Keep the synthetic per-slot usage markers in sync so Grafana's "Used
  // by panels" scan always sees the current set of `${name}` references.
  // The check short-circuits when all three are already correct. Reading
  // `options.sliding` directly (rather than the local `sliding` alias)
  // keeps deps to just `[options, onOptionsChange]` — `sliding` would be
  // redundant since it's just `options.sliding`.
  useEffect(() => {
    const expected = buildUsageMarkers(options.sliding);
    if (
      options.sliding._variableFrom !== expected._variableFrom ||
      options.sliding._variableTo !== expected._variableTo ||
      options.sliding._variableStep !== expected._variableStep
    ) {
      onOptionsChange({
        ...options,
        sliding: { ...options.sliding, ...expected },
      });
    }
  }, [options, onOptionsChange]);

  // Variable-driven step: when the user binds variableStep to a dashboard
  // interval variable, that variable's option list and current value drive
  // the step picker. Returns null when blank/missing/wrong type, in which
  // case we fall back to sliding.timeStep.
  const intervalBinding = readIntervalVariable(sliding.variableStep);
  const activeStep = intervalBinding?.current ?? sliding.timeStep;

  // Re-validate on every render. Cheap (a handful of array scans) and
  // we need it fresh anyway: dashboard variables can be added or removed
  // while the panel is mounted, and `sliding` is a fresh object on every
  // render (the parent deep-merges defaults), so any memo keyed on
  // `sliding` would be a no-op.
  const validation = validateVariableConfig(sliding);
  const hasErrors = validation.errors.length > 0;

  // The onTick callback runs inside a setInterval started by useReplay, so it
  // must always read the latest values rather than the closure from when the
  // interval was created. Refs hold "what to do next" so changing options
  // mid-playback (step size, variable names, format, global range) takes effect
  // on the next tick.
  const timeStepRef = useRef<TimeStep>(activeStep);
  const timeRangeRef = useRef<TimeRange>(timeRange);
  const currentWindowRef = useRef<WindowMs | null>(currentWindow);
  const variableSpecRef = useRef<{ from: string; to: string }>({
    from: sliding.variableFrom,
    to: sliding.variableTo,
  });
  const initialPositionRef = useRef<WindowPosition>(sliding.initialPosition);

  useEffect(() => {
    timeStepRef.current = activeStep;
  }, [activeStep]);
  useEffect(() => {
    timeRangeRef.current = timeRange;
  }, [timeRange]);
  useEffect(() => {
    currentWindowRef.current = currentWindow;
  }, [currentWindow]);
  useEffect(() => {
    variableSpecRef.current = {
      from: sliding.variableFrom,
      to: sliding.variableTo,
    };
  }, [sliding.variableFrom, sliding.variableTo]);
  useEffect(() => {
    initialPositionRef.current = sliding.initialPosition;
  }, [sliding.initialPosition]);

  // Guard writes against an invalid config — bound to a ref so the closure
  // captured by useReplay's interval picks up the latest validity without
  // having to re-create the callback.
  const hasErrorsRef = useRef(hasErrors);
  useEffect(() => {
    hasErrorsRef.current = hasErrors;
  }, [hasErrors]);

  // Writes only the window's from/to. Step doesn't ride on tick writes any
  // more — when the user picks a step via the dropdown, that single click
  // writes the step variable directly, and from then on the variable already
  // represents the current step. Per-tick publishing was duplicative.
  const writeWindow = useCallback((win: WindowMs) => {
    if (hasErrorsRef.current) {
      return;
    }
    const spec = variableSpecRef.current;
    const values: VariableValues = {
      [spec.from]: encodeTimeValue(win.from),
      [spec.to]: encodeTimeValue(win.to),
    };
    setVariables(values);
  }, []);

  const handleTick = useCallback(
    (forward: boolean): TickResult => {
      const tr = timeRangeRef.current;
      const ts = timeStepRef.current;
      const boundaryFrom = tr.from.valueOf();
      const boundaryTo = tr.to.valueOf();
      const stepMs = stepToMillis(ts);

      const start = currentWindowRef.current ?? initialWindow(tr, ts, initialPositionRef.current);
      const { next, boundaryHit } = shiftWindow(start, stepMs, boundaryFrom, boundaryTo, forward);

      setCurrentWindow(next);
      writeWindow(next);
      return { boundaryHit };
    },
    [writeWindow]
  );

  const { state, startPlayback, pause, step } = useReplay({
    tickIntervalMs: sliding.tickIntervalMs,
    onTick: handleTick,
  });

  // Detect external changes to the dashboard's global range (the boundary).
  // When the user picks a new range via the global time picker, our existing
  // Seed the variables with the initial window so downstream panels never
  // see empty bounds, and re-seed on every external time range change.
  // Two channels feed this: the timeRange prop (handles initial mount and
  // any re-renders Grafana does itself) and Grafana's TimeRangeUpdatedEvent
  // (covers manual time-picker changes that may not re-render this panel
  // because of skipDataQuery). RefreshEvent covers auto-refresh ticks for
  // relative ranges (`now-3h`) where the absolute bounds shift each tick.
  // Both event paths read the fresh range from `getTemplateSrv()`-adjacent
  // sources rather than the (potentially stale) prop.
  const lastBoundaryMsRef = useRef<{ from: number; to: number } | null>(null);
  const seedWindow = useCallback(
    (tr: TimeRange) => {
      const fromMs = tr.from.valueOf();
      const toMs = tr.to.valueOf();
      const last = lastBoundaryMsRef.current;
      if (last !== null && last.from === fromMs && last.to === toMs) {
        return;
      }
      const isExternalChange = last !== null;
      lastBoundaryMsRef.current = { from: fromMs, to: toMs };
      if (isExternalChange) {
        pause();
      }
      const initial = initialWindow(tr, timeStepRef.current, initialPositionRef.current);
      setCurrentWindow(initial);
      writeWindow(initial);
    },
    [pause, writeWindow]
  );

  // Initial seed + prop-driven re-seed.
  useEffect(() => {
    seedWindow(timeRange);
  }, [timeRange, seedWindow]);

  // Event-driven re-seed for picker changes and auto-refresh of relative
  // ranges (skipDataQuery may otherwise leave the prop stale).
  useEffect(() => {
    const appEvents = getAppEvents();
    const onTimeRangeUpdated = (event: TimeRangeUpdatedEvent) => seedWindow(event.payload);
    const onRefresh = () => seedWindow(timeRangeRef.current);
    const sub1 = appEvents.subscribe(TimeRangeUpdatedEvent, onTimeRangeUpdated);
    const sub2 = appEvents.subscribe(RefreshEvent, onRefresh);
    return () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
    };
  }, [seedWindow]);

  // When the step changes mid-session, the visible window has the old span.
  // Anchor at the existing `from` and recompute `to`; if the new span would
  // overshoot the boundary, shift `from` left so the window still fits.
  // Also republish — the downstream panels need the resized window.
  useEffect(() => {
    const cw = currentWindowRef.current;
    if (cw === null) {
      return;
    }
    const tr = timeRangeRef.current;
    const stepMs = stepToMillis(activeStep);
    const boundaryFromMs = tr.from.valueOf();
    const boundaryToMs = tr.to.valueOf();
    let from = cw.from;
    let to = from + stepMs;
    if (to > boundaryToMs) {
      to = boundaryToMs;
      from = Math.max(boundaryFromMs, to - stepMs);
    }
    if (from === cw.from && to === cw.to) {
      return;
    }
    const next: WindowMs = { from, to };
    setCurrentWindow(next);
    writeWindow(next);
  }, [activeStep, writeWindow]);

  // Snap the window to the boundary's edges. Both pause first — jumping
  // implicitly stops any active playback for the same reason a manual step
  // does (otherwise the next tick would immediately move off the edge).
  const handleJumpToStart = useCallback(() => {
    pause();
    // Jump-to-start always means the leftmost position, independent of the
    // configured `initialPosition` (which only controls where seeding lands).
    const start = initialWindow(timeRangeRef.current, timeStepRef.current, 'start');
    writeWindow(start);
    setCurrentWindow(start);
  }, [pause, writeWindow]);

  const handleJumpToEnd = useCallback(() => {
    pause();
    const tr = timeRangeRef.current;
    const ts = timeStepRef.current;
    const stepMs = stepToMillis(ts);
    const boundaryToMs = tr.to.valueOf();
    const boundaryFromMs = tr.from.valueOf();
    const end = {
      from: Math.max(boundaryFromMs, boundaryToMs - stepMs),
      to: boundaryToMs,
    };
    writeWindow(end);
    setCurrentWindow(end);
  }, [pause, writeWindow]);

  const handleTogglePlay = useCallback(() => {
    if (state === 'paused') {
      startPlayback(true);
    } else {
      pause();
    }
  }, [state, startPlayback, pause]);

  const handleTogglePlayBackward = useCallback(() => {
    if (state === 'paused') {
      startPlayback(false);
    } else {
      pause();
    }
  }, [state, startPlayback, pause]);

  const panelKeyboard = usePlaybackShortcuts({
    togglePlay: handleTogglePlay,
    togglePlayBackward: handleTogglePlayBackward,
    pause,
    stepBack: () => step(false),
    stepForward: () => step(true),
    jumpToStart: handleJumpToStart,
    jumpToEnd: handleJumpToEnd,
  });

  // Not wrapped in useCallback unlike the jump-to-* handlers: every dep
  // (`intervalBinding`, `sliding`, `options`) is a fresh reference each
  // render, so useCallback wouldn't stabilize the returned function — it'd
  // just add deps-checking overhead. TimeStepDropdown doesn't memoize
  // either, so a stable ref wouldn't save renders downstream.
  const handleTimeStepChange = (newTimeStep: TimeStep) => {
    if (intervalBinding) {
      // Variable-driven: write to the dashboard variable. The URL change
      // fires our location listener above, triggering a re-render with the
      // updated `intervalBinding.current`.
      setVariables({ [sliding.variableStep]: newTimeStep });
    } else {
      const newSliding: SlidingWindowModeOptions = { ...sliding, timeStep: newTimeStep };
      onOptionsChange({ ...options, sliding: newSliding });
    }
  };

  const stepMs = stepToMillis(activeStep);
  const displayWindow = currentWindow ?? initialWindow(timeRange, activeStep, sliding.initialPosition);
  const forwardDisabled = displayWindow.to >= timeRange.to.valueOf();
  const backwardDisabled = displayWindow.from <= timeRange.from.valueOf();
  // Jumps reuse the same edge checks — being at the left edge means jump-to-
  // start is a no-op; being at the right edge means jump-to-end is too.
  const jumpToStartDisabled = backwardDisabled;
  const jumpToEndDisabled = forwardDisabled;
  // Sanity guard: if timeStep is larger than the global range, the window
  // can never shift. Flag both buttons disabled so the controls visibly
  // reflect that state.
  const stepLargerThanBoundary = stepMs > timeRange.to.valueOf() - timeRange.from.valueOf();

  const openDashboardVariables = () => {
    // `editview=variables` opens the dashboard settings overlay on the
    // variables tab. Same deep link the VariablePicker's warning hint
    // uses — keep them in lockstep so behavior is consistent across the
    // panel.
    locationService.partial({ editview: 'variables' }, false);
  };

  // Errors fully replace the controls: the panel can't do its job in this
  // state and pretending otherwise would just confuse the user. Warnings are
  // advisory; they sit above the controls and don't block playback.
  if (hasErrors) {
    return (
      <div className={styles.errorWrapper}>
        <Alert severity="error" title="Variable configuration">
          {validation.errors.map((msg) => (
            <div key={msg}>{msg}</div>
          ))}
          <Button size="sm" variant="secondary" icon="external-link-alt" onClick={openDashboardVariables}>
            Open dashboard variables
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className={styles.wrapper} {...panelKeyboard}>
      {validation.warnings.length > 0 && (
        <Alert severity="warning" title="Variable configuration">
          {validation.warnings.map((msg) => (
            <div key={msg}>{msg}</div>
          ))}
          <Button size="sm" variant="secondary" icon="external-link-alt" onClick={openDashboardVariables}>
            Open dashboard variables
          </Button>
        </Alert>
      )}
      {sliding.showProgressTrack && (
        <div className={styles.trackRow}>
          <WindowProgressTrack
            boundary={{ from: timeRange.from.valueOf(), to: timeRange.to.valueOf() }}
            current={displayWindow}
            tickIntervalMs={sliding.tickIntervalMs}
            onCommit={(next) => {
              setCurrentWindow(next);
              writeWindow(next);
            }}
            onDragStart={pause}
            onNudge={step}
          />
        </div>
      )}
      <div className={styles.controlsRow}>
        <PlaybackControls
          state={state}
          stepLabel={activeStep}
          backwardDisabled={backwardDisabled || stepLargerThanBoundary}
          forwardDisabled={forwardDisabled || stepLargerThanBoundary}
          onPlayBack={() => startPlayback(false)}
          onPause={pause}
          onPlayForward={() => startPlayback(true)}
          onStepBack={() => step(false)}
          onStepForward={() => step(true)}
          onJumpToStart={handleJumpToStart}
          onJumpToEnd={handleJumpToEnd}
          jumpToStartDisabled={jumpToStartDisabled}
          jumpToEndDisabled={jumpToEndDisabled}
        />
        <span className={styles.separator} aria-hidden="true" />
        <div className={styles.stepGroup}>
          <span className={styles.stepLabel}>Step</span>
          <TimeStepDropdown
            value={activeStep}
            onChange={handleTimeStepChange}
            maxMs={timeRange.to.valueOf() - timeRange.from.valueOf()}
            intervalBinding={intervalBinding ?? undefined}
          />
        </div>
      </div>
    </div>
  );
};
