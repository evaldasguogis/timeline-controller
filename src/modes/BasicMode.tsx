import React, { useEffect, useReducer } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, TimeRange } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { Button, useStyles2 } from '@grafana/ui';
import { HorizontalAlignment, TimeStep, TimelineControllerOptions, VerticalAlignment } from '../types';
import { formatTimeBound } from '../utils/timeBound';
import { readIntervalVariable } from '../utils/intervalVariable';
import { setVariables } from '../utils/variables';
import { TimeStepDropdown } from '../components/TimeStepDropdown';
import { PlaybackControls } from '../components/PlaybackControls';
import { useGlobalRangeReplay } from '../hooks/useGlobalRangeReplay';

// Basic mode is the zero-config mode: drop the panel on any dashboard and it
// works. It drives the dashboard's *global* time picker — every time-aware
// panel reacts automatically. The other modes write template variables and
// require dashboard preparation; this one doesn't.
//
// The playback engine (transport, baseline tracking, Reset, external-change
// detection, keyboard shortcuts) lives in `useGlobalRangeReplay`. This file
// owns the mode-specific shell: usage-marker sync, the step-dropdown UI,
// and rendering.

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

export const BasicMode: React.FC<Props> = ({ options, onOptionsChange, timeRange }) => {
  const justifyContent = horizontalToJustify[options.basic.horizontalAlignment] ?? 'center';
  const alignItems = verticalToAlignItems[options.basic.verticalAlignment] ?? 'center';
  const styles = useStyles2((theme) => getStyles(theme, justifyContent, alignItems));

  // Variable values live in the URL (`var-<name>=<value>`). Our plugin has
  // `skipDataQuery: true`, so Grafana doesn't include us in its variable-
  // driven re-render path — even though the `_variableStep` field gets us
  // listed as "used by" in dashboard settings, no re-render is scheduled
  // when a referenced variable changes. Subscribing to history changes is
  // the workaround: any URL update (our own writes or external picks via
  // Grafana's variable bar) bumps a render.
  //
  // Known issue: changing options in the editor sometimes leaves a blinking
  // caret on a panel button. Cause not yet identified — see CLAUDE.local.md.
  const [, bumpRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => locationService.getHistory().listen(bumpRender), []);

  // Keep `_variableStep` in sync with `variableStep` so Grafana's static
  // scan always sees the right `${name}` reference. Per-slot field (not a
  // combined marker) means Grafana's "missing variable" hint can point
  // straight at the broken binding. The check short-circuits when already
  // synced, so this is a no-op after the first pass.
  useEffect(() => {
    const expected = options.basic.variableStep ? `\${${options.basic.variableStep}}` : '';
    if (options.basic._variableStep !== expected) {
      onOptionsChange({
        ...options,
        basic: { ...options.basic, _variableStep: expected },
      });
    }
  }, [options, onOptionsChange]);

  // When the user has bound step to a dashboard interval variable, the
  // variable's option list and current value drive the dropdown — the
  // built-in list is bypassed. Resolves to null if the binding is blank,
  // the variable doesn't exist, or it's the wrong type; callers fall back
  // to options.basic.timeStep in that case.
  const intervalBinding = readIntervalVariable(options.basic.variableStep);
  const activeStep = intervalBinding?.current ?? options.basic.timeStep;

  const playback = useGlobalRangeReplay({
    timeRange,
    step: activeStep,
    tickIntervalMs: options.basic.tickIntervalMs,
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
