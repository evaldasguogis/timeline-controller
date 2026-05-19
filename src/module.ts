import { PanelPlugin } from '@grafana/data';
import { TimelineControllerOptions } from 'types';
import { TimelineControllerPanel } from './TimelineControllerPanel';
import { buildPanelOptions } from './options';

export const plugin = new PanelPlugin<TimelineControllerOptions>(TimelineControllerPanel).setPanelOptions(
  buildPanelOptions
);
