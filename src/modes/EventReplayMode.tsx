import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { dateTime, GrafanaTheme2 } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { Alert, Button, useStyles2 } from '@grafana/ui';
import {
  EventReplayModeOptions,
  HorizontalAlignment,
  TimeFormat,
  TimeStep,
  TimelineControllerOptions,
  VerticalAlignment,
} from '../types';
import { stepToMillis } from '../utils/timeRange';
import { encodeTimeValue, setVariables, VariableValues } from '../utils/variables';
import { validateVariableConfig } from '../utils/variableValidation';
import { readIntervalVariable } from '../utils/intervalVariable';
import { TimeStepDropdown } from '../components/TimeStepDropdown';
import { PlaybackControls } from '../components/PlaybackControls';
import { WindowProgressTrack } from '../components/WindowProgressTrack';
import { useReplay, TickResult } from '../hooks/useReplay';

// Event Replay is mechanically identical to Sliding Window — same writes,
// same window math — except the boundary is panel-configured rather than
// inherited from the dashboard's global time picker. Pick this when the
// time range being replayed is a specific historical event that should
// stay fixed regardless of what the dashboard's time picker shows.
//
// Implementation note: most of this file is copy-pasted from
// SlidingWindowMode with the boundary source swapped. Comparison mode
// (planned) will need this same window-replay engine doubled, so the
// shared logic will get extracted to a hook then. For now the duplication
// is honest about what's actually shared vs. what's mode-specific.

