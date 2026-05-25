import React from 'react';
import { EventBus, TimeRange } from '@grafana/data';
import { SlidingWindowModeOptions, TimelineControllerOptions } from '../types';
import { WindowedMode } from './WindowedMode';

// Sliding Window mode writes a pair of template variables instead of driving
// the global time range. The window is one timeStep wide and slides across
// the dashboard's global range; the global range is the boundary, and the
// playback hook subscribes to TimeRangeUpdatedEvent on the dashboard event
// bus so the window re-seeds when the user changes the picker.
//
// All UI / playback logic lives in WindowedMode (shared with EventReplayMode).
// This file is a thin adapter: it derives the boundary from the dashboard's
// timeRange and forwards the event bus through.

interface Props {
  options: TimelineControllerOptions;
  onOptionsChange: (options: TimelineControllerOptions) => void;
  timeRange: TimeRange;
  eventBus: EventBus;
}

export const SlidingWindowMode: React.FC<Props> = ({ options, onOptionsChange, timeRange, eventBus }) => (
  <WindowedMode<SlidingWindowModeOptions>
    modeOptions={options.sliding}
    onModeOptionsChange={(next) => onOptionsChange({ ...options, sliding: next })}
    boundaryFromMs={timeRange.from.valueOf()}
    boundaryToMs={timeRange.to.valueOf()}
    eventBus={eventBus}
  />
);
