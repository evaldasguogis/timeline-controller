// A step size in Grafana duration syntax: `<integer><unit-letter>`.
// Valid units: `s` (second), `m` (minute), `h` (hour), `d` (day), `w` (week),
// `M` (month — uppercase because lowercase `m` is minutes), `y` (year).
// Examples: `30s`, `5m`, `1h`, `1M`, `1y`.
//
// Stored as the Grafana-native string so it matches what users see in the
// dashboard's interval-variable picker and what downstream queries can
// substitute directly into a duration position. Math sites parse it on
// demand via `parseDuration` in `utils/timeRange`.
export type TimeStep = string;

export const defaultTimeStep: TimeStep = '1m';

export type HorizontalAlignment = 'left' | 'center' | 'right';
export type VerticalAlignment = 'top' | 'middle' | 'bottom';

// Modes are fundamentally different things, so they're a discriminator on the
// top-level options rather than a boolean flag. Each mode has its own option
// sub-object — they don't share defaults, and most options aren't meaningful
// outside their own mode.
export type Mode = 'basic' | 'sliding';

// How an absolute timestamp is encoded into the variable. Mirrors Grafana's
// built-in $__from/$__to flavors:
//   ms   — Unix milliseconds      (like `$__from`)
//   s    — Unix seconds           (like `${__from:date:seconds}`)
//   iso  — ISO-8601 UTC           (like `${__from:date:iso}`)
export type TimeFormat = 'ms' | 's' | 'iso';

// timeStep and tickIntervalMs are deliberately separate concepts:
//   timeStep      = how *much* the window moves on each tick (e.g. 5m)
//   tickIntervalMs = how *often* a tick happens (e.g. every 1000ms)
// Collapsing them into a single "speed" knob would conflate UX pace with
// data-source request rate — and "5 minutes per second" is the kind of
// thing you'd choose if you weren't worried about request volume.
export interface BasicModeOptions {
  timeStep: TimeStep;
  tickIntervalMs: number;
  // Optional: name of a dashboard `interval` variable that drives the step
  // picker. When set, the step dropdown reads its options and current value
  // from that variable instead of the built-in list. Leave blank for the
  // zero-config drop-in experience.
  variableStep: string;
  // Synthetic field for Grafana's static "Used by panels" scan. Holds
  // `${variableStep}` whenever variableStep is set, so the variable's
  // settings page recognises this panel as a consumer. Mirroring the
  // option name with a `_` prefix means Grafana's "missing variable" hint
  // points at `_variableStep` — which tells the user immediately which
  // binding is broken instead of pointing at a generic marker field.
  // Auto-synced from variableStep — the user never edits this directly.
  _variableStep?: string;
  horizontalAlignment: HorizontalAlignment;
  verticalAlignment: VerticalAlignment;
}

export const defaultBasicModeOptions: BasicModeOptions = {
  timeStep: defaultTimeStep,
  tickIntervalMs: 1000,
  variableStep: '',
  horizontalAlignment: 'center',
  verticalAlignment: 'middle',
};

// SlidingWindowMode writes a pair of template variables every tick instead of
// driving the global time range. The consumer data source uses those variables
// in its query's time-filter position. Variable names are configurable per
// panel so multiple Timeline Controllers can coexist on one dashboard with
// non-colliding scopes.
export interface SlidingWindowModeOptions {
  timeStep: TimeStep;
  tickIntervalMs: number;
  // Template variable name (without `var-` prefix) that receives the window's
  // lower bound on every tick.
  variableFrom: string;
  // Template variable name that receives the window's upper bound.
  variableTo: string;
  // Optional: name of a dashboard `interval` variable. When set, the step
  // dropdown reads its options and current value from that variable, and
  // other queries can reference the variable as a duration to keep their
  // aggregation windows in sync with playback. Leave blank to use the
  // built-in list without publishing anything.
  variableStep: string;
  // Synthetic fields for Grafana's static "Used by panels" scan — one per
  // bound variable. Each holds `${name}` for its slot when set, empty
  // string otherwise. Per-slot fields (not one combined marker) so
  // Grafana's "missing variable" hint can point at the specific binding
  // — `_variableFrom`, `_variableTo`, or `_variableStep` — instead of a
  // single opaque marker. Auto-synced from the variable* fields; users
  // never edit these directly.
  _variableFrom?: string;
  _variableTo?: string;
  _variableStep?: string;
  timeFormat: TimeFormat;
  // Display toggles. Both default true; hiding them is a "transport-only"
  // mode for users who care only about the controls and read the bounds
  // via the consumer panels themselves.
  showProgressTrack: boolean;
  showCurrentValues: boolean;
  horizontalAlignment: HorizontalAlignment;
  verticalAlignment: VerticalAlignment;
}

export const defaultSlidingWindowModeOptions: SlidingWindowModeOptions = {
  timeStep: defaultTimeStep,
  tickIntervalMs: 1000,
  variableFrom: 'timeFrom',
  variableTo: 'timeTo',
  variableStep: '',
  timeFormat: 'ms',
  showProgressTrack: true,
  showCurrentValues: true,
  horizontalAlignment: 'center',
  verticalAlignment: 'middle',
};

export interface TimelineControllerOptions {
  mode: Mode;
  basic: BasicModeOptions;
  sliding: SlidingWindowModeOptions;
}

export const defaultTimelineControllerOptions: TimelineControllerOptions = {
  mode: 'basic',
  basic: defaultBasicModeOptions,
  sliding: defaultSlidingWindowModeOptions,
};
