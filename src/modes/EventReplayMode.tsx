import React, { useEffect, useReducer } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { Alert, Button, useStyles2 } from '@grafana/ui';
import {
  EventReplayModeOptions,
  HorizontalAlignment,
  TimeStep,
  TimelineControllerOptions,
  VerticalAlignment,
} from '../types';
import { setVariables } from '../utils/variables';
import { validateVariableConfig } from '../utils/variableValidation';
import { readIntervalVariable } from '../utils/intervalVariable';
import { TimeStepDropdown } from '../components/TimeStepDropdown';
import { PlaybackControls } from '../components/PlaybackControls';
import { WindowProgressTrack } from '../components/WindowProgressTrack';
import { useWindowedReplay } from '../hooks/useWindowedReplay';

// Event Replay is mechanically identical to Sliding Window — same writes,
// same window math — except the boundary is panel-configured rather than
// inherited from the dashboard's global time picker. Pick this when the
// time range being replayed is a specific historical event that should
// stay fixed regardless of what the dashboard's time picker shows.
//
// The window-playback engine lives in `useWindowedReplay`. This file owns
// the mode-specific shell: boundary validation, usage-marker sync, the
// variable-picker / step-dropdown UI, and rendering.

interface Props {
  options: TimelineControllerOptions;
  onOptionsChange: (options: TimelineControllerOptions) => void;
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

  // Same URL-history subscription pattern as the other modes: skipDataQuery
  // means Grafana won't re-render us on variable changes, so we listen for
  // URL updates directly to keep the step dropdown in sync.
  const [, bumpRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => locationService.getHistory().listen(bumpRender), []);

  // Keep the synthetic per-slot usage markers in sync.
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

  const playback = useWindowedReplay({
    boundaryFromMs: event.boundaryFrom,
    boundaryToMs: event.boundaryTo,
    step: activeStep,
    initialPosition: event.initialPosition,
    tickIntervalMs: event.tickIntervalMs,
    variableSpec: { from: event.variableFrom, to: event.variableTo },
    hasErrors,
  });

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

  return (
    <div className={styles.wrapper} {...playback.panelKeyboard}>
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
            current={playback.displayWindow}
            tickIntervalMs={event.tickIntervalMs}
            onCommit={playback.commitWindow}
            onDragStart={playback.pause}
            onNudge={playback.step}
          />
        </div>
      )}
      <div className={styles.controlsRow}>
        <PlaybackControls
          state={playback.state}
          stepLabel={activeStep}
          backwardDisabled={playback.backwardDisabled || playback.stepLargerThanBoundary}
          forwardDisabled={playback.forwardDisabled || playback.stepLargerThanBoundary}
          onPlayBack={() => playback.startPlayback(false)}
          onPause={playback.pause}
          onPlayForward={() => playback.startPlayback(true)}
          onStepBack={() => playback.step(false)}
          onStepForward={() => playback.step(true)}
          onJumpToStart={playback.jumpToStart}
          onJumpToEnd={playback.jumpToEnd}
          jumpToStartDisabled={playback.jumpToStartDisabled}
          jumpToEndDisabled={playback.jumpToEndDisabled}
        />
        <span className={styles.separator} aria-hidden="true" />
        <div className={styles.stepGroup}>
          <span className={styles.stepLabel}>Step</span>
          <TimeStepDropdown
            value={activeStep}
            onChange={handleTimeStepChange}
            maxMs={event.boundaryTo - event.boundaryFrom}
            intervalBinding={intervalBinding ?? undefined}
          />
        </div>
      </div>
    </div>
  );
};
