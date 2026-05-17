import React from 'react';
import { css } from '@emotion/css';
import { ButtonGroup, ToolbarButton, useStyles2 } from '@grafana/ui';

// Visual choices here are anchored to Grafana's native time-range stepper
// (the `«` / `»` next to the time picker): ButtonGroup for the connected
// pill look, ToolbarButton for the framed-icon style, iconSize="xl" for
// 24px glyphs, `angle-double-left/right` for the step icons. Matching the
// native stepper makes the control feel built-in.

export type PlaybackState = 'playing-back' | 'playing-forward' | 'paused';

interface Props {
  state: PlaybackState;
  stepLabel: string;
  backwardDisabled?: boolean;
  forwardDisabled?: boolean;
  onPlayBack: () => void;
  onPause: () => void;
  onPlayForward: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
}

const getStyles = () => ({
  // Grafana's icon set has `play` but no `play-backward`. Flipping the svg
  // horizontally gives us a left-pointing triangle that reads as "play
  // backward" without inventing a custom icon.
  mirrored: css`
    svg {
      transform: scaleX(-1);
    }
  `,
});

export const PlaybackControls: React.FC<Props> = ({
  state,
  stepLabel,
  backwardDisabled = false,
  forwardDisabled = false,
  onPlayBack,
  onPause,
  onPlayForward,
  onStepBack,
  onStepForward,
}) => {
  const styles = useStyles2(getStyles);

  return (
    <ButtonGroup aria-label="Playback controls">
      <ToolbarButton
        icon="angle-double-left"
        aria-label="Step back"
        tooltip={`Step back by ${stepLabel}`}
        disabled={backwardDisabled}
        iconSize="xl"
        onClick={onStepBack}
      />
      <ToolbarButton
        icon="play"
        aria-label="Play backward"
        tooltip={`Play backward (${stepLabel} per tick)`}
        disabled={backwardDisabled}
        variant={state === 'playing-back' ? 'active' : 'default'}
        iconSize="xl"
        className={styles.mirrored}
        onClick={onPlayBack}
      />
      <ToolbarButton
        icon="pause"
        aria-label="Pause"
        tooltip="Pause"
        variant={state === 'paused' ? 'active' : 'default'}
        iconSize="xl"
        onClick={onPause}
      />
      <ToolbarButton
        icon="play"
        aria-label="Play forward"
        tooltip={`Play forward (${stepLabel} per tick)`}
        disabled={forwardDisabled}
        variant={state === 'playing-forward' ? 'active' : 'default'}
        iconSize="xl"
        onClick={onPlayForward}
      />
      <ToolbarButton
        icon="angle-double-right"
        aria-label="Step forward"
        tooltip={`Step forward by ${stepLabel}`}
        disabled={forwardDisabled}
        iconSize="xl"
        onClick={onStepForward}
      />
    </ButtonGroup>
  );
};
