import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StandardEditorProps } from '@grafana/data';
import { TimeFormat } from '../types';
import { TimeFormatEditor } from './TimeFormatEditor';

const makeItem = (settings?: { infoTooltip?: string }) =>
  ({ id: 'test', name: 'test', settings: settings ?? {} }) as unknown as StandardEditorProps<TimeFormat>['item'];

const renderEditor = (
  value: TimeFormat,
  opts: { onChange?: jest.Mock; infoTooltip?: string } = {}
) =>
  render(
    <TimeFormatEditor
      value={value}
      onChange={opts.onChange ?? jest.fn()}
      item={makeItem({ infoTooltip: opts.infoTooltip })}
      context={{} as never}
    />
  );

const previewInput = () => screen.getByLabelText('Time format preview') as HTMLInputElement;

describe('TimeFormatEditor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.UTC(2026, 4, 16, 0, 0, 0)); // 2026-05-16T00:00:00Z
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the three format options', () => {
    renderEditor('ms');
    expect(screen.getByText('ms')).toBeInTheDocument();
    expect(screen.getByText('s')).toBeInTheDocument();
    expect(screen.getByText('ISO 8601')).toBeInTheDocument();
  });

  it('shows the current wall-clock instant encoded as milliseconds', () => {
    renderEditor('ms');
    expect(previewInput().value).toBe(String(Date.UTC(2026, 4, 16, 0, 0, 0)));
  });

  it('shows the current wall-clock instant encoded as Unix seconds', () => {
    renderEditor('s');
    expect(previewInput().value).toBe(String(Date.UTC(2026, 4, 16, 0, 0, 0) / 1000));
  });

  it('shows the current wall-clock instant encoded as ISO 8601 (no ms)', () => {
    renderEditor('iso');
    expect(previewInput().value).toBe('2026-05-16T00:00:00Z');
  });

  it('preview field is read-only', () => {
    renderEditor('iso');
    expect(previewInput()).toHaveAttribute('readonly');
  });

  it('advances the preview each second so it visibly ticks', () => {
    renderEditor('s');
    const before = previewInput().value;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    const after = previewInput().value;
    expect(Number(after) - Number(before)).toBe(1);
  });

  it('calls onChange when a different format is selected', () => {
    const onChange = jest.fn();
    renderEditor('ms', { onChange });
    // RadioButtonGroup renders each option as a clickable label; the
    // visible text identifies it.
    fireEvent.click(screen.getByText('ISO 8601'));
    expect(onChange).toHaveBeenCalledWith('iso');
  });

  it('renders an info icon when settings.infoTooltip is set', () => {
    // The actual tooltip content lives in a Grafana Tooltip portal that
    // appears on hover — testing the portal in jsdom is brittle. Verifying
    // the trigger icon is present is enough to confirm the wiring.
    renderEditor('ms', { infoTooltip: 'How to pick the format.' });
    expect(screen.getByLabelText('More info')).toBeInTheDocument();
  });

  it('does not render an info icon when settings.infoTooltip is omitted', () => {
    renderEditor('ms');
    expect(screen.queryByLabelText('More info')).not.toBeInTheDocument();
  });
});
