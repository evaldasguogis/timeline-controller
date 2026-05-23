import { PanelOptionsEditorBuilder } from '@grafana/data';
import {
  defaultBasicModeOptions,
  defaultSlidingWindowModeOptions,
  defaultTimelineControllerOptions,
  Mode,
  TimeFormat,
  TimelineControllerOptions,
} from './types';
import { VariablePicker, VariablePickerSettings } from './components/VariablePicker';
import { TimeFormatEditor, TimeFormatEditorSettings } from './components/TimeFormatEditor';
import { ModeEditor } from './components/ModeEditor';

// Panel-options schema. Lives in its own file so module.ts stays a thin
// registration shell — the same split the official Grafana clock-panel uses.
//
// Editor option visibility is gated on the selected mode via `showIf`: only
// the relevant mode's options appear. Keeping Basic and Sliding settings in
// separate sub-objects (rather than sharing fields) makes this trivial — each
// field's path makes its mode unambiguous.
//
// Category order matters: Grafana renders categories in the order their first
// option is registered. Sliding-mode editing reads top-to-bottom as:
//   Mode → Window variables → Step variable → Layout → Playback
// — variables (the integration contract) live up top; Layout (what shows
// + where it sits) and tick interval are secondary tuning knobs below.

// Description = the single-sentence "what does this do" line that shows
// under the option name (Grafana renders it as inline plain text — no line
// breaks). Onboarding hints go in `settings.helperText`, which the
// VariablePicker renders as a second line under the dropdown.

const STEP_VARIABLE_DESCRIPTION =
  'Source the step dropdown\'s values from a dashboard interval variable instead of the built-in list.';

// Long-form info behind an ⓘ next to the picker — the deep mechanics that
// don't fit in the inline description Grafana shows under the label.
const STEP_VARIABLE_INFO =
  'Pick a variable here and the dropdown uses its options. The variable also updates to match the current step, so other queries can read it (as a duration) to keep their windows in sync with playback. Leave blank to use the built-in list instead.';

// Helper text is shown only when no matching variables exist on the
// dashboard — so the "if you don't already have one" qualifier is implicit.
const STEP_VARIABLE_HELPER_TEXT =
  'Create one in Dashboard settings → Variables (type: Interval).';

const windowBoundDescription = (bound: 'lower' | 'upper') =>
  `Bind the window's ${bound} bound to a dashboard textbox variable, updated each tick.`;

const windowBoundInfo = (bound: 'lower' | 'upper') =>
  `This variable updates on every tick with the window's current ${bound} bound. To make a panel follow the window, reference this variable in its query's time-filter — other panels can ignore it. The name you pick here is what connects this panel to the ones following along.`;

const WINDOW_VARIABLE_HELPER_TEXT =
  'Create one in Dashboard settings → Variables (type: Textbox).';

const TIMESTAMP_FORMAT_INFO =
  'Pick whatever format your data source can read in its time-filter. The preview below shows what the value actually looks like right now.';

