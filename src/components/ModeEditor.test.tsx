import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StandardEditorProps } from '@grafana/data';
import { Mode } from '../types';
import { ModeEditor } from './ModeEditor';

const makeItem = () => ({ id: 'test', name: 'test' }) as unknown as StandardEditorProps<Mode>['item'];

const renderEditor = (value: Mode, onChange = jest.fn()) =>
  render(
    <ModeEditor
      value={value}
      onChange={onChange}
      item={makeItem()}
      context={{} as never}
    />
  );

describe('ModeEditor', () => {
  it('renders a card for every defined mode', () => {
    renderEditor('basic');
    // Card.Heading wraps its label in a <button>, so each mode shows up as
    // an accessible button.
    expect(screen.getByRole('button', { name: 'Basic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sliding Window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Event Replay' })).toBeInTheDocument();
  });

  it('shows a summary line for every mode', () => {
    renderEditor('basic');
    const group = screen.getByRole('radiogroup', { name: 'Mode' });
    expect(group.textContent).toContain('zero setup');
    expect(group.textContent).toContain('other panels reference');
    expect(group.textContent).toContain('panel-saved time range');
  });

  it('marks the selected mode via isSelected (radio input is checked)', () => {
    renderEditor('sliding');
    // Card with isSelected renders a hidden radio input reflecting state;
    // it has a generic "option" aria-label — only one is checked at a time.
    const radios = screen.getAllByRole('radio');
    const checked = radios.filter((r) => (r as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
  });

  it('calls onChange with the new mode when a card is clicked', () => {
    const onChange = jest.fn();
    renderEditor('basic', onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Sliding Window' }));
    expect(onChange).toHaveBeenCalledWith('sliding');
  });
});
