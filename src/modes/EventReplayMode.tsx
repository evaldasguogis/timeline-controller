import React from 'react';
import { EventReplayModeOptions, TimelineControllerOptions } from '../types';
import { WindowedMode } from './WindowedMode';

// Event Replay is mechanically identical to Sliding Window — same writes,
// same window math — except the boundary is panel-configured rather than
// inherited from the dashboard's global time picker. Pick this when the
// time range being replayed is a specific historical event that should
// stay fixed regardless of what the dashboard's time picker shows.
//
// All UI / playback logic lives in WindowedMode (shared with SlidingWindow).
// This file is a thin adapter: it pulls the boundary from the saved options
// and contributes a boundary-validation error so the shared error banner
// can surface unset / inverted boundaries.

interface Props {
  options: TimelineControllerOptions;
  onOptionsChange: (options: TimelineControllerOptions) => void;
}

// Validate the panel-configured boundary. SlidingWindowMode doesn't need this
// — it inherits the dashboard's range and can assume it's valid — but Event
// Replay has to flag unset / inverted bounds so the user sees an actionable
// error instead of a silently-broken panel.
const validateBoundary = (event: EventReplayModeOptions): string[] => {
  if (event.boundaryFrom <= 0 || event.boundaryTo <= 0) {
    return ['Event boundary is not set. Configure "From" and "To" in the panel options.'];
  }
  if (event.boundaryFrom >= event.boundaryTo) {
    return ['Event boundary "From" must be before "To".'];
  }
  return [];
};

export const EventReplayMode: React.FC<Props> = ({ options, onOptionsChange }) => (
  <WindowedMode<EventReplayModeOptions>
    modeOptions={options.event}
    onModeOptionsChange={(next) => onOptionsChange({ ...options, event: next })}
    boundaryFromMs={options.event.boundaryFrom}
    boundaryToMs={options.event.boundaryTo}
    extraErrors={validateBoundary(options.event)}
  />
);
