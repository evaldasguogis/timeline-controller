import React from 'react';
import { Combobox, ComboboxOption } from '@grafana/ui';
import { defaultTimeStep, TimeStep } from '../types';

// Combobox requires its values to be string | number — it can't hold object
// values like `Select` could. So labels ('5m', '1h', …) double as the keys,
// and we maintain a flat lookup map to convert each label to its {value, unit}
// pair. This also gives us a canonical label per TimeStep for tooltip
// rendering elsewhere (see `formatTimeStep`).

interface Props {
  value: TimeStep;
  onChange: (value: TimeStep) => void;
  width?: number;
}

const timeStepByLabel: Record<string, TimeStep> = {
  '1s': { value: 1, unit: 's' },
  '5s': { value: 5, unit: 's' },
  '10s': { value: 10, unit: 's' },
  '30s': { value: 30, unit: 's' },
  '1m': { value: 1, unit: 'm' },
  '5m': { value: 5, unit: 'm' },
  '10m': { value: 10, unit: 'm' },
  '30m': { value: 30, unit: 'm' },
  '1h': { value: 1, unit: 'h' },
  '2h': { value: 2, unit: 'h' },
  '4h': { value: 4, unit: 'h' },
  '12h': { value: 12, unit: 'h' },
  '1d': { value: 1, unit: 'd' },
  '1w': { value: 1, unit: 'w' },
  '1mo': { value: 1, unit: 'month' },
  '3mo': { value: 3, unit: 'month' },
  '1y': { value: 1, unit: 'y' },
};

const options: Array<ComboboxOption<string>> = Object.keys(timeStepByLabel).map((label) => ({ label, value: label }));

const findLabel = (timeStep: TimeStep): string | undefined => {
  const entry = Object.entries(timeStepByLabel).find(
    ([, ts]) => ts.value === timeStep.value && ts.unit === timeStep.unit
  );
  return entry?.[0];
};

export const formatTimeStep = (timeStep: TimeStep): string => findLabel(timeStep) ?? `${timeStep.value}${timeStep.unit}`;

export const TimeStepDropdown: React.FC<Props> = ({ value, onChange, width = 12 }) => {
  const selectedLabel = findLabel(value ?? defaultTimeStep) ?? findLabel(defaultTimeStep);

  return (
    <Combobox
      aria-label="Step size"
      options={options}
      value={selectedLabel ?? null}
      width={width}
      onChange={(opt) => {
        if (opt?.value && timeStepByLabel[opt.value]) {
          onChange(timeStepByLabel[opt.value]);
        }
      }}
    />
  );
};
