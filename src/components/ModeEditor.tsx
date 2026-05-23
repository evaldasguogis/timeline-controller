import React from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { RadioButtonGroup, useStyles2 } from '@grafana/ui';
import { Mode } from '../types';

// Editor for `mode`. The standard radio's `description` field carries a
// single blob of text — which works for one-mode descriptions but not for
// comparing modes at-a-glance. This editor renders a per-mode summary
// below the radio, with the currently-selected mode emphasized, so the
// user can read every option's purpose side-by-side while picking. As new
// modes ship, add them to MODES — no other change needed.

interface ModeDescriptor {
  value: Mode;
  label: string;
  // One short line, two clauses separated by an em-dash:
  //   [what it does] — [what it costs / requires]
  // Keeps every mode comparable at a glance.
  summary: string;
}

const MODES: ModeDescriptor[] = [
  {
    value: 'basic',
    label: 'Basic',
    summary:
      'Drives the dashboard\'s global time range — zero setup, works on any dashboard.',
  },
  {
    value: 'sliding',
    label: 'Sliding Window',
    summary:
      'Writes template variables that other panels reference in their queries — requires preparing the dashboard.',
  },
];

const radioOptions = MODES.map((m) => ({ value: m.value, label: m.label }));

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
  `,
  list: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  item: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.25)};
    padding: ${theme.spacing(0.5, 0.75)};
    // Subtle left-border indents every row, then the selected row's border
    // turns colored. Cheaper visually than a full background highlight.
    border-left: 2px solid ${theme.colors.border.weak};
    font-size: ${theme.typography.bodySmall.fontSize};
    line-height: ${theme.typography.bodySmall.lineHeight};
    color: ${theme.colors.text.secondary};
  `,
  itemSelected: css`
    border-left-color: ${theme.colors.primary.main};
    color: ${theme.colors.text.primary};
  `,
  itemLabel: css`
    font-weight: ${theme.typography.fontWeightMedium};
  `,
});

export const ModeEditor: React.FC<StandardEditorProps<Mode>> = ({ value, onChange }) => {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.wrapper}>
      <RadioButtonGroup<Mode>
        options={radioOptions}
        value={value}
        onChange={onChange}
        fullWidth
      />
      <ul className={styles.list} aria-label="Mode descriptions">
        {MODES.map((m) => (
          <li
            key={m.value}
            className={cx(styles.item, value === m.value && styles.itemSelected)}
          >
            <span className={styles.itemLabel}>{m.label}</span>
            <span>{m.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
