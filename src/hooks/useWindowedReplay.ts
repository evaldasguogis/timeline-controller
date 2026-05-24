import { useCallback, useEffect, useRef, useState } from 'react';
import { EventBus } from '@grafana/data';
import { TimeRangeUpdatedEvent } from '@grafana/runtime';
import { TimeStep, WindowPosition } from '../types';
import { stepToMillis } from '../utils/timeRange';
import { encodeTimeValue, setVariables, VariableValues } from '../utils/variables';
import { PlaybackState, TickResult, useReplay } from './useReplay';
import { PanelKeyboardProps, usePanelKeyboard } from './usePanelKeyboard';
import { useLiveRef } from './useLiveRef';

// Window-playback engine shared by SlidingWindowMode and EventReplayMode.
// Both modes are mechanically identical — same tick math, same write
// model — they only differ in where the boundary comes from (dashboard
// global range vs. panel-saved bounds). This hook owns everything the
// modes had in common: current-window state, playback transport, seed-
// on-mount, step-resize, jump-to-start/end, keyboard shortcuts. The
// modes are left with their unique pieces (validation, usage-marker
// sync, the variable-picker / step-dropdown JSX shell).

export interface WindowMs {
  from: number;
  to: number;
}

export interface UseWindowedReplayOptions {
  // The range the window slides over. ms-since-epoch on both bounds.
  // Sliding mode passes timeRange.from/to.valueOf(); event mode passes
  // event.boundaryFrom/event.boundaryTo. Primitives (not an object) so
  // the seed useEffect can depend on the values, not object identity.
  boundaryFromMs: number;
  boundaryToMs: number;
  // Current step size (e.g. '5m'). Drives the window width.
  step: TimeStep;
  // Where to anchor a freshly-seeded window — left edge or right edge.
  initialPosition: WindowPosition;
  // Delay between ticks while playing.
  tickIntervalMs: number;
  // Names of the dashboard variables to write window bounds into.
  variableSpec: { from: string; to: string };
  // When true, writes are suppressed — modes' validation layer gates
  // tick / step writes by setting this true.
  hasErrors: boolean;
  // Optional dashboard-scoped event bus (from PanelProps). When provided,
  // we subscribe to TimeRangeUpdatedEvent and re-seed on fire — used by
  // SlidingWindowMode whose boundary IS the dashboard time range. Event
  // mode omits it (its boundary is panel-saved).
  eventBus?: EventBus;
}

export interface UseWindowedReplayResult {
  // Window to render (currentWindow if set, otherwise the initial seed).
  displayWindow: WindowMs;
  // Playback state machine.
  state: PlaybackState;
  // Per-direction disabled flags driven by current window position.
  forwardDisabled: boolean;
  backwardDisabled: boolean;
  jumpToStartDisabled: boolean;
  jumpToEndDisabled: boolean;
  // True when the configured step is wider than the boundary — both
  // step buttons get disabled and onTick would be a no-op.
  stepLargerThanBoundary: boolean;
  // Transport.
  startPlayback: (forward: boolean) => void;
  pause: () => void;
  step: (forward: boolean) => void;
  jumpToStart: () => void;
  jumpToEnd: () => void;
  // Drag-commit / arrow-nudge from WindowProgressTrack land here — sets
  // state AND publishes to the variables.
  commitWindow: (next: WindowMs) => void;
  // Spread onto the mode's outer wrapper to enable panel-level keyboard
  // shortcuts and click-to-focus.
  panelKeyboard: PanelKeyboardProps;
}

const initialWindowFor = (
  boundaryFromMs: number,
  boundaryToMs: number,
  timeStep: TimeStep,
  position: WindowPosition
): WindowMs => {
  const stepMs = stepToMillis(timeStep);
  if (position === 'end') {
    return { from: Math.max(boundaryFromMs, boundaryToMs - stepMs), to: boundaryToMs };
  }
  return { from: boundaryFromMs, to: Math.min(boundaryFromMs + stepMs, boundaryToMs) };
};

