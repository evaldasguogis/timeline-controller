import React, { useEffect, useReducer } from 'react';
import { css } from '@emotion/css';
import { EventBus, GrafanaTheme2, TimeRange } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { Button, useStyles2 } from '@grafana/ui';
import {
  BasicModeOptions,
  HorizontalAlignment,
  TimeStep,
  TimelineControllerOptions,
  VerticalAlignment,
} from '../types';
import { formatTimeBound } from '../utils/timeBound';
import { readIntervalVariable } from '../utils/intervalVariable';
import { setVariables } from '../utils/variables';
import { TimeStepDropdown } from '../components/TimeStepDropdown';
import { PlaybackControls } from '../components/PlaybackControls';
import { useGlobalRangeReplay } from '../hooks/useGlobalRangeReplay';

// Basic mode drives the dashboard's *global* time picker — every time-aware
// panel reacts automatically, so it's the zero-config mode. Sibling to
// `WindowedMode` (Sliding / Event), which writes template variables instead
// and requires dashboard preparation.
//
// All transport / baseline / Reset / external-change-detection lives in
// `useGlobalRangeReplay`. This file is the mode-specific shell: usage-marker
// sync for the optional step variable, step-dropdown wiring, and the
// single-row rendering.

interface Props {
  options: TimelineControllerOptions;
  onOptionsChange: (options: TimelineControllerOptions) => void;
  timeRange: TimeRange;
  // Dashboard-scoped event bus, threaded down from PanelProps. The
  // playback hook subscribes to TimeRangeUpdatedEvent on it to detect
  // external time-picker / refresh changes.
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
  // Single-row layout: transport controls + step dropdown + Reset all sit on
  // one horizontal axis. WindowedMode is stacked (scrubber over controls);
  // Basic has no scrubber, so collapsing to one row keeps the panel compact
  // and lets a Stat / Markdown panel sit next to it without towering over.
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

// Build the synthetic usage marker for Grafana's "Used by panels" scan.
// Single-slot (vs the three-slot helper in WindowedMode) because Basic
// only publishes one optional variable: the step. Auto-synced from
// `variableStep` — users never edit `_variableStep` directly.
const buildUsageMarkers = (b: BasicModeOptions) => ({
  _variableStep: b.variableStep.trim() ? `\${${b.variableStep}}` : '',
});

export const BasicMode: React.FC<Props> = ({ options, onOptionsChange, timeRange, eventBus }) => {
  const basic = options.basic;
  const justifyContent = horizontalToJustify[basic.horizontalAlignment] ?? 'center';
  const alignItems = verticalToAlignItems[basic.verticalAlignment] ?? 'center';
  const styles = useStyles2((theme) => getStyles(theme, justifyContent, alignItems));

  // Our plugin has skipDataQuery, so Grafana won't re-render us when a
  // referenced variable changes. Subscribing to history changes is what
  // keeps the step dropdown in sync when the user picks a step from a
  // bound interval variable's dashboard-level dropdown.
  const [, bumpRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => locationService.getHistory().listen(bumpRender), []);

  // Keep the synthetic usage marker in sync so Grafana's "Used by panels"
  // scan always sees the current `${variableStep}` reference (or empty
  // string when the binding is blank).
  useEffect(() => {
    const expected = buildUsageMarkers(basic);
    if (basic._variableStep !== expected._variableStep) {
      onOptionsChange({ ...options, basic: { ...basic, ...expected } });
    }
  }, [options, onOptionsChange, basic]);

  // Variable-driven step: when the user binds variableStep to a dashboard
  // interval variable, that variable's option list and current value drive
  // the step picker. Returns null when blank/missing/wrong type, in which
  // case we fall back to basic.timeStep.
  const intervalBinding = readIntervalVariable(basic.variableStep);
  const activeStep = intervalBinding?.current ?? basic.timeStep;

  const playback = useGlobalRangeReplay({
    timeRange,
    eventBus,
    step: activeStep,
    tickIntervalMs: basic.tickIntervalMs,
  });

  // Not wrapped in useCallback: every render brings a fresh `basic` (parent
  // deep-merges defaults), so a memo would never hit.
  const handleTimeStepChange = (newTimeStep: TimeStep) => {
    if (intervalBinding) {
      // Variable-driven: write to the dashboard variable. The URL change
      // fires our location listener above, triggering a re-render with the
      // updated `intervalBinding.current`.
      setVariables({ [basic.variableStep]: newTimeStep });
    } else {
      onOptionsChange({ ...options, basic: { ...basic, timeStep: newTimeStep } });
    }
  };

  return (
    <div className={styles.wrapper} {...playback.panelKeyboard}>
      <PlaybackControls
        state={playback.state}
        stepLabel={activeStep}
        backwardDisabled={playback.backwardDisabled}
        forwardDisabled={playback.forwardDisabled}
        onPlayBack={() => playback.startPlayback(false)}
        onPause={playback.pause}
        onPlayForward={() => playback.startPlayback(true)}
        onStepBack={() => playback.step(false)}
        onStepForward={() => playback.step(true)}
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
            <div>Restore the original time range  [R]</div>
            <div className={styles.tooltipSecondary}>
              {formatTimeBound(playback.baselineRaw.from)} → {formatTimeBound(playback.baselineRaw.to)}
            </div>
          </div>
        }
        variant="secondary"
        icon="history-alt"
        disabled={playback.resetDisabled}
        onClick={playback.reset}
      >
        Reset
      </Button>
    </div>
  );
};
