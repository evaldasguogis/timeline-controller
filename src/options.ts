import { PanelOptionsEditorBuilder, SelectableValue } from '@grafana/data';
import {
  defaultBasicModeOptions,
  defaultEventReplayModeOptions,
  defaultSlidingWindowModeOptions,
  defaultTimelineControllerOptions,
  HorizontalAlignment,
  Mode,
  TimelineControllerOptions,
  VerticalAlignment,
} from './types';
import { VariablePicker, VariablePickerSettings } from './components/VariablePicker';
import { ModeEditor } from './components/ModeEditor';
import { EventBoundaryEditor } from './components/EventBoundaryEditor';
import { FullWidthRadioEditor, FullWidthRadioSettings } from './components/FullWidthRadioEditor';

const HORIZONTAL_ALIGNMENT_OPTIONS: Array<SelectableValue<HorizontalAlignment>> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const VERTICAL_ALIGNMENT_OPTIONS: Array<SelectableValue<VerticalAlignment>> = [
  { value: 'top', label: 'Top' },
  { value: 'middle', label: 'Middle' },
  { value: 'bottom', label: 'Bottom' },
];

// Panel-options schema. Lives in its own file so module.ts stays a thin
// registration shell — the same split the official Grafana clock-panel uses.
//
// Editor option visibility is gated on the selected mode via `showIf`: only
// the relevant mode's options appear. Keeping Basic and Sliding settings in
// separate sub-objects (rather than sharing fields) makes this trivial — each
// field's path makes its mode unambiguous.
//
// Category order matters: Grafana renders categories in the order their first
// option is registered. For sliding mode the editor reads top-to-bottom as:
//   Mode → Window variables → Step variable → Playback → Layout
// For event mode "Event boundary" sits between Mode and Window variables
// because the configured range is the option that distinguishes Event Replay
// from Sliding Window — see it first when configuring the mode.

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

