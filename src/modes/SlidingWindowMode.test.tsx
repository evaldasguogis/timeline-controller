import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { dateTime, TimeRange } from '@grafana/data';
import {
  defaultTimelineControllerOptions,
  SlidingWindowModeOptions,
  TimelineControllerOptions,
} from '../types';
import { SlidingWindowMode } from './SlidingWindowMode';

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

const T0 = Date.UTC(2026, 4, 16, 0, 0, 0); // 2026-05-16T00:00:00Z
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const makeRange = (fromMs: number, toMs: number): TimeRange => ({
  from: dateTime(fromMs),
  to: dateTime(toMs),
  raw: { from: String(fromMs), to: String(toMs) },
});

const slidingOnly = (overrides: Partial<SlidingWindowModeOptions> = {}): TimelineControllerOptions => ({
  ...defaultTimelineControllerOptions,
  mode: 'sliding',
  sliding: { ...defaultTimelineControllerOptions.sliding, ...overrides },
});

const renderSliding = (
  overrides: Partial<SlidingWindowModeOptions> = {},
  timeRange: TimeRange = makeRange(T0, T0 + HOUR)
) =>
  render(
    <SlidingWindowMode options={slidingOnly(overrides)} onOptionsChange={jest.fn()} timeRange={timeRange} />
  );

// Ignore writes that are only the usage marker (a side-effect of the
// onOptionsChange call in the marker-sync useEffect doesn't reach
// locationService — those go through the onOptionsChange prop in tests, which
// is jest.fn() and tracked separately). variableSpec-relevant writes always
// include at least one `var-` key.
const lastVarsCall = () => {
  for (let i = partial.mock.calls.length - 1; i >= 0; i--) {
    const params = partial.mock.calls[i][0] as Record<string, string>;
    if (Object.keys(params).some((k) => k.startsWith('var-'))) {
      return params;
    }
  }
  return undefined;
};

