import { renderHook, act } from '@testing-library/react';
import { dateTime, TimeRange } from '@grafana/data';
import { useExternalTimeRangeWatcher } from './useExternalTimeRangeWatcher';

// Use absolute-ms values throughout so the test data doesn't drift relative
// to wall-clock. `toAbsoluteMs` on a numeric string returns the parsed ms,
// so `toAbsoluteMs(String(ms)) === timeRange.from.valueOf()` exactly.
const makeRange = (fromMs: number, toMs: number): TimeRange => ({
  from: dateTime(fromMs),
  to: dateTime(toMs),
  raw: { from: String(fromMs), to: String(toMs) },
});

// Reference points. The actual values don't matter as long as they differ
// meaningfully (> EXTERNAL_CHANGE_TOLERANCE_MS = 1500ms).
const T0 = 1_747_350_000_000;
const HOUR = 60 * 60 * 1000;

const renderWatcher = (initial: TimeRange, onExternalChange = jest.fn()) => {
  const lastWrittenAbsRef = { current: null } as React.MutableRefObject<{
    from: number;
    to: number;
  } | null>;

  const { result, rerender } = renderHook(
    ({ timeRange }: { timeRange: TimeRange }) =>
      useExternalTimeRangeWatcher({
        timeRange,
        lastWrittenAbsRef,
        onExternalChange,
      }),
    { initialProps: { timeRange: initial } }
  );

  return {
    result,
    rerender: (timeRange: TimeRange) => rerender({ timeRange }),
    lastWrittenAbsRef,
    onExternalChange,
  };
};

describe('useExternalTimeRangeWatcher', () => {
  const initialRange = makeRange(T0, T0 + HOUR);

  it('initializes baseline to the first timeRange', () => {
    const { result } = renderWatcher(initialRange);
    expect(result.current).toEqual(initialRange.raw);
  });

  it('treats the initial render as a baseline echo (no callback)', () => {
    const { onExternalChange } = renderWatcher(initialRange);
    expect(onExternalChange).not.toHaveBeenCalled();
  });

  it('treats a write echo as ours: baseline unchanged, callback not fired', () => {
    const { result, rerender, lastWrittenAbsRef, onExternalChange } = renderWatcher(initialRange);

    // Pretend the caller wrote a new range to the URL: it sets
    // lastWrittenAbsRef before the prop update arrives.
    const stepped = makeRange(T0 - HOUR, T0);
    lastWrittenAbsRef.current = { from: stepped.from.valueOf(), to: stepped.to.valueOf() };

    act(() => {
      rerender(stepped);
    });

    expect(result.current).toEqual(initialRange.raw);
    expect(onExternalChange).not.toHaveBeenCalled();
  });

  it('treats a range matching the current baseline as a baseline echo: no change', () => {
    const { result, rerender, onExternalChange } = renderWatcher(initialRange);

    // Re-render with a fresh range object holding the same values — common
    // after Reset writes the baseline back to the URL.
    act(() => {
      rerender(makeRange(T0, T0 + HOUR));
    });

    expect(result.current).toEqual(initialRange.raw);
    expect(onExternalChange).not.toHaveBeenCalled();
  });

  it('adopts an external change as the new baseline and fires the callback', () => {
    const { result, rerender, onExternalChange } = renderWatcher(initialRange);

    const external = makeRange(T0 - 30 * 60_000, T0 + HOUR);

    act(() => {
      rerender(external);
    });

    expect(result.current).toEqual(external.raw);
    expect(onExternalChange).toHaveBeenCalledTimes(1);
  });

  it('reacts to user picks before any write (lastWrittenAbsRef stays null)', () => {
    const { result, rerender, lastWrittenAbsRef, onExternalChange } = renderWatcher(initialRange);
    expect(lastWrittenAbsRef.current).toBeNull();

    const external = makeRange(T0 + 5 * 60_000, T0 + HOUR);

    act(() => {
      rerender(external);
    });

    expect(result.current).toEqual(external.raw);
    expect(onExternalChange).toHaveBeenCalledTimes(1);
  });

  it('three consecutive external picks land baseline on the latest', () => {
    const { result, rerender, onExternalChange } = renderWatcher(initialRange);

    const picks: TimeRange[] = [
      makeRange(T0 - 30 * 60_000, T0 + HOUR),
      makeRange(T0 - 15 * 60_000, T0 + HOUR),
      makeRange(T0 - 5 * 60_000, T0 + HOUR),
    ];
    picks.forEach((pick) =>
      act(() => {
        rerender(pick);
      })
    );

    expect(result.current).toEqual(picks[2].raw);
    expect(onExternalChange).toHaveBeenCalledTimes(3);
  });
});
