import { locationService } from '@grafana/runtime';

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
