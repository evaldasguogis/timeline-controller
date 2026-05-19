import { getTemplateSrv, locationService } from '@grafana/runtime';
import { TimeStep } from '../types';
import { parseDuration } from './timeRange';

// Helpers for working with a dashboard `interval` variable as the source of
// step options + current value.
//
// The option list comes from `getTemplateSrv().getVariables()` — that's
// where the variable's definition lives. The *current value* is read from
// the URL (`var-<name>=<duration>`) because Grafana's templating snapshot
// updates asynchronously after a URL change: right after a write we'd
// otherwise see the previous value. The URL is the synchronous source of
// truth; templating's `current.value` is only a fallback for the initial
// load when the URL hasn't picked up a value yet.

interface IntervalOption {
  // Grafana's interval-variable option type uses `value` (string). Sometimes
  // `text` and `value` differ ('auto' vs '$__auto'); we read value.
  value: string;
  text?: string;
}

interface IntervalVariable {
  name: string;
  type: 'interval';
  options?: IntervalOption[];
  current?: IntervalOption;
}

const isValidDuration = (s: string): boolean => parseDuration(s) !== null;

const findIntervalVariable = (name: string): IntervalVariable | null => {
  if (name.trim() === '') {
    return null;
  }
  try {
    const vars = getTemplateSrv().getVariables() as Array<{ name: string; type: string }>;
    const match = vars.find((v) => v.name === name);
    return match && match.type === 'interval' ? (match as unknown as IntervalVariable) : null;
  } catch {
    return null;
  }
};

// What the panel needs to render a variable-driven step picker: the list of
// options and the currently-selected step. Returns null when no usable
// interval variable is bound (either the name is blank, the variable doesn't
// exist, or it's the wrong type) — callers fall back to the built-in list.
export interface IntervalVariableBinding {
  // The variable's option list. Values that aren't valid Grafana duration
  // strings (e.g. `auto` / `$__auto`) are skipped silently.
  options: TimeStep[];
  // The variable's current value. Null when the current isn't a valid
  // duration — caller falls back to a panel-level default.
  current: TimeStep | null;
}

const readCurrentFromUrl = (name: string): TimeStep | null => {
  try {
    const value = new URLSearchParams(locationService.getSearch()).get(`var-${name}`);
    return value && isValidDuration(value) ? value : null;
  } catch {
    return null;
  }
};

export const readIntervalVariable = (name: string): IntervalVariableBinding | null => {
  const variable = findIntervalVariable(name);
  if (!variable) {
    return null;
  }
  const options = (variable.options ?? []).map((opt) => opt.value).filter(isValidDuration);
  // URL first, then templating's snapshot as the initial-load fallback.
  const fromUrl = readCurrentFromUrl(name);
  const fromTemplating = variable.current?.value;
  const fallback = fromTemplating && isValidDuration(fromTemplating) ? fromTemplating : null;
  return { options, current: fromUrl ?? fallback };
};
