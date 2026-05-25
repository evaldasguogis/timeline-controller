import React, { useCallback, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Tooltip, useStyles2 } from '@grafana/ui';
import { formatTimeBound } from '../utils/timeBound';

// Visual position indicator for the window-driven modes (Sliding + Event):
// the wrapper bar represents the configured boundary (dashboard's global
// range for Sliding, panel-saved range for Event), and the inner segment is
// the current window. Lets the user see at a glance both *where* the
// window is and *what fraction* of the range it covers — information the
// old text label couldn't convey without doing arithmetic.
//
// Exact bounds are surfaced via Grafana's <Tooltip> on hover and via
// aria-valuetext for screen readers / tests.
//
// When `onCommit` is provided the segment becomes draggable (pointer + arrow
// keys). The window's width — i.e. the step — is preserved; only the start
// and end shift together. Drag emits one `onCommit` per `tickIntervalMs`
// throttle window plus a final commit on release, so a long drag does not
// flood the backend with variable writes.

interface Range {
  from: number;
  to: number;
}

interface Props {
  // The window's outer boundary; the bar's full width represents [from, to].
  boundary: Range;
  // The current window; rendered as a filled segment positioned and sized
  // relative to the boundary.
  current: Range;
  // Optional: presence enables drag + keyboard nudge. The component does
  // not own the window state — it asks the caller to apply each commit.
  onCommit?: (next: Range) => void;
  // Called once at pointerdown, before any movement. The caller should
  // pause playback so an in-flight tick does not fight the drag.
  onDragStart?: () => void;
  // Arrow-key handler. The component does not know the step size — the
  // caller decides what one nudge means (typically one step forward/back).
  onNudge?: (forward: boolean) => void;
  // Maximum commit cadence during drag. A final commit always fires on
  // release. Only consulted when `onCommit` is set.
  tickIntervalMs?: number;
}

const getStyles = (theme: GrafanaTheme2, interactive: boolean) => ({
  // Outer host: owns the bubbled arrow-key handler and stretches to fill
  // the parent so the inner track does not collapse inside a flex
  // container. Not focusable — Tooltip injects tabIndex=0 onto its child
  // (the wrapper below), and that single Tab stop is enough.
  outer: css`
    width: 100%;
  `,
  wrapper: css`
    position: relative;
    &:focus-visible {
      outline: 2px solid ${theme.colors.primary.main};
      outline-offset: 2px;
    }
    // Fill the container so the parent (panel layout) controls width. The
    // bar reads naturally as a "timeline" when it spans the available row.
    width: 100%;
    height: ${theme.spacing(1.5)};
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    overflow: hidden;
    cursor: default;
    // Stop horizontal pan gestures from scrolling the page while the user
    // is dragging the segment.
    touch-action: ${interactive ? 'none' : 'auto'};
  `,
  segment: css`
    position: absolute;
    top: 0;
    bottom: 0;
    background: ${theme.colors.primary.main};
    border-radius: ${theme.shape.radius.default};
    // Keep a thin slice visible when the window is a sub-pixel fraction of
    // the range (e.g. 1s step inside a 6h boundary) — otherwise the indicator
    // disappears and the bar looks empty.
    min-width: 3px;
    cursor: ${interactive ? 'grab' : 'default'};
    &:active {
      cursor: ${interactive ? 'grabbing' : 'default'};
    }
  `,
});

const pct = (numerator: number, denominator: number): number => {
  if (denominator <= 0) {
    return 0;
  }
  const raw = (numerator / denominator) * 100;
  // Clamp [0, 100] so a window outside the boundary (shouldn't happen post-
  // clamp, but defensive) still renders inside the track instead of overflowing.
  return Math.min(Math.max(raw, 0), 100);
};

const clampRange = (next: Range, boundary: Range): Range => {
  const width = next.to - next.from;
  const maxFrom = boundary.to - width;
  if (maxFrom < boundary.from) {
    // Window wider than the boundary — nothing meaningful to clamp to; leave
    // the caller to decide (in practice this is gated upstream).
    return next;
  }
  const from = Math.min(Math.max(next.from, boundary.from), maxFrom);
  return { from, to: from + width };
};

interface DragState {
  startClientX: number;
  startWindow: Range;
  wrapperWidth: number;
  lastCommitMs: number;
  lastCommittedWindow: Range;
}