// Shift the window by `stepMs` and clamp to the configured boundary. When
// clamping engages, the window's width is preserved (the opposite edge
// slides too) and `boundaryHit` is reported so the caller can auto-pause
// playback. `>=` (not `>`) so that landing exactly on the boundary also
// pauses: the next tick would clamp to the same position with no visible
// change, just wasted queries.
const shiftWindow = (
  current: WindowMs,
  stepMs: number,
  boundaryFromMs: number,
  boundaryToMs: number,
  forward: boolean
): { next: WindowMs; boundaryHit: boolean } => {
  const span = current.to - current.from;
  let from = forward ? current.from + stepMs : current.from - stepMs;
  let to = forward ? current.to + stepMs : current.to - stepMs;
  let boundaryHit = false;
  if (forward && to >= boundaryToMs) {
    boundaryHit = true;
    to = boundaryToMs;
    from = boundaryToMs - span;
  } else if (!forward && from <= boundaryFromMs) {
    boundaryHit = true;
    from = boundaryFromMs;
    to = boundaryFromMs + span;
  }
  return { next: { from, to }, boundaryHit };
};

export const useWindowedReplay = ({
  boundaryFromMs,
  boundaryToMs,
  step: timeStep,
  initialPosition,
  tickIntervalMs,
  variableSpec,
  hasErrors,
  eventBus,
}: UseWindowedReplayOptions): UseWindowedReplayResult => {
  // null means "no window yet" — distinct from a window that happens to
  // coincide with the initial seed numerically. The seed effect below
  // flips this to non-null on mount; jump/step writes keep it non-null.
  const [currentWindow, setCurrentWindow] = useState<WindowMs | null>(null);

  // Always-current refs back the values that closures captured by
  // useReplay's setInterval and our stable useCallbacks need to read.
  const stepRef = useLiveRef(timeStep);
  const boundaryRef = useLiveRef({ from: boundaryFromMs, to: boundaryToMs });
  const currentWindowRef = useLiveRef(currentWindow);
  const variableSpecRef = useLiveRef(variableSpec);
  const initialPositionRef = useLiveRef(initialPosition);
  const hasErrorsRef = useLiveRef(hasErrors);

  // Per-tick write. Step is not written here — modes that publish a
  // step variable do it once when the user picks it via the dropdown,
  // not per tick. Suppresses writes during error states via the ref.
  const writeWindow = useCallback((win: WindowMs) => {
    if (hasErrorsRef.current) {
      return;
    }
    const spec = variableSpecRef.current;
    const values: VariableValues = {
      [spec.from]: encodeTimeValue(win.from),
      [spec.to]: encodeTimeValue(win.to),
    };
    setVariables(values);
  }, []);

  const handleTick = useCallback(
    (forward: boolean): TickResult => {
      const b = boundaryRef.current;
      const ts = stepRef.current;
      const stepMs = stepToMillis(ts);
      const start = currentWindowRef.current ?? initialWindowFor(b.from, b.to, ts, initialPositionRef.current);
      const { next, boundaryHit } = shiftWindow(start, stepMs, b.from, b.to, forward);
      setCurrentWindow(next);
      writeWindow(next);
      return { boundaryHit };
    },
    [writeWindow]
  );

  const { state, startPlayback, pause, step } = useReplay({
    tickIntervalMs,
    onTick: handleTick,
  });

  // Seed the variables with the initial window on mount and re-seed on
  // every boundary change. Two converging triggers, deduped via
  // `lastBoundaryMsRef`:
  //   - Prop: covers mount, event mode's panel-saved boundary changes,
  //     and any case where Grafana re-renders us with a fresh prop.
  //   - TimeRangeUpdatedEvent (only when `eventBus` is provided — sliding
  //     mode): robust to Grafana eventually not re-rendering skipDataQuery
  //     panels on time changes.
  const lastBoundaryMsRef = useRef<{ from: number; to: number } | null>(null);
  const seedFromBoundary = useCallback(
    (fromMs: number, toMs: number) => {
      const last = lastBoundaryMsRef.current;
      if (last !== null && last.from === fromMs && last.to === toMs) {
        return;
      }
      const isExternalChange = last !== null;
      lastBoundaryMsRef.current = { from: fromMs, to: toMs };
      if (isExternalChange) {
        pause();
      }
      const initial = initialWindowFor(fromMs, toMs, stepRef.current, initialPositionRef.current);
      setCurrentWindow(initial);
      writeWindow(initial);
    },
    [pause, writeWindow]
  );

  useEffect(() => {
    seedFromBoundary(boundaryFromMs, boundaryToMs);
  }, [boundaryFromMs, boundaryToMs, seedFromBoundary]);

  useEffect(() => {
    if (!eventBus) {
      return;
    }
    const sub = eventBus.getStream(TimeRangeUpdatedEvent).subscribe(({ payload }) => {
      seedFromBoundary(payload.from.valueOf(), payload.to.valueOf());
    });
    return () => sub.unsubscribe();
  }, [eventBus, seedFromBoundary]);

  // When the step changes mid-session, the visible window has the old
  // span. Anchor at the existing `from` and recompute `to`; if the new
  // span would overshoot the boundary, shift `from` left so the window
  // still fits. Also republish — the downstream panels need the resize.
  useEffect(() => {
    const cw = currentWindowRef.current;
    if (cw === null) {
      return;
    }
    const b = boundaryRef.current;
    const stepMs = stepToMillis(timeStep);
    let from = cw.from;
    let to = from + stepMs;
    if (to > b.to) {
      to = b.to;
      from = Math.max(b.from, to - stepMs);
    }
    if (from === cw.from && to === cw.to) {
      return;
    }
    const next: WindowMs = { from, to };
    setCurrentWindow(next);
    writeWindow(next);
  }, [timeStep, writeWindow]);

  // Snap the window to the boundary's edges. Both pause first — jumping
  // implicitly stops any active playback, otherwise the next tick would
  // immediately move off the edge. `jumpToStart` is always 'start' (left
  // edge) regardless of the configured initialPosition — jump-to-start
  // is a directional action, not a seed.
  const jumpToStart = useCallback(() => {
    pause();
    const b = boundaryRef.current;
    const win = initialWindowFor(b.from, b.to, stepRef.current, 'start');
    writeWindow(win);
    setCurrentWindow(win);
  }, [pause, writeWindow]);

  const jumpToEnd = useCallback(() => {
    pause();
    const b = boundaryRef.current;
    const stepMs = stepToMillis(stepRef.current);
    const win: WindowMs = {
      from: Math.max(b.from, b.to - stepMs),
      to: b.to,
    };
    writeWindow(win);
    setCurrentWindow(win);
  }, [pause, writeWindow]);

  // Drag-commit / arrow-nudge: WindowProgressTrack hands us a pre-clamped
  // window via onCommit; we set state AND publish to variables. The track
  // also calls pause via onDragStart before dragging begins.
  const commitWindow = useCallback(
    (win: WindowMs) => {
      setCurrentWindow(win);
      writeWindow(win);
    },
    [writeWindow]
  );

  const panelKeyboard = usePanelKeyboard({
    state,
    startPlayback,
    pause,
    step,
    jumpToStart,
    jumpToEnd,
  });

  const stepMsForDisplay = stepToMillis(timeStep);
  const boundarySpan = boundaryToMs - boundaryFromMs;
  const displayWindow =
    currentWindow ?? initialWindowFor(boundaryFromMs, boundaryToMs, timeStep, initialPosition);
  const forwardDisabled = displayWindow.to >= boundaryToMs;
  const backwardDisabled = displayWindow.from <= boundaryFromMs;

  return {
    displayWindow,
    state,
    forwardDisabled,
    backwardDisabled,
    jumpToStartDisabled: backwardDisabled,
    jumpToEndDisabled: forwardDisabled,
    stepLargerThanBoundary: stepMsForDisplay > boundarySpan,
    startPlayback,
    pause,
    step,
    jumpToStart,
    jumpToEnd,
    commitWindow,
    panelKeyboard,
  };
};
