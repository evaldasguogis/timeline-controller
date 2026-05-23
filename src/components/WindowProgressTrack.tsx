import React from 'react';
import { css } from '@emotion/css';
import { dateTime, GrafanaTheme2 } from '@grafana/data';
import { Tooltip, useStyles2 } from '@grafana/ui';

// Visual position indicator for the sliding window: the wrapper bar is the
// dashboard's global range, the inner segment is the current window. Lets the
// user see at a glance both *where* the window is and *what fraction* of
// the range it covers — information the old text label couldn't convey
// without doing arithmetic.
//
// Exact bounds are surfaced via Grafana's <Tooltip> on hover and via
// aria-valuetext for screen readers / tests.

interface Range {
  from: number;
  to: number;
}

interface Props {
  // The dashboard's global range; the bar's full width represents [from, to].
  boundary: Range;
  // The current sliding window; rendered as a filled segment positioned and
  // sized relative to the boundary.
  current: Range;
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    position: relative;
    // Fill the container so the parent (panel layout) controls width. The
    // bar reads naturally as a "timeline" when it spans the available row.
    width: 100%;
    height: ${theme.spacing(1.5)};
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    overflow: hidden;
    cursor: default;
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
  `,
});

const formatBound = (ms: number): string => dateTime(ms).format('YYYY-MM-DD HH:mm:ss');

const pct = (numerator: number, denominator: number): number => {
  if (denominator <= 0) {
    return 0;
  }
  const raw = (numerator / denominator) * 100;
  // Clamp [0, 100] so a window outside the boundary (shouldn't happen post-
  // clamp, but defensive) still renders inside the track instead of overflowing.
  return Math.min(Math.max(raw, 0), 100);
};

export const WindowProgressTrack: React.FC<Props> = ({ boundary, current }) => {
  const styles = useStyles2(getStyles);
  const total = boundary.to - boundary.from;
  const leftPct = pct(current.from - boundary.from, total);
  const widthPct = pct(current.to - current.from, total);

  const valueText = `${formatBound(current.from)} → ${formatBound(current.to)}`;

  return (
    <Tooltip content={valueText} placement="top">
      <div
        className={styles.wrapper}
        role="progressbar"
        aria-label="Current window"
        aria-valuemin={boundary.from}
        aria-valuemax={boundary.to}
        aria-valuenow={(current.from + current.to) / 2}
        aria-valuetext={valueText}
      >
        <div className={styles.segment} style={{ left: `${leftPct}%`, width: `${widthPct}%` }} />
      </div>
    </Tooltip>
  );
};
