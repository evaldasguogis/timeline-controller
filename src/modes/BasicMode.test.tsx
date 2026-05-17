import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { dateTime, TimeRange } from '@grafana/data';
import { defaultTimelineControllerOptions, TimelineControllerOptions } from '../types';
import { BasicMode } from './BasicMode';

const partial = jest.fn();
let currentSearch = '?from=2026-05-16T00:00:00Z&to=2026-05-16T01:00:00Z';

jest.mock('@grafana/runtime', () => ({
  locationService: {
    partial: (params: Record<string, string>) => {
      partial(params);
      const usp = new URLSearchParams(currentSearch);
      Object.entries(params).forEach(([k, v]) => usp.set(k, v));
      currentSearch = '?' + usp.toString();
    },
    getSearch: () => currentSearch,
  },
}));

const initialTimeRange: TimeRange = {
  from: dateTime('2026-05-16T00:00:00Z'),
  to: dateTime('2026-05-16T01:00:00Z'),
  raw: { from: 'now-1h', to: 'now' },
};

const makeOptions = (overrides: Partial<TimelineControllerOptions> = {}): TimelineControllerOptions => ({
  ...defaultTimelineControllerOptions,
  ...overrides,
  basic: { ...defaultTimelineControllerOptions.basic, ...overrides.basic },
});

const renderBasic = (overrides: Partial<TimelineControllerOptions> = {}, timeRange = initialTimeRange) => {
  return render(<BasicMode options={makeOptions(overrides)} onOptionsChange={jest.fn()} timeRange={timeRange} />);
};

const rerenderWith = (
  rerender: (ui: React.ReactElement) => void,
  timeRange: TimeRange,
  overrides: Partial<TimelineControllerOptions> = {}
) => {
  rerender(<BasicMode options={makeOptions(overrides)} onOptionsChange={jest.fn()} timeRange={timeRange} />);
};

describe('BasicMode', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    partial.mockClear();
    currentSearch = '?from=2026-05-16T00:00:00Z&to=2026-05-16T01:00:00Z';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders transport controls including Reset, but no Jump-to-start/end', () => {
    renderBasic();
    expect(screen.getByLabelText('Play forward')).toBeInTheDocument();
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
    expect(screen.getByLabelText('Step forward')).toBeInTheDocument();
    expect(screen.getByLabelText('Reset')).toBeInTheDocument();
    expect(screen.queryByLabelText('Jump to start')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Jump to end')).not.toBeInTheDocument();
  });

  it('disables forward buttons when a full step would land past now()', () => {
    const atRightBoundary = {
      from: dateTime().subtract(1, 'h'),
      to: dateTime(),
      raw: { from: 'now-1h', to: 'now' },
    };
    render(
      <BasicMode options={defaultTimelineControllerOptions} onOptionsChange={jest.fn()} timeRange={atRightBoundary} />
    );

    expect(screen.getByLabelText('Step forward')).toBeDisabled();
    expect(screen.getByLabelText('Play forward')).toBeDisabled();
    expect(screen.getByLabelText('Step back')).toBeEnabled();
    expect(screen.getByLabelText('Play backward')).toBeEnabled();
  });

  it('Reset is initially disabled (nothing to reset to)', () => {
    renderBasic();
    expect(screen.getByLabelText('Reset')).toHaveAttribute('aria-disabled', 'true');
  });

  it('Reset becomes enabled after our plugin steps the range', () => {
    renderBasic();

    act(() => {
      screen.getByLabelText('Step back').click();
    });

    expect(screen.getByLabelText('Reset')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('advances the global time range when playing forward', () => {
    renderBasic();

    act(() => {
      screen.getByLabelText('Play forward').click();
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(partial).toHaveBeenCalled();
    const lastCall = partial.mock.calls[partial.mock.calls.length - 1][0];
    expect(lastCall).toHaveProperty('from');
    expect(lastCall).toHaveProperty('to');
  });

  it('stops ticking after Pause is clicked', () => {
    renderBasic();

    act(() => {
      screen.getByLabelText('Play forward').click();
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    const callsAfterFirstTick = partial.mock.calls.length;

    act(() => {
      screen.getByLabelText('Pause').click();
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(partial.mock.calls.length).toBe(callsAfterFirstTick);
  });

  it('writes from/to for a single Step forward without starting the timer', () => {
    renderBasic();

    act(() => {
      screen.getByLabelText('Step forward').click();
    });

    expect(partial).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(partial).toHaveBeenCalledTimes(1);
  });

  it('Reset restores the cached baseline and pauses', () => {
    renderBasic();

    act(() => {
      screen.getByLabelText('Step back').click();
    });
    act(() => {
      screen.getByLabelText('Step back').click();
    });
    partial.mockClear();

    act(() => {
      screen.getByLabelText('Reset').click();
    });

    expect(partial).toHaveBeenCalledTimes(1);
    expect(partial).toHaveBeenCalledWith({ from: 'now-1h', to: 'now' });
    expect(screen.getByLabelText('Reset')).toHaveAttribute('aria-disabled', 'true');
  });

  it('Reset stops an active playback', () => {
    renderBasic();

    act(() => {
      screen.getByLabelText('Play backward').click();
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    act(() => {
      screen.getByLabelText('Reset').click();
    });
    partial.mockClear();
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(partial).not.toHaveBeenCalled();
  });

  it('External time-picker change pauses any active playback', () => {
    const { rerender } = renderBasic();

    act(() => {
      screen.getByLabelText('Play backward').click();
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Simulate the user picking a new range via the global time picker.
    const externalRange: TimeRange = {
      from: dateTime('2026-05-16T00:30:00Z'),
      to: dateTime('2026-05-16T01:00:00Z'),
      raw: { from: 'now-30m', to: 'now' },
    };
    rerenderWith(rerender, externalRange);
    partial.mockClear();
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(partial).not.toHaveBeenCalled();
  });

  it('Adopts an external time-picker change as the new baseline', () => {
    const { rerender } = renderBasic();

    // Step away from the initial baseline so hasStepped=true.
    act(() => {
      screen.getByLabelText('Step back').click();
    });
    expect(screen.getByLabelText('Reset')).not.toHaveAttribute('aria-disabled', 'true');

    // Simulate the user picking "last 30 minutes" via the global time picker.
    const externalRange: TimeRange = {
      from: dateTime('2026-05-16T00:30:00Z'),
      to: dateTime('2026-05-16T01:00:00Z'),
      raw: { from: 'now-30m', to: 'now' },
    };
    rerenderWith(rerender, externalRange);

    // External change wipes hasStepped and adopts the new baseline.
    expect(screen.getByLabelText('Reset')).toHaveAttribute('aria-disabled', 'true');

    // Step back; the new baseline 'now-30m' should be what Reset restores.
    act(() => {
      screen.getByLabelText('Step back').click();
    });
    partial.mockClear();

    act(() => {
      screen.getByLabelText('Reset').click();
    });

    expect(partial).toHaveBeenCalledWith({ from: 'now-30m', to: 'now' });
  });
});
