import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StandardEditorProps } from '@grafana/data';
import { VariablePicker, VariablePickerSettings } from './VariablePicker';

let dashboardVariables: Array<{ name: string; type: string }> | null = [];
let getTemplateSrvShouldThrow = false;
const locationPartial = jest.fn();

jest.mock('@grafana/runtime', () => ({
  getTemplateSrv: () => {
    if (getTemplateSrvShouldThrow) {
      throw new Error('not in a Grafana runtime');
    }
    return { getVariables: () => dashboardVariables ?? [] };
  },
  locationService: {
    partial: (params: Record<string, string>, replace?: boolean) => locationPartial(params, replace),
  },
}));

// Combobox virtualizes its dropdown — options never render into jsdom, so we
// can't assert on them via screen queries. Mock it with a plain native select
// that exposes the option list and placeholder for inspection. Selecting an
// option triggers onChange with the matching ComboboxOption object, matching
// the real component's contract.
jest.mock('@grafana/ui', () => ({
  // The real Combobox virtualizes its dropdown, so options never render
  // into jsdom. Replace it with a native <select> that exposes the option
  // list and placeholder for inspection. Selecting an option calls onChange
  // with the matching ComboboxOption, matching the real component's contract.
  Combobox: ({ options, value, placeholder, onChange }: {
    options: Array<{ value: string; label?: string }>;
    value: string | null;
    placeholder?: string;
    onChange: (opt: { value: string; label?: string } | null) => void;
  }) => (
    <select
      role="combobox"
      data-testid="variable-picker"
      aria-label="variable picker"
      data-placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => {
        const opt = options.find((o) => o.value === e.target.value);
        onChange(opt ?? null);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label ?? o.value}
        </option>
      ))}
    </select>
  ),
  // useStyles2 in production resolves theme tokens; the component only
  // consumes its return object to attach className strings. Returning a
  // bare empty-string-style stub is enough — the test asserts on element
  // structure and content, not on CSS.
  useStyles2: () => ({
    wrapper: '',
    pickerRow: '',
    pickerSlot: '',
    infoIcon: '',
    warningLink: '',
    infoLink: '',
    hintIcon: '',
  }),
  // The hint row uses Icon; render it as a marker span the test can
  // identify if needed. Spread the remaining props so any data-* attributes
  // injected by a wrapping Tooltip (see below) survive onto the DOM node.
  Icon: ({ name, 'aria-label': ariaLabel, ...rest }: { name: string; 'aria-label'?: string }) => (
    <span data-testid={`icon-${name}`} aria-label={ariaLabel} {...rest} />
  ),
  // Tooltip wraps a trigger element; in jsdom we render the children plus a
  // data-tooltip-content attribute so tests can assert on the content the
  // user would see on hover.
  Tooltip: ({ content, children }: { content: string; children: React.ReactElement }) =>
    React.cloneElement(children, { 'data-tooltip-content': content }),
}));

// Minimal `item` to satisfy StandardEditorProps. The component only reads
// `item.settings`; the rest is unused.
const makeItem = (settings: VariablePickerSettings) =>
  ({ id: 'test', name: 'test', settings }) as unknown as StandardEditorProps<string, VariablePickerSettings>['item'];

const renderPicker = (props: {
  value: string;
  settings: VariablePickerSettings;
  onChange?: (v: string | undefined) => void;
}) =>
  render(
    <VariablePicker
      value={props.value}
      onChange={props.onChange ?? jest.fn()}
      item={makeItem(props.settings)}
      context={{} as never}
    />
  );

// The mocked Combobox is a native <select>, so options are always in the DOM
// — no "open" step needed. These helpers express the few assertions every
// test makes against the picker.
const optionTexts = () =>
  Array.from(screen.getByTestId('variable-picker').querySelectorAll('option')).map((o) => o.textContent ?? '');

const selectOption = (label: string) => {
  const select = screen.getByTestId('variable-picker') as HTMLSelectElement;
  const opt = Array.from(select.options).find((o) => o.textContent === label);
  if (!opt) {
    throw new Error(`option "${label}" not found; have: ${optionTexts().join(', ')}`);
  }
  fireEvent.change(select, { target: { value: opt.value } });
};

beforeEach(() => {
  dashboardVariables = [];
  getTemplateSrvShouldThrow = false;
  locationPartial.mockClear();
});

describe('VariablePicker — variable filtering', () => {
  beforeEach(() => {
    dashboardVariables = [
      { name: 'tbox1', type: 'textbox' },
      { name: 'tbox2', type: 'textbox' },
      { name: 'ivar', type: 'interval' },
      { name: 'qvar', type: 'query' },
    ];
  });

  it('lists only variables matching variableType when textbox', () => {
    renderPicker({ value: '', settings: { variableType: 'textbox' } });
    expect(optionTexts()).toEqual(['tbox1', 'tbox2']);
  });

  it('lists only variables matching variableType when interval', () => {
    renderPicker({ value: '', settings: { variableType: 'interval' } });
    expect(optionTexts()).toEqual(['ivar']);
  });
});

describe('VariablePicker — sentinel (noneLabel)', () => {
  beforeEach(() => {
    dashboardVariables = [{ name: 'step', type: 'interval' }];
  });

  it('renders the sentinel at the top when noneLabel is set', () => {
    renderPicker({
      value: '',
      settings: { variableType: 'interval', noneLabel: 'Use built-in list' },
    });
    expect(optionTexts()).toEqual(['Use built-in list', 'step']);
  });

  it('does not render any sentinel when noneLabel is omitted', () => {
    renderPicker({ value: '', settings: { variableType: 'interval' } });
    expect(optionTexts()).toEqual(['step']);
  });

  it('writes an empty string when the sentinel is selected', () => {
    const onChange = jest.fn();
    renderPicker({
      value: 'step',
      onChange,
      settings: { variableType: 'interval', noneLabel: 'Use built-in list' },
    });
    selectOption('Use built-in list');
    expect(onChange).toHaveBeenCalledWith('');
  });
});

