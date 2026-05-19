import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TimeStep } from '../types';
import { TimeStepDropdown } from './TimeStepDropdown';

const cases: TimeStep[] = ['1s', '5s', '10s', '30s', '1m', '5m', '10m', '30m', '1h', '2h', '4h', '12h', '1d', '1w', '1M', '3M', '1y'];

describe('TimeStepDropdown', () => {
  describe.each(cases)('renders selected label for %s', (step) => {
    it(`shows ${step}`, () => {
      render(<TimeStepDropdown value={step} onChange={jest.fn()} />);
      expect(screen.getByDisplayValue(step)).toBeInTheDocument();
    });
  });

  it('falls back to the default time step (1m) when value is undefined', () => {
    render(<TimeStepDropdown value={undefined as unknown as TimeStep} onChange={jest.fn()} />);
    expect(screen.getByDisplayValue('1m')).toBeInTheDocument();
  });
});
