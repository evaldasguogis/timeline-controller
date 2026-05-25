import React, { useEffect, useReducer } from 'react';
import { css } from '@emotion/css';
import { EventBus, GrafanaTheme2 } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { Alert, Button, useStyles2 } from '@grafana/ui';
import {
  HorizontalAlignment,
  TimeStep,
  VerticalAlignment,
  WindowedModeOptions,
} from '../types';
import { setVariables } from '../utils/variables';
import { validateVariableConfig } from '../utils/variableValidation';
import { readIntervalVariable } from '../utils/intervalVariable';
import { openDashboardVariables } from '../utils/navigation';
import { TimeStepDropdown } from '../components/TimeStepDropdown';
import { PlaybackControls } from '../components/PlaybackControls';
import { WindowProgressTrack } from '../components/WindowProgressTrack';
import { useWindowedReplay } from '../hooks/useWindowedReplay';

// Shared shell for the two variable-driven modes: Sliding Window (boundary
// from the dashboard's global range, with an event-bus subscription so the
// window re-seeds when the picker changes) and Event Replay (boundary saved
// in the panel options). They differ only in where the boundary comes from
// and a few cosmetics — everything else (validation, usage-marker sync,
// keyboard plumbing, the variable-picker / step-dropdown / progress-track
// JSX) is identical and lives here.

interface WindowedModeProps<T extends WindowedModeOptions> {
  // The mode's own sub-options object (options.sliding or options.event).
  modeOptions: T;
  // Writes back the updated sub-options. The parent adapter knows whether
  // that's `{ ...options, sliding: next }` or `{ ...options, event: next }`.
  onModeOptionsChange: (next: T) => void;
  // The window boundary. Sliding mode passes timeRange.from/to; Event mode
  // passes the saved boundaryFrom/boundaryTo.
  boundaryFromMs: number;
  boundaryToMs: number;
  // Dashboard-scoped event bus. Sliding passes it through so the playback
  // hook can re-seed on TimeRangeUpdatedEvent; Event omits it (its boundary
  // is panel-saved, never moves out from under us).
  eventBus?: EventBus;
  // Mode-specific errors to merge with the shared variable-validation
  // errors. Event passes its boundary-validation errors; Sliding passes
  // nothing.
  extraErrors?: string[];
}

// One title for the error/warning Alert across both modes. The individual
// error messages are descriptive on their own ("Event boundary is not
// set...", `Variable name "from" is required.`), so the title only needs
// to flag *that* this is a configuration problem.
const ALERT_TITLE = 'Panel configuration';

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
  // `flex-direction: column` swaps the axes: justify-content controls the
  // *vertical* main axis (so we pass `alignItems` here, named after the
  // intent) and align-items controls the horizontal cross axis.
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

// Build the synthetic per-slot usage markers Grafana's dashboard-settings
// scan reads. One field per published variable, each holding `${name}`
// when bound and empty string otherwise. Per-slot (not one combined
// marker) so Grafana's "missing variable" hint points at the specific
// binding — `_variableFrom`, `_variableTo`, or `_variableStep` — which
// tells the user immediately which one is broken.
const buildUsageMarkers = (modeOptions: WindowedModeOptions) => ({
  _variableFrom: modeOptions.variableFrom.trim() ? `\${${modeOptions.variableFrom}}` : '',
  _variableTo: modeOptions.variableTo.trim() ? `\${${modeOptions.variableTo}}` : '',
  _variableStep: modeOptions.variableStep.trim() ? `\${${modeOptions.variableStep}}` : '',
});

