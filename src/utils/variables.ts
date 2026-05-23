import { dateTime } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { TimeFormat } from '../types';

// Template-variable values are stored as `var-<name>` URL query parameters.
// Writing through locationService is the canonical entry point — it propagates
// the change to every consumer on the dashboard (queries, repeat, panel
// re-renders). Updating `window.location` directly would not.

export type VariableValues = Record<string, string>;

// Write a batch of template variables. Pass plain variable names — the
// `var-` prefix is added here so callers don't have to know about the URL
// encoding. partial(params, true) merges into the current URL and replaces
// the history entry — we don't want every tick creating a back-button
// breadcrumb.
export const setVariables = (values: VariableValues) => {
  const params: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    params[`var-${name}`] = value;
  }
  locationService.partial(params, true);
};

// Encode an absolute-ms timestamp into the string form the configured data
// source can parse in a query's time-filter position. The encoding is the
// integration contract between Timeline Controller and the downstream
// variable-aware data source — if you change a format here, every consumer
// query has to know.
export const encodeTimeValue = (ms: number, format: TimeFormat): string => {
  switch (format) {
    case 'ms':
      return String(ms);
    case 's':
      // Floor rather than round: a half-second forward of the intended moment
      // is a query that returns more data than expected. Floor is the
      // conservative direction for a lower bound and a one-tick-narrow upper
      // bound, which is the safer failure mode.
      return String(Math.floor(ms / 1000));
    case 'iso':
      // UTC ISO-8601, no millisecond suffix. Stable across timezones and
      // human-readable in URLs, which matters when debugging from the address
      // bar. Removing fractional seconds keeps the URL tidy without losing
      // useful precision at our second-floored tick granularity.
      return dateTime(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
};
