import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WindowProgressTrack } from './WindowProgressTrack';

// All timestamps in tests are ms since epoch on a fixed day so the readable
// `aria-valuetext` doesn't vary by clock.
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);
const HOUR = 3600_000;
const BOUNDARY = { from: T0, to: T0 + 10 * HOUR };
const WINDOW = { from: T0 + 2 * HOUR, to: T0 + 3 * HOUR };

// jsdom returns 0 for getBoundingClientRect by default, which would make
// the pixel→time conversion divide by zero. Fix one wrapper width up-front.
const TRACK_WIDTH_PX = 1000;
const mockWrapperWidth = () => {
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({
      width: TRACK_WIDTH_PX,
      height: 12,
      top: 0,
      left: 0,
      right: TRACK_WIDTH_PX,
      bottom: 12,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('WindowProgressTrack — read-only', () => {
  it('renders as a progressbar when onCommit is not provided', () => {
    render(<WindowProgressTrack boundary={BOUNDARY} current={WINDOW} />);
    const el = screen.getByLabelText('Current window');
    expect(el).toHaveAttribute('role', 'progressbar');
  });
});

describe('WindowProgressTrack — interactive', () => {
  it('renders as a slider when onCommit is provided', () => {
    render(
      <WindowProgressTrack
        boundary={BOUNDARY}
        current={WINDOW}
        onCommit={jest.fn()}
      />
    );
    const el = screen.getByLabelText('Current window');
    expect(el).toHaveAttribute('role', 'slider');
    expect(el).toHaveAttribute('tabindex', '0');
  });

  it('calls onDragStart on pointerdown and onCommit on pointerup', () => {
    mockWrapperWidth();
    const onCommit = jest.fn();
    const onDragStart = jest.fn();
    render(
      <WindowProgressTrack
        boundary={BOUNDARY}
        current={WINDOW}
        onCommit={onCommit}
        onDragStart={onDragStart}
        tickIntervalMs={1_000_000}
      />
    );
    const segment = screen.getByTestId('window-segment');

    fireEvent.pointerDown(segment, { button: 0, clientX: 200, pointerId: 1 });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    // Drag 100px right → 100/1000 of 10h boundary = 1h shift forward.
    fireEvent.pointerMove(segment, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(segment, { clientX: 300, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledTimes(1);
    const next = onCommit.mock.calls[0][0];
    expect(next.from).toBe(WINDOW.from + HOUR);
    expect(next.to).toBe(WINDOW.to + HOUR);
  });

  it('preserves window width during a drag (step stays fixed)', () => {
    mockWrapperWidth();
    const onCommit = jest.fn();
    render(
      <WindowProgressTrack
        boundary={BOUNDARY}
        current={WINDOW}
        onCommit={onCommit}
        tickIntervalMs={1_000_000}
      />
    );
    const segment = screen.getByTestId('window-segment');

    fireEvent.pointerDown(segment, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(segment, { clientX: 350, pointerId: 1 });
    fireEvent.pointerUp(segment, { clientX: 350, pointerId: 1 });

    const next = onCommit.mock.calls[0][0];
    expect(next.to - next.from).toBe(WINDOW.to - WINDOW.from);
  });

  it('clamps the window to the boundary edges', () => {
    mockWrapperWidth();
    const onCommit = jest.fn();
    render(
      <WindowProgressTrack
        boundary={BOUNDARY}
        current={WINDOW}
        onCommit={onCommit}
        tickIntervalMs={1_000_000}
      />
    );
    const segment = screen.getByTestId('window-segment');

    // Drag far past the right edge — should clamp to (boundary.to - width).
    fireEvent.pointerDown(segment, { button: 0, clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(segment, { clientX: 100_000, pointerId: 1 });
    fireEvent.pointerUp(segment, { clientX: 100_000, pointerId: 1 });

    const width = WINDOW.to - WINDOW.from;
    const next = onCommit.mock.calls[0][0];
    expect(next.to).toBe(BOUNDARY.to);
    expect(next.from).toBe(BOUNDARY.to - width);
  });

  it('throttles intermediate commits by tickIntervalMs', () => {
    mockWrapperWidth();
    let nowMs = 1000;
    jest.spyOn(performance, 'now').mockImplementation(() => nowMs);
    const onCommit = jest.fn();
    render(
      <WindowProgressTrack
        boundary={BOUNDARY}
        current={WINDOW}
        onCommit={onCommit}
        tickIntervalMs={500}
      />
    );
    const segment = screen.getByTestId('window-segment');

    fireEvent.pointerDown(segment, { button: 0, clientX: 100, pointerId: 1 });

    // Three moves within one throttle window: only the first eligible
    // should commit (the pointerdown sets lastCommitMs = now; the next
    // commit cannot happen until tickIntervalMs has elapsed).
    nowMs += 100;
    fireEvent.pointerMove(segment, { clientX: 120, pointerId: 1 });
    nowMs += 100;
    fireEvent.pointerMove(segment, { clientX: 140, pointerId: 1 });
    nowMs += 100;
    fireEvent.pointerMove(segment, { clientX: 160, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(0);

    // Cross the throttle boundary — next move commits.
    nowMs += 300;
    fireEvent.pointerMove(segment, { clientX: 200, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);

    // Release fires a final commit if the position changed since the last
    // throttled commit.
    nowMs += 50;
    fireEvent.pointerMove(segment, { clientX: 250, pointerId: 1 });
    fireEvent.pointerUp(segment, { clientX: 250, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('ignores non-primary mouse buttons', () => {
    const onDragStart = jest.fn();
    render(
      <WindowProgressTrack
        boundary={BOUNDARY}
        current={WINDOW}
        onCommit={jest.fn()}
        onDragStart={onDragStart}
      />
    );
    const segment = screen.getByTestId('window-segment');
    fireEvent.pointerDown(segment, { button: 2, clientX: 100, pointerId: 1 });
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('nudges forward and back with arrow keys', () => {
    const onNudge = jest.fn();
    render(
      <WindowProgressTrack
        boundary={BOUNDARY}
        current={WINDOW}
        onCommit={jest.fn()}
        onNudge={onNudge}
      />
    );
    const el = screen.getByLabelText('Current window');
    fireEvent.keyDown(el, { key: 'ArrowRight' });
    fireEvent.keyDown(el, { key: 'ArrowLeft' });
    expect(onNudge).toHaveBeenNthCalledWith(1, true);
    expect(onNudge).toHaveBeenNthCalledWith(2, false);
  });
});
