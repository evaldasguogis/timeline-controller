import React from 'react';
import { css } from '@emotion/css';
import { dateTime, GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { DateTimePicker, useStyles2 } from '@grafana/ui';

// Editor for an Event Replay boundary endpoint. Renders Grafana's
// DateTimePicker bound to a single absolute-ms timestamp. The two endpoints
// (`boundaryFrom`, `boundaryTo`) get one editor each rather than a fused
// time-range picker — keeps each editor self-contained, and the panel's
// "Lower/Upper bound to variable" pattern already accustoms the user to
// configuring the two endpoints separately.
//
// Stored value: absolute Unix milliseconds. 0 means "not set" — the
// EventReplayMode validator flags this as an error and surfaces a banner
// pointing the user back here.

const getStyles = (theme: GrafanaTheme2) => ({
  // DateTimePicker is comfortable taking the full width of the option row.
  wrapper: css`
    display: flex;
    width: 100%;
    > * {
      width: 100%;
    }
  `,
  hint: css`
    margin-top: ${theme.spacing(0.5)};
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    line-height: ${theme.typography.bodySmall.lineHeight};
  `,
});

export const EventBoundaryEditor: React.FC<StandardEditorProps<number>> = ({ value, onChange }) => {
  const styles = useStyles2(getStyles);

  // Treat 0 / undefined as "not set" — show the picker empty.
  const date = value && value > 0 ? dateTime(value) : undefined;
  const unset = date === undefined;

  return (
    <div>
      <div className={styles.wrapper}>
        <DateTimePicker
          date={date}
          onChange={(next) => {
            // DateTimePicker yields undefined when the user clears the
            // input — preserve "not set" semantics by writing 0.
            onChange(next ? next.valueOf() : 0);
          }}
          showSeconds
        />
      </div>
      {unset && <div className={styles.hint}>Pick a date and time to set this endpoint.</div>}
    </div>
  );
};
