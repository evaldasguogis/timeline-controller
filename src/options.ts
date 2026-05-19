import { PanelOptionsEditorBuilder } from '@grafana/data';
import { defaultBasicModeOptions, TimelineControllerOptions } from './types';
import { VariablePicker, VariablePickerSettings } from './components/VariablePicker';

// Panel-options schema. Lives in its own file so module.ts stays a thin
// registration shell — the same split the official Grafana clock-panel uses.

export const buildPanelOptions = (builder: PanelOptionsEditorBuilder<TimelineControllerOptions>) => {
  builder
    .addCustomEditor<VariablePickerSettings, string>({
      id: 'basic.variableStep',
      path: 'basic.variableStep',
      name: 'Step values from variable',
      description:
        'Source the step dropdown\'s values from a dashboard interval variable instead of the built-in list. Create one in Dashboard settings → Variables (type: Interval) if you don\'t already have one.',
      defaultValue: defaultBasicModeOptions.variableStep,
      category: ['Step options'],
      editor: VariablePicker,
      settings: { variableType: 'interval', noneLabel: 'Use built-in list' },
    })
    .addNumberInput({
      path: 'basic.tickIntervalMs',
      name: 'Tick interval (ms)',
      description:
        'Delay between ticks while playing. Each tick re-queries every panel, so very small values can overload slow data sources.',
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
};
