import React, { useEffect, useReducer } from 'react';
import { css } from '@emotion/css';
import { EventBus, GrafanaTheme2, TimeRange } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { Alert, Button, useStyles2 } from '@grafana/ui';
import {
  HorizontalAlignment,
  SlidingWindowModeOptions,
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

// Sliding Window mode writes a pair of template variables instead of driving
// the global time range. The consumer data source uses the variables in its
// query (typically as a WHERE bound), so this mode requires dashboard
// preparation — variables must exist and the consumer panel's queries must
// reference them. The window is one timeStep wide and slides forward/back
// across the dashboard's global range; the global range is the boundary.
//
// The window-playback engine (window state, transport, seed-on-mount,
// step-resize, jump handlers, keyboard shortcuts) lives in
// `useWindowedReplay`. This file owns the mode-specific shell: validation,
// usage-marker sync, the variable-picker / step-dropdown UI, and rendering.

interface Props {
  options: TimelineControllerOptions;
  onOptionsChange: (options: TimelineControllerOptions) => void;
  timeRange: TimeRange;
  // Dashboard-scoped event bus, threaded down from PanelProps. Passed to
  // useWindowedReplay so it can subscribe to TimeRangeUpdatedEvent and
  // re-seed when the user changes the global time picker. (Event mode
  // doesn't need this — its boundary is panel-saved.)
  eventBus: EventBus;
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
const buildUsageMarkers = (sliding: SlidingWindowModeOptions) => ({
  _variableFrom: sliding.variableFrom.trim() ? `\${${sliding.variableFrom}}` : '',
  _variableTo: sliding.variableTo.trim() ? `\${${sliding.variableTo}}` : '',
  _variableStep: sliding.variableStep.trim() ? `\${${sliding.variableStep}}` : '',
});

export const SlidingWindowMode: React.FC<Props> = ({ options, onOptionsChange, timeRange, eventBus }) => {
  const sliding = options.sliding;
  const justifyContent = horizontalToJustify[sliding.horizontalAlignment] ?? 'center';
  const alignItems = verticalToAlignItems[sliding.verticalAlignment] ?? 'center';
  const styles = useStyles2((theme) => getStyles(theme, justifyContent, alignItems));

  // Mirror BasicMode's URL-history subscription: our plugin has
  // skipDataQuery, so Grafana won't re-render us when a referenced variable
  // changes. Subscribing to history changes is what keeps the step dropdown
  // in sync when the user picks a step from a bound interval variable's
  // dashboard-level dropdown.
  const [, bumpRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => locationService.getHistory().listen(bumpRender), []);

  // Keep the synthetic per-slot usage markers in sync so Grafana's "Used
  // by panels" scan always sees the current set of `${name}` references.
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

  const boundaryFromMs = timeRange.from.valueOf();
  const boundaryToMs = timeRange.to.valueOf();

  const playback = useWindowedReplay({
    boundaryFromMs,
    boundaryToMs,
    step: activeStep,
    initialPosition: sliding.initialPosition,
    tickIntervalMs: sliding.tickIntervalMs,
    variableSpec: { from: sliding.variableFrom, to: sliding.variableTo },
    hasErrors,
    eventBus,
  });

  // Not wrapped in useCallback: every dep (`intervalBinding`, `sliding`,
  // `options`) is a fresh reference each render, so useCallback wouldn't
  // stabilize the returned function — it'd just add deps-checking overhead.
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
    <div className={styles.wrapper} {...playback.panelKeyboard}>
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
            boundary={{ from: boundaryFromMs, to: boundaryToMs }}
            current={playback.displayWindow}
            tickIntervalMs={sliding.tickIntervalMs}
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