export const WindowedMode = <T extends WindowedModeOptions>({
  modeOptions,
  onModeOptionsChange,
  boundaryFromMs,
  boundaryToMs,
  eventBus,
  extraErrors,
}: WindowedModeProps<T>): React.ReactElement => {
  const justifyContent = horizontalToJustify[modeOptions.horizontalAlignment] ?? 'center';
  const alignItems = verticalToAlignItems[modeOptions.verticalAlignment] ?? 'center';
  const styles = useStyles2((theme) => getStyles(theme, justifyContent, alignItems));

  // Our plugin has skipDataQuery, so Grafana won't re-render us when a
  // referenced variable changes. Subscribing to history changes is what
  // keeps the step dropdown in sync when the user picks a step from a
  // bound interval variable's dashboard-level dropdown.
  const [, bumpRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => locationService.getHistory().listen(bumpRender), []);

  // Keep the synthetic per-slot usage markers in sync so Grafana's "Used
  // by panels" scan always sees the current set of `${name}` references.
  useEffect(() => {
    const expected = buildUsageMarkers(modeOptions);
    if (
      modeOptions._variableFrom !== expected._variableFrom ||
      modeOptions._variableTo !== expected._variableTo ||
      modeOptions._variableStep !== expected._variableStep
    ) {
      onModeOptionsChange({ ...modeOptions, ...expected });
    }
  }, [modeOptions, onModeOptionsChange]);

  // Variable-driven step: when the user binds variableStep to a dashboard
  // interval variable, that variable's option list and current value drive
  // the step picker. Returns null when blank/missing/wrong type, in which
  // case we fall back to modeOptions.timeStep.
  const intervalBinding = readIntervalVariable(modeOptions.variableStep);
  const activeStep = intervalBinding?.current ?? modeOptions.timeStep;

  // Re-validate on every render. Cheap (a handful of array scans) and we
  // need it fresh anyway: dashboard variables can be added/removed while
  // the panel is mounted.
  const variableValidation = validateVariableConfig(modeOptions);
  const errors = [...(extraErrors ?? []), ...variableValidation.errors];
  const warnings = variableValidation.warnings;
  const hasErrors = errors.length > 0;

  const playback = useWindowedReplay({
    boundaryFromMs,
    boundaryToMs,
    step: activeStep,
    initialPosition: modeOptions.initialPosition,
    tickIntervalMs: modeOptions.tickIntervalMs,
    variableSpec: { from: modeOptions.variableFrom, to: modeOptions.variableTo },
    hasErrors,
    eventBus,
  });

  // Not wrapped in useCallback: every render brings a fresh modeOptions
  // (parent deep-merges defaults), so a memo would never hit.
  const handleTimeStepChange = (newTimeStep: TimeStep) => {
    if (intervalBinding) {
      // Variable-driven: write to the dashboard variable. The URL change
      // fires our location listener above, triggering a re-render with the
      // updated `intervalBinding.current`.
      setVariables({ [modeOptions.variableStep]: newTimeStep });
    } else {
      onModeOptionsChange({ ...modeOptions, timeStep: newTimeStep });
    }
  };

  // Errors fully replace the controls: the panel can't do its job in this
  // state and pretending otherwise would just confuse the user. The
  // "Open dashboard variables" button only renders when at least one of
  // the errors is variable-related — boundary-only errors (Event Replay)
  // don't link to the variables overlay.
  if (hasErrors) {
    return (
      <div className={styles.errorWrapper}>
        <Alert severity="error" title={ALERT_TITLE}>
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
        <Alert severity="warning" title={ALERT_TITLE}>
          {warnings.map((msg) => (
            <div key={msg}>{msg}</div>
          ))}
          <Button size="sm" variant="secondary" icon="external-link-alt" onClick={openDashboardVariables}>
            Open dashboard variables
          </Button>
        </Alert>
      )}
      {modeOptions.showProgressTrack && (
        <div className={styles.trackRow}>
          <WindowProgressTrack
            boundary={{ from: boundaryFromMs, to: boundaryToMs }}
            current={playback.displayWindow}
            tickIntervalMs={modeOptions.tickIntervalMs}
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
            maxMs={boundaryToMs - boundaryFromMs}
            intervalBinding={intervalBinding ?? undefined}
          />
        </div>
      </div>
    </div>
  );
};
