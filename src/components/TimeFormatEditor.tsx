import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { Icon, Input, RadioButtonGroup, Tooltip, useStyles2 } from '@grafana/ui';
import { TimeFormat } from '../types';
import { encodeTimeValue } from '../utils/variables';

// Editor for sliding.timeFormat. Renders the three-way radio plus a
// read-only readout of the *current* wall-clock instant encoded in the
// selected format. The readout demonstrates exactly what consumer queries
// will see, which is more useful than parenthetical examples in the
// description — and it stays accurate if the format ever changes shape.

export interface TimeFormatEditorSettings {
  // Long-form explanation rendered behind an ⓘ icon next to the radio.
  // Use for context that doesn't fit in the inline description.
  infoTooltip?: string;
}

// Labels are unit symbols ('ms', 's') rather than full words. The panel-
// options sidebar is narrow; 'Milliseconds' alone consumes most of a row.
// The preview readout below carries the disambiguation work — users see
// exactly what each format outputs without needing verbose labels.
const OPTIONS: Array<{ value: TimeFormat; label: string }> = [
  { value: 'ms', label: 'ms' },
  { value: 's', label: 's' },
  { value: 'iso', label: 'ISO 8601' },
];

const getStyles = (theme: GrafanaTheme2) => ({
  // Tight vertical stack: radio above, preview below, no extra chrome. The
  // panel-options sidebar is narrow, so a Field wrapper would just add
  // empty vertical real estate.
  wrapper: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
  `,
  radioRow: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
  `,
  radioSlot: css`
    flex: 1 1 auto;
    min-width: 0;
  `,
  infoIcon: css`
    color: ${theme.colors.text.secondary};
    cursor: help;
    flex-shrink: 0;
  `,
  previewLabel: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
});

export const TimeFormatEditor: React.FC<StandardEditorProps<TimeFormat, TimeFormatEditorSettings>> = ({
  value,
  onChange,
  item,
}) => {
  const styles = useStyles2(getStyles);
  const infoTooltip = item?.settings?.infoTooltip;

  // Tick the readout once a second so the seconds/ms representations visibly
  // advance. The ISO format only changes every full second, but seeing it
  // change at all is the point — it makes the read-only field feel live
  // rather than decorative.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const preview = encodeTimeValue(nowMs, value ?? 'ms');

  return (
    <div className={styles.wrapper}>
      <div className={styles.radioRow}>
        <div className={styles.radioSlot}>
          <RadioButtonGroup<TimeFormat>
            options={OPTIONS}
            value={value}
            onChange={onChange}
            fullWidth
          />
        </div>
        {infoTooltip && (
          <Tooltip content={infoTooltip} placement="top">
            <span className={styles.infoIcon} aria-label="More info" role="button" tabIndex={0}>
              <Icon name="info-circle" />
            </span>
          </Tooltip>
        )}
      </div>
      <div>
        <div className={styles.previewLabel}>Current time, in this format</div>
        <Input value={preview} readOnly aria-label="Time format preview" />
      </div>
    </div>
  );
};