export const WindowProgressTrack: React.FC<Props> = ({
  boundary,
  current,
  onCommit,
  onDragStart,
  onNudge,
  tickIntervalMs = 250,
}) => {
  const interactive = onCommit !== undefined;
  const styles = useStyles2(getStyles, interactive);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  // dragWindow shadows `current` during an active drag so the segment
  // tracks the cursor at frame rate, independent of the throttled commits.
  const [dragWindow, setDragWindow] = useState<Range | null>(null);

  const displayWindow = dragWindow ?? current;
  const total = boundary.to - boundary.from;
  const leftPct = pct(displayWindow.from - boundary.from, total);
  const widthPct = pct(displayWindow.to - displayWindow.from, total);
  const valueText = `${formatTimeBound(displayWindow.from)} → ${formatTimeBound(displayWindow.to)}`;

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive) {
        return;
      }
      // Left mouse button only — ignore right-click / middle-click.
      if (event.button !== 0) {
        return;
      }
      const wrapper = wrapperRef.current;
      if (wrapper === null) {
        return;
      }
      const rect = wrapper.getBoundingClientRect();
      dragStateRef.current = {
        startClientX: event.clientX,
        startWindow: current,
        wrapperWidth: rect.width,
        lastCommitMs: performance.now(),
        lastCommittedWindow: current,
      };
      // Pointer capture lets us keep receiving moves even when the cursor
      // leaves the segment (browsers route moves to whoever holds capture).
      (event.target as Element).setPointerCapture?.(event.pointerId);
      onDragStart?.();
      event.preventDefault();
    },
    [interactive, current, onDragStart]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (state === null) {
        return;
      }
      if (state.wrapperWidth <= 0 || total <= 0) {
        return;
      }
      const deltaPx = event.clientX - state.startClientX;
      const deltaMs = (deltaPx / state.wrapperWidth) * total;
      const next = clampRange(
        { from: state.startWindow.from + deltaMs, to: state.startWindow.to + deltaMs },
        boundary
      );
      setDragWindow(next);
      const now = performance.now();
      const changed =
        next.from !== state.lastCommittedWindow.from || next.to !== state.lastCommittedWindow.to;
      if (onCommit && changed && now - state.lastCommitMs >= tickIntervalMs) {
        state.lastCommitMs = now;
        state.lastCommittedWindow = next;
        onCommit(next);
      }
    },
    [boundary, onCommit, tickIntervalMs, total]
  );

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (state === null) {
        return;
      }
      const final = dragWindow;
      dragStateRef.current = null;
      setDragWindow(null);
      try {
        (event.target as Element).releasePointerCapture?.(event.pointerId);
      } catch {
        // The browser may have already released capture on its own (e.g.
        // pointercancel from a system gesture); ignore.
      }
      if (!onCommit || final === null) {
        return;
      }
      const changed =
        final.from !== state.lastCommittedWindow.from ||
        final.to !== state.lastCommittedWindow.to;
      if (changed) {
        onCommit(final);
      }
    },
    [dragWindow, onCommit]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onNudge) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNudge(true);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onNudge(false);
      }
    },
    [onNudge]
  );

  // The outer wrapper exists only to host the arrow-key handler. Tooltip's
  // cloneElement injects tabIndex=0 and Floating-UI event handlers onto its
  // direct child, which would clobber any keyboard handler we put there —
  // so we attach onKeyDown to the outer and let the focused inner bubble
  // events up. Slider role + aria-* live on the inner (the focusable Tab
  // stop) so screen readers announce them when the track has focus, and
  // the outer is intentionally not tabbable to keep the track to ONE Tab
  // stop in spite of Tooltip's injected tabIndex.
  return (
    <div
      className={styles.outer}
      onKeyDown={interactive ? handleKeyDown : undefined}
    >
      {/* Tooltip is forwardRef; pass our ref through it. Putting `ref` on
          the inner div would not work — Tooltip's cloneElement injects its
          own ref via the same prop, overriding ours and leaving
          wrapperRef.current null. */}
      <Tooltip content={valueText} placement="top" ref={wrapperRef}>
        <div
          className={styles.wrapper}
          role={interactive ? 'slider' : 'progressbar'}
          aria-label="Current window"
          aria-valuemin={boundary.from}
          aria-valuemax={boundary.to}
          aria-valuenow={(displayWindow.from + displayWindow.to) / 2}
          aria-valuetext={valueText}
          aria-orientation={interactive ? 'horizontal' : undefined}
        >
          <div
            data-testid="window-segment"
            className={styles.segment}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          />
        </div>
      </Tooltip>
    </div>
  );
};
