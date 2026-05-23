import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StandardEditorProps } from '@grafana/data';
import { EventBoundaryEditor } from './EventBoundaryEditor';

// DateTimePicker pulls in a substantial date-picker UI; for this editor the
// only contract we care about is "an unset value (0) yields the hint, a real
// timestamp yields no hint, and clearing yields 0 again". Mock DateTimePicker
// with a minimal text input that lets us drive both code paths reliably in
// jsdom — the date-picker's own behavior is Grafana's concern, not ours.
jest.mock('@grafana/ui', () => ({
  DateTimePicker: ({
    date,
    onChange,
  }: {
    date?: { valueOf: () => number };
    onChange: (next?: { valueOf: () => number }) => void;
  }) => (
    <input
      data-testid="datetime-picker"
      value={date ? date.valueOf() : ''}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') {
          onChange(undefined);
        } else {
          const ms = Number(v);
          onChange({ valueOf: () => ms });
        }
      }}
    />
  ),
  useStyles2: () => ({ wrapper: '', hint: '' }),
}));

const makeItem = () => ({ id: 'test', name: 'test' }) as unknown as StandardEditorProps<number>['item'];

const renderEditor = (value: number, onChange = jest.fn()) =>
  render(
    <EventBoundaryEditor value={value} onChange={onChange} item={makeItem()} context={{} as never} />
  );

describe('EventBoundaryEditor', () => {
  it('shows the "pick a date" hint when value is 0 (unset)', () => {
    renderEditor(0);
    expect(screen.getByText(/Pick a date and time/)).toBeInTheDocument();
  });

  it('hides the hint once a real timestamp is set', () => {
    renderEditor(Date.UTC(2026, 4, 16, 0, 0, 0));
    expect(screen.queryByText(/Pick a date and time/)).not.toBeInTheDocument();
  });

  it('treats negative values as unset (defensive — invalid persisted JSON)', () => {
    renderEditor(-1);
    expect(screen.getByText(/Pick a date and time/)).toBeInTheDocument();
  });

  it('writes the picked timestamp as absolute ms', () => {
    const onChange = jest.fn();
    const picked = Date.UTC(2026, 4, 16, 12, 0, 0);
    renderEditor(0, onChange);
    fireEvent.change(screen.getByTestId('datetime-picker'), { target: { value: String(picked) } });
    expect(onChange).toHaveBeenCalledWith(picked);
  });

  it('writes 0 when the user clears the picker (preserves "not set" semantics)', () => {
    const onChange = jest.fn();
    renderEditor(Date.UTC(2026, 4, 16, 0, 0, 0), onChange);
    fireEvent.change(screen.getByTestId('datetime-picker'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(0);
  });
});
