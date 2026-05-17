import { PanelPlugin } from '@grafana/data';
import { defaultBasicModeOptions, TimelineControllerOptions } from 'types';
import { TimelineControllerPanel } from './TimelineControllerPanel';

export const plugin = new PanelPlugin<TimelineControllerOptions>(TimelineControllerPanel).setPanelOptions((builder) => {
  builder
    .addNumberInput({
      path: 'basic.tickIntervalMs',
      name: 'Tick interval (ms)',
      description:
        'Delay between ticks while playing. Each tick re-queries every panel; values below ~500 ms can overload slow data sources.',
      defaultValue: defaultBasicModeOptions.tickIntervalMs,
      category: ['Playback'],
      settings: {
        min: 100,
        max: 60000,
        integer: true,
      },
    })
    .addRadio({
      path: 'basic.horizontalAlignment',
      name: 'Horizontal alignment',
      defaultValue: defaultBasicModeOptions.horizontalAlignment,
      category: ['Layout'],
      settings: {
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ],
      },
    })
    .addRadio({
      path: 'basic.verticalAlignment',
      name: 'Vertical alignment',
      defaultValue: defaultBasicModeOptions.verticalAlignment,
      category: ['Layout'],
      settings: {
        options: [
          { value: 'top', label: 'Top' },
          { value: 'middle', label: 'Middle' },
          { value: 'bottom', label: 'Bottom' },
        ],
      },
    });
});
