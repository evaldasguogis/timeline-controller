import { PanelPlugin } from '@grafana/data';
import { TimelineControllerOptions } from 'types';
import { TimelineControllerPanel } from './TimelineControllerPanel';

export const plugin = new PanelPlugin<TimelineControllerOptions>(TimelineControllerPanel);
