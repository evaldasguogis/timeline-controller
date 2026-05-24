import React from 'react';
import { PanelProps } from '@grafana/data';
import { defaultTimelineControllerOptions, TimelineControllerOptions } from 'types';
import { BasicMode } from './modes/BasicMode';
import { SlidingWindowMode } from './modes/SlidingWindowMode';
import { EventReplayMode } from './modes/EventReplayMode';

type Props = PanelProps<TimelineControllerOptions>;

export const TimelineControllerPanel: React.FC<Props> = ({
  options,
  onOptionsChange,
  timeRange,
  eventBus,
}) => {
  // Saved panels may pre-date any option added since they were stored, and
  // Grafana passes the persisted shape through verbatim. Deep-merging defaults
  // here means each mode component can assume every field is present.
  const merged: TimelineControllerOptions = {
    ...defaultTimelineControllerOptions,
    ...options,
    basic: { ...defaultTimelineControllerOptions.basic, ...options?.basic },
    sliding: { ...defaultTimelineControllerOptions.sliding, ...options?.sliding },
    event: { ...defaultTimelineControllerOptions.event, ...options?.event },
  };

  // `eventBus` is the dashboard-scoped event bus Grafana publishes
  // TimeRangeUpdatedEvent on. Modes that need to react to global time
  // changes (basic + sliding) take it as a prop; event mode's boundary is
  // panel-saved, so it doesn't need it.
  switch (merged.mode) {
    case 'sliding':
      return (
        <SlidingWindowMode
          options={merged}
          onOptionsChange={onOptionsChange}
          timeRange={timeRange}
          eventBus={eventBus}
        />
      );
    case 'event':
      return <EventReplayMode options={merged} onOptionsChange={onOptionsChange} />;
    case 'basic':
    default:
      return (
        <BasicMode
          options={merged}
          onOptionsChange={onOptionsChange}
          timeRange={timeRange}
          eventBus={eventBus}
        />
      );
  }
};
