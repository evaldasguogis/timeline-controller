import { DateTimeInput, DurationUnit } from '@grafana/data';

export interface TimeStep {
  value: DateTimeInput;
  unit: DurationUnit;
}

export const defaultTimeStep: TimeStep = {
  value: 1,
  unit: 'm',
};

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
  horizontalAlignment: HorizontalAlignment;
  verticalAlignment: VerticalAlignment;
}

export const defaultBasicModeOptions: BasicModeOptions = {
  timeStep: defaultTimeStep,
  tickIntervalMs: 1000,
  horizontalAlignment: 'center',
  verticalAlignment: 'middle',
};

export interface TimelineControllerOptions {
  basic: BasicModeOptions;
}

export const defaultTimelineControllerOptions: TimelineControllerOptions = {
  basic: defaultBasicModeOptions,
};
