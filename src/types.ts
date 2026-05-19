// A step size in Grafana duration syntax: `<integer><unit-letter>`.
// Valid units: `s` (second), `m` (minute), `h` (hour), `d` (day), `w` (week),
// `M` (month — uppercase because lowercase `m` is minutes), `y` (year).
// Examples: `30s`, `5m`, `1h`, `1M`, `1y`.
//
// Stored as the Grafana-native string so it matches what users see in the
// dashboard's interval-variable picker and what consumer queries reference
// (e.g. `rate(metric[$step])`). Math sites parse it on demand via
// `parseDuration` in `utils/timeRange`.
export type TimeStep = string;

export const defaultTimeStep: TimeStep = '1m';

export type HorizontalAlignment = 'left' | 'center' | 'right';
export type VerticalAlignment = 'top' | 'middle' | 'bottom';

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
  // from that variable instead of the built-in 17-value list. Leave blank
  // for the zero-config drop-in experience.
  variableStep: string;
  // Synthetic field that exists solely for Grafana's static "Used by panels"
  // scan. Holds `${variableStep}` whenever variableStep is set, so the
  // dashboard's variable settings page recognizes our panel as a consumer.
  // Auto-synced from variableStep — the user never edits this directly.
  _grafanaUsageMarker?: string;
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

export interface TimelineControllerOptions {
  basic: BasicModeOptions;
}

export const defaultTimelineControllerOptions: TimelineControllerOptions = {
  basic: defaultBasicModeOptions,
};
