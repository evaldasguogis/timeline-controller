import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { openDashboardVariables } from '../utils/navigation';
import { Combobox, ComboboxOption, Icon, Tooltip, useStyles2 } from '@grafana/ui';

// Panel-option editor for choosing a dashboard template variable by name.
// Modelled on Grafana's "Repeat by variable" option: a dropdown of the
// dashboard's variables (filtered by the caller's expected type).
//
// Each setting tunes one facet of the picker, composable per slot:
//   - `noneLabel`        — pins a sentinel "no binding" entry at the top
//                          (use for optional slots; the step picker uses it).
//   - `createCustomValue` — lets the user type a name not in the dropdown
//                          (use for required slots where the variable may
//                          not exist at config time — windowed modes'
//                          from/to).
//   - `helperText` (+ `helperTextSeverity`) — contextual hint shown only
//                          when no matching variables exist on the
//                          dashboard. `warning` for required slots that
//                          block the panel; `info` (default) for slots
//                          with a fallback.
//   - `infoTooltip`      — long-form explanation behind an ⓘ next to the
//                          picker; for mechanics that don't fit in the
//                          inline `description`.

export interface VariablePickerSettings {
  // Grafana variable type expected for this slot. Filters the dropdown so
  // the user only sees variables that semantically fit.
  variableType: string;
  // When set, a sentinel entry with this label is pinned at the top and
  // selecting it writes an empty string. Use for optional slots. The
  // canonical example is the step picker's "None — use built-in steps".
  noneLabel?: string;
  // When true, the user can type a name that isn't in the dropdown. Use for
  // required slots where the variable may not exist yet at config time.
  createCustomValue?: boolean;
  // Onboarding hint shown only when the dashboard has no variables matching
  // `variableType` — the only state where this advice is actionable. When
  // variables already exist, the hint is noise. The text is wrapped in a
  // link that opens the dashboard's Variables settings.
  helperText?: string;
  // Visual treatment of the hint. `warning` (amber + exclamation-triangle)
  // for required slots where missing variables block the panel (windowed
  // modes' from/to). `info` (blue + info-circle) for optional slots where
  // a fallback exists (the step picker uses the built-in list when nothing
  // is bound). Defaults to `info` — the quieter choice; `warning` is opt-in.
  helperTextSeverity?: 'info' | 'warning';
  // Long-form explanation rendered behind an ⓘ icon next to the picker.
  // Use for mechanics that don't fit in the inline `description` Grafana
  // shows under the label — e.g. how downstream queries are supposed to
  // reference this variable. Plain string; line breaks collapse (Grafana's
  // Tooltip doesn't preserve them).
  infoTooltip?: string;
}

const NO_VARIABLE_VALUE = '';

// Tone-specific link colors. Same layout, same hover behavior, only the
// foreground color changes — keeps the two variants visually parallel
// while the severity still reads at a glance.
const hintLinkBase = (theme: GrafanaTheme2) => css`
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing(0.5)};
  font-size: ${theme.typography.bodySmall.fontSize};
  line-height: ${theme.typography.bodySmall.lineHeight};
  text-align: left;
  // The link sits in a config sidebar — match Grafana's secondary-action
  // styling: no underline at rest, underline on hover so it reads as
  // interactive but doesn't shout.
  &:hover {
    text-decoration: underline;
  }
`;

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
  `,
  pickerRow: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
  `,
  pickerSlot: css`
    // The Combobox should consume all the row width that isn't claimed by
    // the info icon. Without flex-grow it shrinks to its content's natural
    // width and the icon hugs the input instead of floating to the right.
    flex: 1 1 auto;
    min-width: 0;
  `,
  infoIcon: css`
    color: ${theme.colors.text.secondary};
    cursor: help;
    flex-shrink: 0;
  `,
  warningLink: css`
    ${hintLinkBase(theme)};
    color: ${theme.colors.warning.text};
    &:hover {
      color: ${theme.colors.warning.text};
    }
  `,
  infoLink: css`
    ${hintLinkBase(theme)};
    color: ${theme.colors.info.text};
    &:hover {
      color: ${theme.colors.info.text};
    }
  `,
  hintIcon: css`
    // Nudge the icon down so it sits visually centered with the first
    // line of text rather than aligned to the very top of the row.
    margin-top: 2px;
    flex-shrink: 0;
  `,
});

// Anchor click handler: preventDefault stops the browser from following the
// href, then we use Grafana's deep link to open the dashboard's Variables
// settings overlay without a full reload.
const handleHintClick = (e: React.MouseEvent) => {
  e.preventDefault();
  openDashboardVariables();
};

export const VariablePicker: React.FC<StandardEditorProps<string, VariablePickerSettings>> = ({
  value,
  onChange,
  item,
}) => {
  const styles = useStyles2(getStyles);
  const variableType = item.settings?.variableType ?? 'textbox';
  const noneLabel = item.settings?.noneLabel;
  const createCustomValue = item.settings?.createCustomValue ?? false;
  const helperText = item.settings?.helperText;
  const helperTextSeverity = item.settings?.helperTextSeverity ?? 'info';
  const infoTooltip = item.settings?.infoTooltip;

  let variables: Array<{ name: string; type: string }> = [];
  try {
    variables = getTemplateSrv().getVariables() as Array<{ name: string; type: string }>;
  } catch {
    // Outside a Grafana runtime (e.g. unit tests). Fall through with an
    // empty list; the sentinel entry or createCustomValue keeps the field
    // usable anyway.
  }

  const variableOptions: Array<ComboboxOption<string>> = variables
    .filter((v) => v.type === variableType)
    .map((v) => ({ value: v.name, label: v.name }));

  const options: Array<ComboboxOption<string>> = [];
  if (noneLabel !== undefined) {
    options.push({ value: NO_VARIABLE_VALUE, label: noneLabel });
  }
  options.push(...variableOptions);

  // Saved options may name a variable that no longer exists. Surface it
  // anyway so the user can see what's currently stored before they pick
  // something else.
  if (value && !variableOptions.find((o) => o.value === value)) {
    options.push({ value, label: `${value} (missing)` });
  }

  // Pick "a" vs "an" so the placeholder reads naturally for vowel-initial
  // variable types ("an interval variable" vs "a textbox variable").
  const article = /^[aeiou]/i.test(variableType) ? 'an' : 'a';
  const placeholder =
    variableOptions.length === 0
      ? `No ${variableType} variables on this dashboard`
      : `Select ${article} ${variableType} variable`;

  // Only show the onboarding hint when there's nothing for the user to
  // pick — otherwise the hint is redundant with the populated dropdown.
  const showHint = helperText !== undefined && variableOptions.length === 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.pickerRow}>
        <div className={styles.pickerSlot}>
          <Combobox
            options={options}
            value={value ?? NO_VARIABLE_VALUE}
            createCustomValue={createCustomValue}
            placeholder={placeholder}
            onChange={(opt) => onChange(opt?.value ?? NO_VARIABLE_VALUE)}
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
      {showHint && (
        <a
          href="?editview=variables"
          className={helperTextSeverity === 'warning' ? styles.warningLink : styles.infoLink}
          role="status"
          onClick={handleHintClick}
        >
          <Icon
            name={helperTextSeverity === 'warning' ? 'exclamation-triangle' : 'info-circle'}
            className={styles.hintIcon}
          />
          <span>{helperText}</span>
        </a>
      )}
    </div>
  );
};