describe('SlidingWindowMode', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    partial.mockClear();
    listen.mockClear();
    currentSearch = '';
    // Default: the configured variables exist on the dashboard as textbox
    // variables, so no validation warnings fire.
    dashboardVariables = [
      { name: 'timeFrom', type: 'textbox' },
      { name: 'timeTo', type: 'textbox' },
    ];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders transport controls and the progress bar at the initial window', () => {
    renderSliding({ timeStep: '5m' });

    expect(screen.getByLabelText('Step forward')).toBeInTheDocument();
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
    expect(screen.getByLabelText('Jump to start')).toBeInTheDocument();
    expect(screen.getByLabelText('Jump to end')).toBeInTheDocument();
    // Basic-mode Reset was replaced by Jump-to-start/end; ensure it's gone.
    expect(screen.queryByLabelText('Reset')).not.toBeInTheDocument();

    // Initial window: [T0, T0+5m] anchored to the left edge of the boundary.
    const position = screen.getByLabelText('Current window');
    expect(position.getAttribute('aria-valuetext')).toContain('2026-05-16 00:00:00');
    expect(position.getAttribute('aria-valuetext')).toContain('2026-05-16 00:05:00');
  });

  it('does not write any window variables on mount', () => {
    renderSliding();
    expect(lastVarsCall()).toBeUndefined();
  });

  it('Jump to start is initially disabled (window already at left edge)', () => {
    renderSliding();
    expect(screen.getByLabelText('Jump to start')).toBeDisabled();
  });

  it('Jump to end is initially enabled (window not at right edge)', () => {
    renderSliding();
    expect(screen.getByLabelText('Jump to end')).toBeEnabled();
  });

  it('Step forward writes a window shifted by one step in ms', () => {
    renderSliding({ timeStep: '5m' });

    act(() => {
      screen.getByLabelText('Step forward').click();
    });

    // Initial: [T0, T0+5m]. After step forward: [T0+5m, T0+10m].
    expect(lastVarsCall()).toEqual({
      'var-timeFrom': String(T0 + 5 * MINUTE),
      'var-timeTo': String(T0 + 10 * MINUTE),
    });
    expect(screen.getByLabelText('Jump to start')).toBeEnabled();
  });

  it('Step backward from the left edge is disabled', () => {
    renderSliding({ timeStep: '5m' });

    expect(screen.getByLabelText('Step back')).toBeDisabled();
    expect(screen.getByLabelText('Play backward')).toBeDisabled();
  });

  it('Playback advances the window every tickIntervalMs', () => {
    renderSliding({ timeStep: '10m', tickIntervalMs: 500 });

    act(() => {
      screen.getByLabelText('Play forward').click();
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    // After one tick: [T0+10m, T0+20m].
    expect(lastVarsCall()).toEqual({
      'var-timeFrom': String(T0 + 10 * MINUTE),
      'var-timeTo': String(T0 + 20 * MINUTE),
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });
    // After two ticks: [T0+20m, T0+30m].
    expect(lastVarsCall()).toEqual({
      'var-timeFrom': String(T0 + 20 * MINUTE),
      'var-timeTo': String(T0 + 30 * MINUTE),
    });
  });

  it('Auto-pauses when the window hits the right boundary', () => {
    // Boundary is 1h; step 30m. Initial [T0, T0+30m]. Tick → [T0+30m, T0+1h]
    // (clamped, boundaryHit=true). Next tick should not fire.
    renderSliding({ timeStep: '30m', tickIntervalMs: 500 });

    act(() => {
      screen.getByLabelText('Play forward').click();
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(lastVarsCall()).toEqual({
      'var-timeFrom': String(T0 + 30 * MINUTE),
      'var-timeTo': String(T0 + 60 * MINUTE),
    });
    const varCallCount = partial.mock.calls.filter((c) =>
      Object.keys(c[0] as Record<string, string>).some((k) => k.startsWith('var-'))
    ).length;

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    const varCallCountAfter = partial.mock.calls.filter((c) =>
      Object.keys(c[0] as Record<string, string>).some((k) => k.startsWith('var-'))
    ).length;
    expect(varCallCountAfter).toBe(varCallCount);
  });

  it('Jump to start writes the initial window and pauses', () => {
    renderSliding({ timeStep: '5m' });

    act(() => {
      screen.getByLabelText('Step forward').click();
    });
    act(() => {
      screen.getByLabelText('Step forward').click();
    });
    partial.mockClear();

    act(() => {
      screen.getByLabelText('Jump to start').click();
    });

    expect(lastVarsCall()).toEqual({
      'var-timeFrom': String(T0),
      'var-timeTo': String(T0 + 5 * MINUTE),
    });
    expect(screen.getByLabelText('Jump to start')).toBeDisabled();
  });

  it('Jump to end writes the window at the right edge and pauses', () => {
    // Boundary 1h, step 5m. Right-edge window: [T0+55m, T0+60m].
    renderSliding({ timeStep: '5m' });

    act(() => {
      screen.getByLabelText('Jump to end').click();
    });

    expect(lastVarsCall()).toEqual({
      'var-timeFrom': String(T0 + 55 * MINUTE),
      'var-timeTo': String(T0 + 60 * MINUTE),
    });
    expect(screen.getByLabelText('Jump to end')).toBeDisabled();
  });

  it('respects configured variable names', () => {
    renderSliding({
      timeStep: '5m',
      variableFrom: 'windowStart',
      variableTo: 'windowEnd',
    });

    act(() => {
      screen.getByLabelText('Step forward').click();
    });

    const vars = lastVarsCall();
    expect(Object.keys(vars!)).toEqual(['var-windowStart', 'var-windowEnd']);
  });

  it('encodes values in the seconds format', () => {
    renderSliding({ timeStep: '5m', timeFormat: 's' });

    act(() => {
      screen.getByLabelText('Step forward').click();
    });

    expect(lastVarsCall()).toEqual({
      'var-timeFrom': String(Math.floor((T0 + 5 * MINUTE) / 1000)),
      'var-timeTo': String(Math.floor((T0 + 10 * MINUTE) / 1000)),
    });
  });

  it('encodes values in the ISO format', () => {
    renderSliding({ timeStep: '5m', timeFormat: 'iso' });

    act(() => {
      screen.getByLabelText('Step forward').click();
    });

    expect(lastVarsCall()).toEqual({
      'var-timeFrom': '2026-05-16T00:05:00Z',
      'var-timeTo': '2026-05-16T00:10:00Z',
    });
  });

  it('does not write any step variable on tick (step is set via dropdown only)', () => {
    // Tick writes are window from/to only. Step lives in the variable's
    // current value, written when the user picks via the dropdown — not on
    // every tick.
    renderSliding({ timeStep: '5m', variableStep: 'step' });

    act(() => {
      screen.getByLabelText('Step forward').click();
    });

    const vars = lastVarsCall()!;
    expect(Object.keys(vars).sort()).toEqual(['var-timeFrom', 'var-timeTo']);
  });

  it('Resets window state when the dashboard global range changes', () => {
    const initial = makeRange(T0, T0 + HOUR);
    const { rerender } = renderSliding({ timeStep: '5m' }, initial);

    act(() => {
      screen.getByLabelText('Step forward').click();
    });
    expect(screen.getByLabelText('Jump to start')).toBeEnabled();

    const next = makeRange(T0 + HOUR, T0 + 2 * HOUR);
    rerender(
      <SlidingWindowMode
        options={slidingOnly({ timeStep: '5m' })}
        onOptionsChange={jest.fn()}
        timeRange={next}
      />
    );

    // After external boundary change: window snaps back to the new boundary's
    // left edge, so Jump-to-start is disabled again.
    expect(screen.getByLabelText('Jump to start')).toBeDisabled();
    const position = screen.getByLabelText('Current window');
    expect(position.getAttribute('aria-valuetext')).toContain('2026-05-16 01:00:00');
    expect(position.getAttribute('aria-valuetext')).toContain('2026-05-16 01:05:00');
  });

  it('Pauses any active playback when the dashboard global range changes', () => {
    const initial = makeRange(T0, T0 + HOUR);
    const { rerender } = renderSliding({ timeStep: '5m', tickIntervalMs: 500 }, initial);

    act(() => {
      screen.getByLabelText('Play forward').click();
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    const next = makeRange(T0 + HOUR, T0 + 2 * HOUR);
    rerender(
      <SlidingWindowMode
        options={slidingOnly({ timeStep: '5m', tickIntervalMs: 500 })}
        onOptionsChange={jest.fn()}
        timeRange={next}
      />
    );
    const before = partial.mock.calls.length;

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(partial.mock.calls.length).toBe(before);
  });

  it('Disables both step buttons when timeStep is larger than the boundary', () => {
    // Boundary 1h, step 2h.
    renderSliding({ timeStep: '2h' });

    expect(screen.getByLabelText('Step forward')).toBeDisabled();
    expect(screen.getByLabelText('Step back')).toBeDisabled();
    expect(screen.getByLabelText('Play forward')).toBeDisabled();
    expect(screen.getByLabelText('Play backward')).toBeDisabled();
  });

  describe('display toggles', () => {
    it('renders the progress track and value readout by default', () => {
      renderSliding();
      expect(screen.getByLabelText('Current window')).toBeInTheDocument();
      expect(screen.getByLabelText('Current window values')).toBeInTheDocument();
    });

    it('hides the progress track when showProgressTrack is false', () => {
      renderSliding({ showProgressTrack: false });
      expect(screen.queryByLabelText('Current window')).not.toBeInTheDocument();
      // Readout still shows; controls still present.
      expect(screen.getByLabelText('Current window values')).toBeInTheDocument();
      expect(screen.getByLabelText('Play forward')).toBeInTheDocument();
    });

    it('hides the value readout when showCurrentValues is false', () => {
      renderSliding({ showCurrentValues: false });
      expect(screen.queryByLabelText('Current window values')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Current window')).toBeInTheDocument();
    });

    it('hides both when both toggles are off — only transport controls remain', () => {
      renderSliding({ showProgressTrack: false, showCurrentValues: false });
      expect(screen.queryByLabelText('Current window')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Current window values')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Play forward')).toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('renders an error banner and hides the controls when variableFrom is empty', () => {
      renderSliding({ variableFrom: '' });
      expect(screen.getByText(/Variable name "from" is required/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Play forward')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Jump to start')).not.toBeInTheDocument();
    });

    it('renders an error banner when variableFrom equals variableTo', () => {
      dashboardVariables = [{ name: 'x', type: 'textbox' }];
      renderSliding({ variableFrom: 'x', variableTo: 'x' });
      expect(screen.getByText(/must be unique/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Play forward')).not.toBeInTheDocument();
    });

    it('does not write variables while in an error state', () => {
      renderSliding({ variableFrom: '', tickIntervalMs: 500 });
      // No controls to click — make sure nothing fired on mount or in any
      // background timer.
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(lastVarsCall()).toBeUndefined();
    });

    it('shows a warning when a configured variable is not defined on the dashboard, but still writes', () => {
      dashboardVariables = [{ name: 'timeFrom', type: 'textbox' }];
      renderSliding();

      expect(screen.getByText(/"timeTo" is not defined/)).toBeInTheDocument();
      // Controls still render and writes proceed.
      act(() => {
        screen.getByLabelText('Step forward').click();
      });
      expect(lastVarsCall()).toBeDefined();
    });

    it('shows a warning when a configured name collides with a non-writeable variable type', () => {
      dashboardVariables = [
        { name: 'timeFrom', type: 'query' },
        { name: 'timeTo', type: 'textbox' },
      ];
      renderSliding();

      expect(screen.getByText(/"timeFrom" is a "query" variable/)).toBeInTheDocument();
      // Still functional.
      expect(screen.getByLabelText('Play forward')).toBeInTheDocument();
    });
  });
});