export const buildPanelOptions = (builder: PanelOptionsEditorBuilder<TimelineControllerOptions>) => {
  builder
    .addCustomEditor<undefined, Mode>({
      id: 'mode',
      path: 'mode',
      name: 'Mode',
      // ModeEditor shows every mode's summary as visible text under the
      // radio, so no `description` here — Grafana would render it as
      // another inline line above the radio, just duplicating what's
      // already on screen.
      defaultValue: defaultTimelineControllerOptions.mode,
      category: ['Mode'],
      editor: ModeEditor,
    })
    .addCustomEditor<VariablePickerSettings, string>({
      id: 'sliding.variableFrom',
      path: 'sliding.variableFrom',
      name: 'Lower bound to variable',
      description: windowBoundDescription('lower'),
      defaultValue: defaultSlidingWindowModeOptions.variableFrom,
      category: ['Window variables'],
      editor: VariablePicker,
      settings: {
        variableType: 'textbox',
        createCustomValue: true,
        helperText: WINDOW_VARIABLE_HELPER_TEXT,
        // Required slot — missing variables block the panel, so a warning
        // is appropriate. The step pickers stay `info` (default) since
        // they have the built-in list as a fallback.
        helperTextSeverity: 'warning',
        infoTooltip: windowBoundInfo('lower'),
      },
      showIf: (config) => config.mode === 'sliding',
    })
    .addCustomEditor<VariablePickerSettings, string>({
      id: 'sliding.variableTo',
      path: 'sliding.variableTo',
      name: 'Upper bound to variable',
      description: windowBoundDescription('upper'),
      defaultValue: defaultSlidingWindowModeOptions.variableTo,
      category: ['Window variables'],
      editor: VariablePicker,
      settings: {
        variableType: 'textbox',
        createCustomValue: true,
        helperText: WINDOW_VARIABLE_HELPER_TEXT,
        helperTextSeverity: 'warning',
        infoTooltip: windowBoundInfo('upper'),
      },
      showIf: (config) => config.mode === 'sliding',
    })
    .addCustomEditor<TimeFormatEditorSettings, TimeFormat>({
      id: 'sliding.timeFormat',
      path: 'sliding.timeFormat',
      name: 'Timestamp format',
      description:
        'How from/to timestamps are written into the variables. Each option mirrors one of Grafana\'s $__from / $__to formatting flavors.',
      defaultValue: defaultSlidingWindowModeOptions.timeFormat,
      category: ['Window variables'],
      editor: TimeFormatEditor,
      settings: { infoTooltip: TIMESTAMP_FORMAT_INFO },
      showIf: (config) => config.mode === 'sliding',
    })
    .addCustomEditor<VariablePickerSettings, string>({
      id: 'basic.variableStep',
      path: 'basic.variableStep',
      name: 'Step values from variable',
      description: STEP_VARIABLE_DESCRIPTION,
      defaultValue: defaultBasicModeOptions.variableStep,
      category: ['Step variable'],
      editor: VariablePicker,
      settings: {
        variableType: 'interval',
        noneLabel: 'None — use built-in steps',
        helperText: STEP_VARIABLE_HELPER_TEXT,
        infoTooltip: STEP_VARIABLE_INFO,
      },
      showIf: (config) => config.mode === 'basic',
    })
    .addCustomEditor<VariablePickerSettings, string>({
      id: 'sliding.variableStep',
      path: 'sliding.variableStep',
      name: 'Step values from variable',
      description: STEP_VARIABLE_DESCRIPTION,
      defaultValue: defaultSlidingWindowModeOptions.variableStep,
      category: ['Step variable'],
      editor: VariablePicker,
      settings: {
        variableType: 'interval',
        noneLabel: 'None — use built-in steps',
        helperText: STEP_VARIABLE_HELPER_TEXT,
        infoTooltip: STEP_VARIABLE_INFO,
      },
      showIf: (config) => config.mode === 'sliding',
    })
    .addBooleanSwitch({
      path: 'sliding.showProgressTrack',
      name: 'Show progress track',
      description: 'The bar that shows where the window sits within the dashboard\'s global range.',
      defaultValue: defaultSlidingWindowModeOptions.showProgressTrack,
      category: ['Layout'],
      showIf: (config) => config.mode === 'sliding',
    })
    .addBooleanSwitch({
      path: 'sliding.showCurrentValues',
      name: 'Show current values',
      description: 'The textual readout of the window\'s from/to timestamps.',
      defaultValue: defaultSlidingWindowModeOptions.showCurrentValues,
      category: ['Layout'],
      showIf: (config) => config.mode === 'sliding',
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
      showIf: (config) => config.mode === 'basic',
    })
    .addNumberInput({
      path: 'sliding.tickIntervalMs',
      name: 'Tick interval (ms)',
      description:
        'Delay between ticks while playing. Each tick re-queries every panel, so very small values can overload slow data sources.',
      defaultValue: defaultSlidingWindowModeOptions.tickIntervalMs,
      category: ['Playback'],
      settings: {
        min: 100,
        max: 60000,
        integer: true,
      },
      showIf: (config) => config.mode === 'sliding',
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
      showIf: (config) => config.mode === 'basic',
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
      showIf: (config) => config.mode === 'basic',
    })
    .addRadio({
      path: 'sliding.horizontalAlignment',
      name: 'Horizontal alignment',
      defaultValue: defaultSlidingWindowModeOptions.horizontalAlignment,
      category: ['Layout'],
      settings: {
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ],
      },
      showIf: (config) => config.mode === 'sliding',
    })
    .addRadio({
      path: 'sliding.verticalAlignment',
      name: 'Vertical alignment',
      defaultValue: defaultSlidingWindowModeOptions.verticalAlignment,
      category: ['Layout'],
      settings: {
        options: [
          { value: 'top', label: 'Top' },
          { value: 'middle', label: 'Middle' },
          { value: 'bottom', label: 'Bottom' },
        ],
      },
      showIf: (config) => config.mode === 'sliding',
    });
};