describe('VariablePicker — missing variable surfacing', () => {
  it('appends "(missing)" when the stored value names a variable that no longer exists', () => {
    dashboardVariables = [{ name: 'present', type: 'textbox' }];
    renderPicker({ value: 'absent', settings: { variableType: 'textbox' } });
    expect(optionTexts()).toEqual(['present', 'absent (missing)']);
  });

  it('does not append "(missing)" when value matches a real variable', () => {
    dashboardVariables = [{ name: 'present', type: 'textbox' }];
    renderPicker({ value: 'present', settings: { variableType: 'textbox' } });
    expect(optionTexts()).toEqual(['present']);
  });
});

describe('VariablePicker — placeholder', () => {
  it('says "No <type> variables on this dashboard" when filter matches nothing', () => {
    dashboardVariables = [{ name: 'qvar', type: 'query' }];
    renderPicker({ value: '', settings: { variableType: 'textbox' } });
    expect(screen.getByTestId('variable-picker')).toHaveAttribute(
      'data-placeholder',
      'No textbox variables on this dashboard'
    );
  });

  it('says "Select a <type> variable" when matching variables exist', () => {
    dashboardVariables = [{ name: 'tbox', type: 'textbox' }];
    renderPicker({ value: '', settings: { variableType: 'textbox' } });
    expect(screen.getByTestId('variable-picker')).toHaveAttribute(
      'data-placeholder',
      'Select a textbox variable'
    );
  });

  it('uses "an" for vowel-initial variable types (grammar)', () => {
    dashboardVariables = [{ name: 'step', type: 'interval' }];
    renderPicker({ value: '', settings: { variableType: 'interval' } });
    expect(screen.getByTestId('variable-picker')).toHaveAttribute(
      'data-placeholder',
      'Select an interval variable'
    );
  });
});

describe('VariablePicker — helperText hint', () => {
  const HINT = 'Create one in Dashboard settings → Variables.';

  it('shows the hint when no matching variables exist', () => {
    dashboardVariables = [{ name: 'step', type: 'interval' }];
    renderPicker({
      value: '',
      settings: { variableType: 'textbox', helperText: HINT },
    });
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it('hides the hint once at least one matching variable exists', () => {
    dashboardVariables = [{ name: 'present', type: 'textbox' }];
    renderPicker({
      value: '',
      settings: { variableType: 'textbox', helperText: HINT },
    });
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('does not render any hint when helperText is omitted', () => {
    dashboardVariables = [];
    renderPicker({ value: '', settings: { variableType: 'textbox' } });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('defaults to the info severity (info-circle icon)', () => {
    dashboardVariables = [];
    renderPicker({
      value: '',
      settings: { variableType: 'textbox', helperText: HINT },
    });
    expect(screen.getByTestId('icon-info-circle')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-exclamation-triangle')).not.toBeInTheDocument();
  });

  it('shows the warning severity (exclamation-triangle icon) when requested', () => {
    dashboardVariables = [];
    renderPicker({
      value: '',
      settings: { variableType: 'textbox', helperText: HINT, helperTextSeverity: 'warning' },
    });
    expect(screen.getByTestId('icon-exclamation-triangle')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-info-circle')).not.toBeInTheDocument();
  });
});

describe('VariablePicker — infoTooltip', () => {
  it('renders an info icon when settings.infoTooltip is set', () => {
    renderPicker({
      value: '',
      settings: { variableType: 'textbox', infoTooltip: 'Deep mechanics here.' },
    });
    const icon = screen.getByLabelText('More info');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('data-tooltip-content', 'Deep mechanics here.');
  });

  it('does not render the info icon when settings.infoTooltip is omitted', () => {
    renderPicker({ value: '', settings: { variableType: 'textbox' } });
    expect(screen.queryByLabelText('More info')).not.toBeInTheDocument();
  });
});

describe('VariablePicker — warning link opens dashboard variables', () => {
  it('navigates to editview=variables when the warning is clicked', () => {
    dashboardVariables = [];
    renderPicker({
      value: '',
      settings: {
        variableType: 'textbox',
        helperText: 'Create one in Dashboard settings → Variables.',
      },
    });
    fireEvent.click(screen.getByRole('status'));
    expect(locationPartial).toHaveBeenCalledWith({ editview: 'variables' }, false);
  });
});

describe('VariablePicker — runtime resilience', () => {
  it('falls through gracefully when getTemplateSrv throws (e.g. outside a Grafana runtime)', () => {
    getTemplateSrvShouldThrow = true;
    // No crash, and the sentinel still keeps the picker usable.
    expect(() =>
      renderPicker({
        value: '',
        settings: { variableType: 'interval', noneLabel: 'Use built-in list' },
      })
    ).not.toThrow();
    expect(optionTexts()).toEqual(['Use built-in list']);
  });
});

describe('VariablePicker — onChange selection', () => {
  it('writes the selected variable name', () => {
    dashboardVariables = [
      { name: 'first', type: 'textbox' },
      { name: 'second', type: 'textbox' },
    ];
    const onChange = jest.fn();
    renderPicker({ value: '', onChange, settings: { variableType: 'textbox' } });
    selectOption('second');
    expect(onChange).toHaveBeenCalledWith('second');
  });
});
