import React from 'react';
import { Combobox, ComboboxOption } from '@grafana/ui';
import { defaultTimeStep, TimeStep } from '../types';
import { IntervalVariableBinding } from '../utils/intervalVariable';
import { stepToMillis } from '../utils/timeRange';

// TimeStep is the canonical Grafana duration string ('5m', '1h', '1M'), so
// the dropdown's option list is just an array of those strings — no
// label-to-object lookup needed. Combobox values are string|number and our
// values are strings, which lines up directly.

interface Props {
  value: TimeStep;
  onChange: (value: TimeStep) => void;
  width?: number;
  // Optional upper bound on selectable step durations, in milliseconds.
  // Options whose duration exceeds this are filtered out of the dropdown.
  // Used in sliding-window mode where a step bigger than the dashboard's
  // global range can never slide and would just disable the controls.
  // Combobox itself has no per-option disable — filtering is the cleanest
  // way to keep nonsensical choices off the menu.
  maxMs?: number;
  // When provided, the dropdown's options and current value come from the
  // dashboard interval variable rather than the built-in list. The caller
  // turns onChange into a write to the variable.
  intervalBinding?: IntervalVariableBinding;
}

// Built-in options when no interval variable is bound. Roughly the same
// granularity Grafana's own interval defaults use, plus a few extras at the
// short end for fine-grained scrubbing.
const BUILT_IN_OPTIONS: TimeStep[] = [
  '1s',
  '5s',
  '10s',
  '30s',
  '1m',
  '5m',
  '10m',
  '30m',
  '1h',
  '2h',
  '4h',
  '12h',
  '1d',
  '1w',
  '1M',
  '3M',
  '1y',
];

export const TimeStepDropdown: React.FC<Props> = ({ value, onChange, width = 12, maxMs, intervalBinding }) => {
  // An interval binding fully overrides the built-in list — the binding's
  // source of truth is the dashboard variable, so we don't try to reconcile
  // two overlapping lists.
  const candidateSteps: TimeStep[] = intervalBinding ? intervalBinding.options : BUILT_IN_OPTIONS;
  const selected: TimeStep =
    (intervalBinding ? intervalBinding.current : value) ?? value ?? defaultTimeStep;

  const visibleSteps =
    maxMs === undefined ? candidateSteps : candidateSteps.filter((s) => stepToMillis(s) <= maxMs);

  const options: Array<ComboboxOption<string>> = visibleSteps.map((s) => ({ label: s, value: s }));

  return (
    <Combobox
      aria-label="Step size"
      options={options}
      value={selected}
      width={width}
      onChange={(opt) => {
        if (opt?.value) {
          onChange(opt.value);
        }
      }}
    />
  );
};