// Descriptions shared between sliding and event modes — both have the same
// playback controls and visual elements, only the boundary source differs.
const SHOW_PROGRESS_TRACK_DESC = 'Visual indicator of the window\'s current position.';
const TICK_INTERVAL_DESC =
  'Delay between ticks while playing. Each tick re-queries every panel, so very small values can overload slow data sources.';

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
    .addCustomEditor<undefined, number>({
      id: 'event.boundaryFrom',
      path: 'event.boundaryFrom',
      name: 'From',
      description: 'Lower bound of the saved time range. Absolute timestamp.',
      defaultValue: defaultEventReplayModeOptions.boundaryFrom,
      category: ['Event boundary'],
      editor: EventBoundaryEditor,
      showIf: (config) => config.mode === 'event',
    })
    .addCustomEditor<undefined, number>({
      id: 'event.boundaryTo',
      path: 'event.boundaryTo',
      name: 'To',
      description: 'Upper bound of the saved time range. Absolute timestamp.',
      defaultValue: defaultEventReplayModeOptions.boundaryTo,
      category: ['Event boundary'],
      editor: EventBoundaryEditor,
      showIf: (config) => config.mode === 'event',
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
    .addCustomEditor<VariablePickerSettings, string>({
      id: 'event.variableFrom',
      path: 'event.variableFrom',
      name: 'Lower bound to variable',
      description: windowBoundDescription('lower'),
      defaultValue: defaultEventReplayModeOptions.variableFrom,
      category: ['Window variables'],
      editor: VariablePicker,
      settings: {
        variableType: 'textbox',
        createCustomValue: true,
        helperText: WINDOW_VARIABLE_HELPER_TEXT,
        helperTextSeverity: 'warning',
        infoTooltip: windowBoundInfo('lower'),
      },
      showIf: (config) => config.mode === 'event',
    })
    .addCustomEditor<VariablePickerSettings, string>({
      id: 'event.variableTo',
      path: 'event.variableTo',
      name: 'Upper bound to variable',
      description: windowBoundDescription('upper'),
      defaultValue: defaultEventReplayModeOptions.variableTo,
      category: ['Window variables'],
      editor: VariablePicker,
      settings: {
        variableType: 'textbox',
        createCustomValue: true,
        helperText: WINDOW_VARIABLE_HELPER_TEXT,
        helperTextSeverity: 'warning',
        infoTooltip: windowBoundInfo('upper'),
      },
      showIf: (config) => config.mode === 'event',
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
    .addCustomEditor<VariablePickerSettings, string>({
      id: 'event.variableStep',
      path: 'event.variableStep',
      name: 'Step values from variable',
      description: STEP_VARIABLE_DESCRIPTION,
      defaultValue: defaultEventReplayModeOptions.variableStep,
      category: ['Step variable'],
      editor: VariablePicker,
      settings: {
        variableType: 'interval',
        noneLabel: 'None — use built-in steps',
        helperText: STEP_VARIABLE_HELPER_TEXT,
        infoTooltip: STEP_VARIABLE_INFO,
      },
      showIf: (config) => config.mode === 'event',
    })
    // Playback category — registered before Layout so Grafana renders it
    // first in the sidebar (categories appear in first-touch order).
    .addCustomEditor<FullWidthRadioSettings<'start' | 'end'>, 'start' | 'end'>({
      id: 'sliding.initialPosition',
      path: 'sliding.initialPosition',
      name: 'Initial window position',
      description: 'Where the window lands on mount and after the dashboard range changes.',
      defaultValue: defaultSlidingWindowModeOptions.initialPosition,
      category: ['Playback'],
      editor: FullWidthRadioEditor,
      settings: {
        options: [
          { value: 'start', label: 'Start' },
          { value: 'end', label: 'End' },
        ],
      },
      showIf: (config) => config.mode === 'sliding',
    })
    .addCustomEditor<FullWidthRadioSettings<'start' | 'end'>, 'start' | 'end'>({
      id: 'event.initialPosition',
      path: 'event.initialPosition',
      name: 'Initial window position',
      description: 'Where the window lands on mount and after the boundary changes.',
      defaultValue: defaultEventReplayModeOptions.initialPosition,
      category: ['Playback'],
      editor: FullWidthRadioEditor,
      settings: {
        options: [
          { value: 'start', label: 'Start' },
          { value: 'end', label: 'End' },
        ],
      },
      showIf: (config) => config.mode === 'event',
    })
    .addNumberInput({
      path: 'basic.tickIntervalMs',
      name: 'Tick interval (ms)',
      description: TICK_INTERVAL_DESC,
      defaultValue: defaultBasicModeOptions.tickIntervalMs,
      category: ['Playback'],
      settings: { min: 100, max: 60000, integer: true },
      showIf: (config) => config.mode === 'basic',
    })
    .addNumberInput({
      path: 'sliding.tickIntervalMs',
      name: 'Tick interval (ms)',
      description: TICK_INTERVAL_DESC,
      defaultValue: defaultSlidingWindowModeOptions.tickIntervalMs,
      category: ['Playback'],
      settings: { min: 100, max: 60000, integer: true },
      showIf: (config) => config.mode === 'sliding',
    })
    .addNumberInput({
      path: 'event.tickIntervalMs',
      name: 'Tick interval (ms)',
      description: TICK_INTERVAL_DESC,
      defaultValue: defaultEventReplayModeOptions.tickIntervalMs,
      category: ['Playback'],
      settings: { min: 100, max: 60000, integer: true },
      showIf: (config) => config.mode === 'event',
    })
    // Layout category — visibility and alignment toggles, registered last.
    .addBooleanSwitch({
      path: 'sliding.showProgressTrack',
      name: 'Show progress track',
      description: SHOW_PROGRESS_TRACK_DESC,
      defaultValue: defaultSlidingWindowModeOptions.showProgressTrack,
      category: ['Layout'],
      showIf: (config) => config.mode === 'sliding',
    })
    .addBooleanSwitch({
      path: 'event.showProgressTrack',
      name: 'Show progress track',
      description: SHOW_PROGRESS_TRACK_DESC,
      defaultValue: defaultEventReplayModeOptions.showProgressTrack,
      category: ['Layout'],
      showIf: (config) => config.mode === 'event',
    })
    .addCustomEditor<FullWidthRadioSettings<HorizontalAlignment>, HorizontalAlignment>({
      id: 'basic.horizontalAlignment',
      path: 'basic.horizontalAlignment',
      name: 'Horizontal alignment',
      defaultValue: defaultBasicModeOptions.horizontalAlignment,
      category: ['Layout'],
      editor: FullWidthRadioEditor,
      settings: { options: HORIZONTAL_ALIGNMENT_OPTIONS },
      showIf: (config) => config.mode === 'basic',
    })
    .addCustomEditor<FullWidthRadioSettings<VerticalAlignment>, VerticalAlignment>({
      id: 'basic.verticalAlignment',
      path: 'basic.verticalAlignment',
      name: 'Vertical alignment',
      defaultValue: defaultBasicModeOptions.verticalAlignment,
      category: ['Layout'],
      editor: FullWidthRadioEditor,
      settings: { options: VERTICAL_ALIGNMENT_OPTIONS },
      showIf: (config) => config.mode === 'basic',
    })
    .addCustomEditor<FullWidthRadioSettings<HorizontalAlignment>, HorizontalAlignment>({
      id: 'sliding.horizontalAlignment',
      path: 'sliding.horizontalAlignment',
      name: 'Horizontal alignment',
      defaultValue: defaultSlidingWindowModeOptions.horizontalAlignment,
      category: ['Layout'],
      editor: FullWidthRadioEditor,
      settings: { options: HORIZONTAL_ALIGNMENT_OPTIONS },
      showIf: (config) => config.mode === 'sliding',
    })
    .addCustomEditor<FullWidthRadioSettings<VerticalAlignment>, VerticalAlignment>({
      id: 'sliding.verticalAlignment',
      path: 'sliding.verticalAlignment',
      name: 'Vertical alignment',
      defaultValue: defaultSlidingWindowModeOptions.verticalAlignment,
      category: ['Layout'],
      editor: FullWidthRadioEditor,
      settings: { options: VERTICAL_ALIGNMENT_OPTIONS },
      showIf: (config) => config.mode === 'sliding',
    })
    .addCustomEditor<FullWidthRadioSettings<HorizontalAlignment>, HorizontalAlignment>({
      id: 'event.horizontalAlignment',
      path: 'event.horizontalAlignment',
      name: 'Horizontal alignment',
      defaultValue: defaultEventReplayModeOptions.horizontalAlignment,
      category: ['Layout'],
      editor: FullWidthRadioEditor,
      settings: { options: HORIZONTAL_ALIGNMENT_OPTIONS },
      showIf: (config) => config.mode === 'event',
    })
    .addCustomEditor<FullWidthRadioSettings<VerticalAlignment>, VerticalAlignment>({
      id: 'event.verticalAlignment',
      path: 'event.verticalAlignment',
      name: 'Vertical alignment',
      defaultValue: defaultEventReplayModeOptions.verticalAlignment,
      category: ['Layout'],
      editor: FullWidthRadioEditor,
      settings: { options: VERTICAL_ALIGNMENT_OPTIONS },
      showIf: (config) => config.mode === 'event',
    });
};
