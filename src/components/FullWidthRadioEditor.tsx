import React from 'react';
import { StandardEditorProps, SelectableValue } from '@grafana/data';
import { RadioButtonGroup } from '@grafana/ui';

// Drop-in replacement for Grafana's built-in `addRadio` editor that
// renders the underlying RadioButtonGroup with `fullWidth`, so each
// option fills the panel-options sidebar equally instead of hugging its
// label. Used via `addCustomEditor` and configured the same way as the
// built-in: pass `settings: { options: [...] }`.

export interface FullWidthRadioSettings<T> {
  options: Array<SelectableValue<T>>;
}

export function FullWidthRadioEditor<T extends string>({
  value,
  onChange,
  item,
}: StandardEditorProps<T, FullWidthRadioSettings<T>>) {
  const options = item.settings?.options ?? [];
  return (
    <RadioButtonGroup<T>
      fullWidth
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}
