import React from 'react';
import { PanelProps } from '@grafana/data';
import { defaultTimelineControllerOptions, TimelineControllerOptions } from 'types';
import { BasicMode } from './modes/BasicMode';
import { SlidingWindowMode } from './modes/SlidingWindowMode';

type Props = PanelProps<TimelineControllerOptions>;

export const TimelineControllerPanel: React.FC<Props> = ({ options, onOptionsChange, timeRange }) => {
  // Saved panels may pre-date any option added since they were stored, and
  // Grafana passes the persisted shape through verbatim. Deep-merging defaults
  // here means each mode component can assume every field is present.
  const merged: TimelineControllerOptions = {
    ...defaultTimelineControllerOptions,
    ...options,
    basic: { ...defaultTimelineControllerOptions.basic, ...options?.basic },
    sliding: { ...defaultTimelineControllerOptions.sliding, ...options?.sliding },
  };

  switch (merged.mode) {
    case 'sliding':
      return <SlidingWindowMode options={merged} onOptionsChange={onOptionsChange} timeRange={timeRange} />;
    case 'basic':
    default:
      return <BasicMode options={merged} onOptionsChange={onOptionsChange} timeRange={timeRange} />;
  }
};
