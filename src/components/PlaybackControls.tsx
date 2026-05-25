import React from 'react';
import { css } from '@emotion/css';
import { ButtonGroup, ToolbarButton, useStyles2 } from '@grafana/ui';
import { PlaybackState } from '../hooks/useReplay';

// Visual choices here are anchored to Grafana's native time-range stepper
// (the `«` / `»` next to the time picker): ButtonGroup for the connected
// pill look, ToolbarButton for the framed-icon style, iconSize="xl" for
// 24px glyphs, `angle-double-left/right` for the step icons. Matching the
// native stepper makes the control feel built-in.
//
// Jump-to-start / Jump-to-end are optional: pass `onJumpToStart` and
// `onJumpToEnd` to opt in (the windowed modes do, basic mode doesn't
// since its "timeline" is wall-clock and jumping to either endpoint is
// either meaningless or destructive).

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
  onJumpToStart?: () => void;
  onJumpToEnd?: () => void;
  jumpToStartDisabled?: boolean;
  jumpToEndDisabled?: boolean;
}

const getStyles = () => ({
  // Grafana's icon set has `play` but no `play-backward`, and `step-backward`
  // but no `step-forward`. Flipping the svg horizontally gives us the
  // mirrored variants without inventing custom icons.
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
  onJumpToStart,
  onJumpToEnd,
  jumpToStartDisabled = false,
  jumpToEndDisabled = false,
}) => {
  const styles = useStyles2(getStyles);

  // Tooltips append the keyboard shortcut in brackets — usePlaybackShortcuts
  // wires the same keys at the panel level, so users discover them here
  // without needing a separate help screen.
  return (
    <ButtonGroup aria-label="Playback controls">
      {onJumpToStart && (
        <ToolbarButton
          icon="step-backward"
          aria-label="Jump to start"
          tooltip="Jump to start of range  [Home]"
          disabled={jumpToStartDisabled}
          iconSize="xl"
          onClick={onJumpToStart}
        />
      )}
      <ToolbarButton
        icon="angle-double-left"
        aria-label="Step back"
        tooltip={`Step back by ${stepLabel}  [,]`}
        disabled={backwardDisabled}
        iconSize="xl"
        onClick={onStepBack}
      />
      <ToolbarButton
        icon="play"
        aria-label="Play backward"
        tooltip={`Play backward (${stepLabel} per tick)  [J]`}
        disabled={backwardDisabled}
        variant={state === 'playing-back' ? 'active' : 'default'}
        iconSize="xl"
        className={styles.mirrored}
        onClick={onPlayBack}
      />
      <ToolbarButton
        icon="pause"
        aria-label="Pause"
        tooltip="Pause  [Esc]"
        variant={state === 'paused' ? 'active' : 'default'}
        iconSize="xl"
        onClick={onPause}
      />
      <ToolbarButton
        icon="play"
        aria-label="Play forward"
        tooltip={`Play forward (${stepLabel} per tick)  [K]`}
        disabled={forwardDisabled}
        variant={state === 'playing-forward' ? 'active' : 'default'}
        iconSize="xl"
        onClick={onPlayForward}
      />
      <ToolbarButton
        icon="angle-double-right"
        aria-label="Step forward"
        tooltip={`Step forward by ${stepLabel}  [.]`}
        disabled={forwardDisabled}
        iconSize="xl"
        onClick={onStepForward}
      />
      {onJumpToEnd && (
        <ToolbarButton
          icon="step-backward"
          aria-label="Jump to end"
          tooltip="Jump to end of range  [End]"
          disabled={jumpToEndDisabled}
          iconSize="xl"
          className={styles.mirrored}
          onClick={onJumpToEnd}
        />
      )}
    </ButtonGroup>
  );
};
