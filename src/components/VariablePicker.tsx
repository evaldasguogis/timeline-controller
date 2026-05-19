import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { Combobox, ComboboxOption } from '@grafana/ui';

// Panel-option editor for choosing a dashboard template variable by name.
// Modelled on Grafana's "Repeat by variable" option: a dropdown of the
// dashboard's variables (filtered by the caller's expected type) with a
// sentinel "none" entry pinned at the top. Picking the sentinel writes an
// empty string for the field, which the consumer interprets as "no binding".

export interface VariablePickerSettings {
  // Grafana variable type expected for this slot. Filters the dropdown so
  // the user only sees variables that semantically fit.
  variableType: string;
  // Label for the sentinel "no variable bound" entry. Defaults to "Disabled"
  // to match Grafana's "Repeat by variable" wording; callers can override
  // with something more contextual (e.g. "Use built-in list").
  noneLabel?: string;
}

const NO_VARIABLE_VALUE = '';

export const VariablePicker: React.FC<StandardEditorProps<string, VariablePickerSettings>> = ({
  value,
  onChange,
  item,
}) => {
  const variableType = item.settings?.variableType ?? 'textbox';
  const noneLabel = item.settings?.noneLabel ?? 'Disabled';

  let variables: Array<{ name: string; type: string }> = [];
  try {
    variables = getTemplateSrv().getVariables() as Array<{ name: string; type: string }>;
  } catch {
    // Outside a Grafana runtime (e.g. unit tests). Fall through with an
    // empty list; the sentinel entry still keeps the field usable.
  }

  const variableOptions: Array<ComboboxOption<string>> = variables
    .filter((v) => v.type === variableType)
    .map((v) => ({ value: v.name, label: v.name }));

  const options: Array<ComboboxOption<string>> = [
    { value: NO_VARIABLE_VALUE, label: noneLabel },
    ...variableOptions,
  ];

  // Saved options may name a variable that no longer exists. Surface it
  // anyway so the user can see what's currently stored before they pick
  // something else.
  if (value && !variableOptions.find((o) => o.value === value)) {
    options.push({ value, label: `${value} (missing)` });
  }

  return (
    <Combobox
      options={options}
      value={value ?? NO_VARIABLE_VALUE}
      onChange={(opt) => onChange(opt?.value ?? NO_VARIABLE_VALUE)}
    />
  );
};