interface Props {
  options: TimelineControllerOptions;
  onOptionsChange: (options: TimelineControllerOptions) => void;
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
  windowReadout: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-align: center;
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

// Initial window: anchored to the left edge of the configured boundary,
// one timeStep wide, clamped to fit.
const initialWindow = (boundaryFromMs: number, boundaryToMs: number, timeStep: TimeStep): WindowMs => {
  const stepMs = stepToMillis(timeStep);
  return { from: boundaryFromMs, to: Math.min(boundaryFromMs + stepMs, boundaryToMs) };
};

// Shift the window by `stepMs` and clamp to the configured boundary. When
// clamping engages, the window's width is preserved and `boundaryHit` is
// reported so the caller can auto-pause playback.
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

const buildUsageMarkers = (event: EventReplayModeOptions) => ({
  _variableFrom: event.variableFrom.trim() ? `\${${event.variableFrom}}` : '',
  _variableTo: event.variableTo.trim() ? `\${${event.variableTo}}` : '',
  _variableStep: event.variableStep.trim() ? `\${${event.variableStep}}` : '',
});

// Validate the panel-configured boundary. Unlike SlidingWindowMode (which
// inherits the dashboard's range and can assume it's valid), Event Replay
// needs to flag unset / inverted ranges so the user sees actionable errors
// instead of a quietly-broken panel.
const validateBoundary = (event: EventReplayModeOptions): string[] => {
  const errors: string[] = [];
  if (event.boundaryFrom <= 0 || event.boundaryTo <= 0) {
    errors.push('Event boundary is not set. Configure "From" and "To" in the panel options.');
  } else if (event.boundaryFrom >= event.boundaryTo) {
    errors.push('Event boundary "From" must be before "To".');
  }
  return errors;
};

export const EventReplayMode: React.FC<Props> = ({ options, onOptionsChange }) => {
  const event = options.event;
  const justifyContent = horizontalToJustify[event.horizontalAlignment] ?? 'center';
  const alignItems = verticalToAlignItems[event.verticalAlignment] ?? 'center';
  const styles = useStyles2((theme) => getStyles(theme, justifyContent, alignItems));

  const [currentWindow, setCurrentWindow] = useState<WindowMs | null>(null);

  // Same URL-history subscription pattern as the other modes: skipDataQuery
  // means Grafana won't re-render us on variable changes, so we listen for
  // URL updates directly to keep the step dropdown in sync.
  const [, bumpRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => locationService.getHistory().listen(bumpRender), []);

  // Keep the synthetic per-slot usage markers in sync so Grafana's "Used
  // by panels" scan always sees the current set of `${name}` references.
  useEffect(() => {
    const expected = buildUsageMarkers(options.event);
    if (
      options.event._variableFrom !== expected._variableFrom ||
      options.event._variableTo !== expected._variableTo ||
      options.event._variableStep !== expected._variableStep
    ) {
      onOptionsChange({
        ...options,
        event: { ...options.event, ...expected },
      });
    }
  }, [options, onOptionsChange]);

  const intervalBinding = readIntervalVariable(event.variableStep);
  const activeStep = intervalBinding?.current ?? event.timeStep;

  const variableValidation = validateVariableConfig(event);
  const boundaryErrors = validateBoundary(event);
  const errors = [...boundaryErrors, ...variableValidation.errors];
  const warnings = variableValidation.warnings;
  const hasErrors = errors.length > 0;

  // Refs for the tick callback (same pattern as SlidingWindowMode).
  const timeStepRef = useRef<TimeStep>(activeStep);
  const boundaryRef = useRef<{ from: number; to: number }>({
    from: event.boundaryFrom,
    to: event.boundaryTo,
  });
  const currentWindowRef = useRef<WindowMs | null>(currentWindow);
  const variableSpecRef = useRef<{
    from: string;
    to: string;
    timeFormat: TimeFormat;
  }>({
    from: event.variableFrom,
    to: event.variableTo,
    timeFormat: event.timeFormat,
  });

  useEffect(() => {
    timeStepRef.current = activeStep;
  }, [activeStep]);
  useEffect(() => {
    boundaryRef.current = { from: event.boundaryFrom, to: event.boundaryTo };
  }, [event.boundaryFrom, event.boundaryTo]);
  useEffect(() => {
    currentWindowRef.current = currentWindow;
  }, [currentWindow]);
  useEffect(() => {
    variableSpecRef.current = {
      from: event.variableFrom,
      to: event.variableTo,
      timeFormat: event.timeFormat,
    };
  }, [event.variableFrom, event.variableTo, event.timeFormat]);

  const hasErrorsRef = useRef(hasErrors);
  useEffect(() => {
    hasErrorsRef.current = hasErrors;
  }, [hasErrors]);

  const writeWindow = useCallback((win: WindowMs) => {
    if (hasErrorsRef.current) {
      return;
    }
    const spec = variableSpecRef.current;
    const values: VariableValues = {
      [spec.from]: encodeTimeValue(win.from, spec.timeFormat),
      [spec.to]: encodeTimeValue(win.to, spec.timeFormat),
    };
    setVariables(values);
  }, []);

  const handleTick = useCallback(
    (forward: boolean): TickResult => {
      const ts = timeStepRef.current;
      const { from: boundaryFrom, to: boundaryTo } = boundaryRef.current;
      const stepMs = stepToMillis(ts);

      const start = currentWindowRef.current ?? initialWindow(boundaryFrom, boundaryTo, ts);
      const { next, boundaryHit } = shiftWindow(start, stepMs, boundaryFrom, boundaryTo, forward);

      setCurrentWindow(next);
      writeWindow(next);
      return { boundaryHit };
    },
    [writeWindow]
  );

  const { state, startPlayback, pause, step } = useReplay({
    tickIntervalMs: event.tickIntervalMs,
    onTick: handleTick,
  });

  // If the user changes the boundary in panel options while playing, the
  // existing window position no longer makes sense — drop it and pause.
  const lastBoundaryRef = useRef<{ from: number; to: number } | null>(null);
  useEffect(() => {
    const last = lastBoundaryRef.current;
    lastBoundaryRef.current = { from: event.boundaryFrom, to: event.boundaryTo };
    if (last === null) {
      return;
    }
    if (last.from === event.boundaryFrom && last.to === event.boundaryTo) {
      return;
    }
    pause();
    setCurrentWindow(null);
  }, [event.boundaryFrom, event.boundaryTo, pause]);

  const handleJumpToStart = useCallback(() => {
    pause();
    const { from, to } = boundaryRef.current;
    const start = initialWindow(from, to, timeStepRef.current);
    writeWindow(start);
    setCurrentWindow(start);
  }, [pause, writeWindow]);

  const handleJumpToEnd = useCallback(() => {
    pause();
    const { from: boundaryFromMs, to: boundaryToMs } = boundaryRef.current;
    const stepMs = stepToMillis(timeStepRef.current);
    const end = {
      from: Math.max(boundaryFromMs, boundaryToMs - stepMs),
      to: boundaryToMs,
    };
    writeWindow(end);
    setCurrentWindow(end);
  }, [pause, writeWindow]);

  // Not wrapped in useCallback — see the same note in SlidingWindowMode.
  const handleTimeStepChange = (newTimeStep: TimeStep) => {
    if (intervalBinding) {
      setVariables({ [event.variableStep]: newTimeStep });
    } else {
      const newEvent: EventReplayModeOptions = { ...event, timeStep: newTimeStep };
      onOptionsChange({ ...options, event: newEvent });
    }
  };

  const openDashboardVariables = () => {
    locationService.partial({ editview: 'variables' }, false);
  };

  if (hasErrors) {
    return (
      <div className={styles.errorWrapper}>
        <Alert severity="error" title="Event Replay configuration">
          {errors.map((msg) => (
            <div key={msg}>{msg}</div>
          ))}
          {variableValidation.errors.length > 0 && (
            <Button size="sm" variant="secondary" icon="external-link-alt" onClick={openDashboardVariables}>
              Open dashboard variables
            </Button>
          )}
        </Alert>
      </div>
    );
  }

  // Boundary is known-good past validation; pre-compute values for render.
  const stepMs = stepToMillis(activeStep);
  const boundarySpan = event.boundaryTo - event.boundaryFrom;
  const displayWindow =
    currentWindow ?? initialWindow(event.boundaryFrom, event.boundaryTo, activeStep);
  const forwardDisabled = displayWindow.to >= event.boundaryTo;
  const backwardDisabled = displayWindow.from <= event.boundaryFrom;
  const jumpToStartDisabled = backwardDisabled;
  const jumpToEndDisabled = forwardDisabled;
  const stepLargerThanBoundary = stepMs > boundarySpan;

  return (
    <div className={styles.wrapper}>
      {warnings.length > 0 && (
        <Alert severity="warning" title="Variable configuration">
          {warnings.map((msg) => (
            <div key={msg}>{msg}</div>
          ))}
          <Button size="sm" variant="secondary" icon="external-link-alt" onClick={openDashboardVariables}>
            Open dashboard variables
          </Button>
        </Alert>
      )}
      {event.showProgressTrack && (
        <div className={styles.trackRow}>
          <WindowProgressTrack
            boundary={{ from: event.boundaryFrom, to: event.boundaryTo }}
            current={displayWindow}
            tickIntervalMs={event.tickIntervalMs}
            onCommit={(next) => {
              setCurrentWindow(next);
              writeWindow(next);
            }}
            onDragStart={pause}
            onNudge={step}
          />
        </div>
      )}
      {event.showCurrentValues && (
        <div className={styles.windowReadout} aria-label="Current window values">
          {dateTime(displayWindow.from).format('YYYY-MM-DD HH:mm:ss')} →{' '}
          {dateTime(displayWindow.to).format('YYYY-MM-DD HH:mm:ss')}
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
            maxMs={boundarySpan}
            intervalBinding={intervalBinding ?? undefined}
          />
        </div>
      </div>
    </div>
  );
};
