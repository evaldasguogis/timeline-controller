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
  it('renders a radio button for every defined mode', () => {
    renderEditor('basic');
    // Each mode's name appears twice — once as the radio button label, once
    // in the always-visible summary list — so use getAllByText.
    expect(screen.getAllByText('Basic').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sliding Window').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Event Replay').length).toBeGreaterThanOrEqual(1);
  });

  it('shows a summary line for every mode (visible, not tooltip)', () => {
    renderEditor('basic');
    const list = screen.getByLabelText('Mode descriptions');
    expect(list).toBeInTheDocument();
    // Spot-check each summary's distinguishing phrase is present.
    expect(list.textContent).toContain('zero setup');
    expect(list.textContent).toContain('other panels reference');
    expect(list.textContent).toContain('panel-saved time range');
  });

  it('calls onChange with the new mode when a radio is clicked', () => {
    const onChange = jest.fn();
    renderEditor('basic', onChange);
    // The radio button itself is identifiable by role; clicking its label
    // through getAllByText would hit the summary list instead.
    fireEvent.click(screen.getByRole('radio', { name: 'Sliding Window' }));
    expect(onChange).toHaveBeenCalledWith('sliding');
  });
});
