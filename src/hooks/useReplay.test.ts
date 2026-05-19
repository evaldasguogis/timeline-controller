import { act, renderHook } from '@testing-library/react';
import { TickResult, useReplay } from './useReplay';

const renderReplay = (
  onTickImpl: (forward: boolean) => TickResult,
  tickIntervalMs = 1000
) => {
  const onTick = jest.fn(onTickImpl);
  const { result, rerender } = renderHook(
    ({ onTick: ot, tickIntervalMs: ti }: { onTick: typeof onTick; tickIntervalMs: number }) =>
      useReplay({ onTick: ot, tickIntervalMs: ti }),
    { initialProps: { onTick, tickIntervalMs } }
  );
  return {
    result,
    onTick,
    rerender: (next: { onTick?: typeof onTick; tickIntervalMs?: number }) =>
      rerender({
        onTick: next.onTick ?? onTick,
        tickIntervalMs: next.tickIntervalMs ?? tickIntervalMs,
      }),
  };
};

const noBoundary = (): TickResult => ({ boundaryHit: false });

describe('useReplay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initial state is paused with no ticks', () => {
    const { result, onTick } = renderReplay(noBoundary);
    expect(result.current.state).toBe('paused');
    expect(onTick).not.toHaveBeenCalled();
  });

  it('startPlayback(true) sets state to playing-forward and ticks on the interval', () => {
    const { result, onTick } = renderReplay(noBoundary, 500);
    act(() => result.current.startPlayback(true));
    expect(result.current.state).toBe('playing-forward');

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenLastCalledWith(true);

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('startPlayback(false) sets state to playing-back and ticks with forward=false', () => {
    const { result, onTick } = renderReplay(noBoundary, 500);
    act(() => result.current.startPlayback(false));
    expect(result.current.state).toBe('playing-back');

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onTick).toHaveBeenLastCalledWith(false);
  });

  it('pause stops the timer and sets state to paused', () => {
    const { result, onTick } = renderReplay(noBoundary, 500);
    act(() => result.current.startPlayback(true));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const callsBeforePause = onTick.mock.calls.length;

    act(() => result.current.pause());
    expect(result.current.state).toBe('paused');

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onTick).toHaveBeenCalledTimes(callsBeforePause);
  });

  it('step(forward) fires onTick once and leaves state paused', () => {
    const { result, onTick } = renderReplay(noBoundary);
    act(() => result.current.step(true));
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenLastCalledWith(true);
    expect(result.current.state).toBe('paused');
  });

  it('step while playing pauses then fires onTick once', () => {
    const { result, onTick } = renderReplay(noBoundary, 500);
    act(() => result.current.startPlayback(true));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const callsAfterFirstTick = onTick.mock.calls.length;

    act(() => result.current.step(false));
    expect(result.current.state).toBe('paused');
    expect(onTick).toHaveBeenCalledTimes(callsAfterFirstTick + 1);

    // No further ticks once paused.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onTick).toHaveBeenCalledTimes(callsAfterFirstTick + 1);
  });

  it('auto-pauses when onTick returns boundaryHit', () => {
    let calls = 0;
    const { result, onTick } = renderReplay(() => {
      calls += 1;
      return { boundaryHit: calls >= 2 };
    }, 500);

    act(() => result.current.startPlayback(true));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.state).toBe('playing-forward');

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.state).toBe('paused');
    expect(onTick).toHaveBeenCalledTimes(2);

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('startPlayback while already playing clears the previous timer', () => {
    const { result, onTick } = renderReplay(noBoundary, 500);
    act(() => result.current.startPlayback(true));
    act(() => result.current.startPlayback(false));

    act(() => {
      jest.advanceTimersByTime(500);
    });
    // Only the new (backward) timer fired; the original forward one was cleared.
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenLastCalledWith(false);
  });

  it('uses the latest onTick when it changes mid-playback', () => {
    const firstTick = jest.fn(noBoundary);
    const secondTick = jest.fn(noBoundary);
    const { result, rerender } = renderHook(
      ({ onTick }: { onTick: jest.Mock }) => useReplay({ onTick, tickIntervalMs: 500 }),
      { initialProps: { onTick: firstTick } }
    );

    act(() => result.current.startPlayback(true));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(firstTick).toHaveBeenCalledTimes(1);

    rerender({ onTick: secondTick });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(secondTick).toHaveBeenCalledTimes(1);
    expect(firstTick).toHaveBeenCalledTimes(1);
  });

  it('clears the running timer on unmount', () => {
    const onTick = jest.fn(noBoundary);
    const { result, unmount } = renderHook(() =>
      useReplay({ onTick, tickIntervalMs: 500 })
    );

    act(() => result.current.startPlayback(true));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const callsBeforeUnmount = onTick.mock.calls.length;

    unmount();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onTick).toHaveBeenCalledTimes(callsBeforeUnmount);
  });
});
