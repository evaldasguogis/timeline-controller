import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  defaultTimelineControllerOptions,
  EventReplayModeOptions,
  TimelineControllerOptions,
} from '../types';
import { EventReplayMode } from './EventReplayMode';

const partial = jest.fn();
const listen = jest.fn(() => () => {});
let currentSearch = '';
let dashboardVariables: Array<{ name: string; type: string }> = [];

jest.mock('@grafana/runtime', () => ({
  locationService: {
    partial: (params: Record<string, string>, replace?: boolean) => partial(params, replace),
    getSearch: () => currentSearch,
    getHistory: () => ({ listen }),
  },
  getTemplateSrv: () => ({ getVariables: () => dashboardVariables }),
}));

const T0 = Date.UTC(2026, 4, 16, 0, 0, 0);
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const eventOnly = (overrides: Partial<EventReplayModeOptions> = {}): TimelineControllerOptions => ({
  ...defaultTimelineControllerOptions,
  mode: 'event',
  event: {
    ...defaultTimelineControllerOptions.event,
    // Configured boundary so the mode renders past validation; tests
    // override per-case as needed.
    boundaryFrom: T0,
    boundaryTo: T0 + HOUR,
    ...overrides,
  },
});

const renderEvent = (overrides: Partial<EventReplayModeOptions> = {}) =>
  render(<EventReplayMode options={eventOnly(overrides)} onOptionsChange={jest.fn()} />);

const lastVarsCall = () => {
  for (let i = partial.mock.calls.length - 1; i >= 0; i--) {
    const params = partial.mock.calls[i][0] as Record<string, string>;
    if (Object.keys(params).some((k) => k.startsWith('var-'))) {
      return params;
    }
  }
  return undefined;
};

describe('EventReplayMode', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    partial.mockClear();
    listen.mockClear();
    currentSearch = '';
    dashboardVariables = [
      { name: 'timeFrom', type: 'textbox' },
      { name: 'timeTo', type: 'textbox' },
    ];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders transport controls and the progress track at the initial window', () => {
    renderEvent({ timeStep: '5m' });
    expect(screen.getByLabelText('Step forward')).toBeInTheDocument();
    expect(screen.getByLabelText('Jump to start')).toBeInTheDocument();
    const position = screen.getByLabelText('Current window');
    expect(position.getAttribute('aria-valuetext')).toContain('2026-05-16 00:00:00');
    expect(position.getAttribute('aria-valuetext')).toContain('2026-05-16 00:05:00');
  });

  it('does not write any variables on mount', () => {
    renderEvent();
    expect(lastVarsCall()).toBeUndefined();
  });

  it('Step forward writes a window shifted by one step', () => {
    renderEvent({ timeStep: '5m' });
    act(() => {
      screen.getByLabelText('Step forward').click();
    });
    expect(lastVarsCall()).toEqual({
      'var-timeFrom': String(T0 + 5 * MINUTE),
      'var-timeTo': String(T0 + 10 * MINUTE),
    });
  });

  it('Auto-pauses when the window hits the right boundary', () => {
    renderEvent({ timeStep: '30m', tickIntervalMs: 500 });
    act(() => {
      screen.getByLabelText('Play forward').click();
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const varCallsBefore = partial.mock.calls.filter((c) =>
      Object.keys(c[0] as Record<string, string>).some((k) => k.startsWith('var-'))
    ).length;
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    const varCallsAfter = partial.mock.calls.filter((c) =>
      Object.keys(c[0] as Record<string, string>).some((k) => k.startsWith('var-'))
    ).length;
    expect(varCallsAfter).toBe(varCallsBefore);
  });

  it('Jump to start is initially disabled (window already at left edge)', () => {
    renderEvent({ timeStep: '5m' });
    expect(screen.getByLabelText('Jump to start')).toBeDisabled();
  });

  it('Jump to end writes the window at the right edge and disables itself', () => {
    renderEvent({ timeStep: '5m' });
    act(() => {
      screen.getByLabelText('Jump to end').click();
    });
    expect(lastVarsCall()).toEqual({
      'var-timeFrom': String(T0 + 55 * MINUTE),
      'var-timeTo': String(T0 + 60 * MINUTE),
    });
    expect(screen.getByLabelText('Jump to end')).toBeDisabled();
  });

  it('Disables both step buttons when timeStep is larger than the boundary', () => {
    // Boundary 1h, step 2h.
    renderEvent({ timeStep: '2h' });
    expect(screen.getByLabelText('Step forward')).toBeDisabled();
    expect(screen.getByLabelText('Step back')).toBeDisabled();
    expect(screen.getByLabelText('Play forward')).toBeDisabled();
    expect(screen.getByLabelText('Play backward')).toBeDisabled();
  });

  it('encodes values in the seconds format', () => {
    renderEvent({ timeStep: '5m', timeFormat: 's' });
    act(() => {
      screen.getByLabelText('Step forward').click();
    });
    expect(lastVarsCall()).toEqual({
      'var-timeFrom': String(Math.floor((T0 + 5 * MINUTE) / 1000)),
      'var-timeTo': String(Math.floor((T0 + 10 * MINUTE) / 1000)),
    });
  });

  describe('display toggles', () => {
    it('hides the progress track when showProgressTrack is false', () => {
      renderEvent({ showProgressTrack: false });
      expect(screen.queryByLabelText('Current window')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Current window values')).toBeInTheDocument();
    });

    it('hides the value readout when showCurrentValues is false', () => {
      renderEvent({ showCurrentValues: false });
      expect(screen.queryByLabelText('Current window values')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Current window')).toBeInTheDocument();
    });
  });

  it('Resets window state when the configured boundary changes', () => {
    const { rerender } = renderEvent({ timeStep: '5m' });
    act(() => {
      screen.getByLabelText('Step forward').click();
    });
    expect(screen.getByLabelText('Jump to start')).toBeEnabled();

    rerender(
      <EventReplayMode
        options={eventOnly({ timeStep: '5m', boundaryFrom: T0 + HOUR, boundaryTo: T0 + 2 * HOUR })}
        onOptionsChange={jest.fn()}
      />
    );

    expect(screen.getByLabelText('Jump to start')).toBeDisabled();
    const position = screen.getByLabelText('Current window');
    expect(position.getAttribute('aria-valuetext')).toContain('2026-05-16 01:00:00');
    expect(position.getAttribute('aria-valuetext')).toContain('2026-05-16 01:05:00');
  });

  describe('boundary validation', () => {
    it('blocks the panel when boundary is unset (both 0)', () => {
      renderEvent({ boundaryFrom: 0, boundaryTo: 0 });
      expect(screen.getByText(/Event boundary is not set/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Play forward')).not.toBeInTheDocument();
    });

    it('blocks the panel when boundary is inverted (from >= to)', () => {
      renderEvent({ boundaryFrom: T0 + HOUR, boundaryTo: T0 });
      expect(screen.getByText(/must be before/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Play forward')).not.toBeInTheDocument();
    });

    it('does not write variables while in an unset-boundary state', () => {
      renderEvent({ boundaryFrom: 0, boundaryTo: 0, tickIntervalMs: 500 });
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(lastVarsCall()).toBeUndefined();
    });
  });

  describe('variable validation', () => {
    it('blocks the panel when variableFrom is empty', () => {
      renderEvent({ variableFrom: '' });
      expect(screen.getByText(/Variable name "from" is required/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Play forward')).not.toBeInTheDocument();
    });
  });
});
