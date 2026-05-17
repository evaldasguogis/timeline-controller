import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TimeStep } from '../types';
import { TimeStepDropdown } from './TimeStepDropdown';

const cases: Array<{ label: string; value: TimeStep }> = [
  { label: '1s', value: { value: 1, unit: 's' } },
  { label: '5s', value: { value: 5, unit: 's' } },
  { label: '10s', value: { value: 10, unit: 's' } },
  { label: '30s', value: { value: 30, unit: 's' } },
  { label: '1m', value: { value: 1, unit: 'm' } },
  { label: '5m', value: { value: 5, unit: 'm' } },
  { label: '10m', value: { value: 10, unit: 'm' } },
  { label: '30m', value: { value: 30, unit: 'm' } },
  { label: '1h', value: { value: 1, unit: 'h' } },
  { label: '2h', value: { value: 2, unit: 'h' } },
  { label: '4h', value: { value: 4, unit: 'h' } },
  { label: '12h', value: { value: 12, unit: 'h' } },
  { label: '1d', value: { value: 1, unit: 'd' } },
  { label: '1w', value: { value: 1, unit: 'w' } },
  { label: '1mo', value: { value: 1, unit: 'month' } },
  { label: '3mo', value: { value: 3, unit: 'month' } },
  { label: '1y', value: { value: 1, unit: 'y' } },
];

describe('TimeStepDropdown', () => {
  describe.each(cases)('renders selected label for $label', ({ label, value }) => {
    it(`shows ${label}`, () => {
      render(<TimeStepDropdown value={value} onChange={jest.fn()} />);
      expect(screen.getByDisplayValue(label)).toBeInTheDocument();
    });
  });

  it('falls back to the default time step (1m) when value is undefined', () => {
    render(<TimeStepDropdown value={undefined as unknown as TimeStep} onChange={jest.fn()} />);
    expect(screen.getByDisplayValue('1m')).toBeInTheDocument();
  });

});
