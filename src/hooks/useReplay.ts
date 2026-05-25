import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveRef } from './useLiveRef';

export type PlaybackState = 'playing-back' | 'playing-forward' | 'paused';

export interface TickResult {
  // True when the tick landed on a boundary and further playback in the same
  // direction would be a no-op. Setting this auto-pauses the transport.
  boundaryHit: boolean;
}

export interface UseReplayOptions {
  tickIntervalMs: number;
  // Performs the mode-specific write for one step. Called once per timer tick
  // during playback and once per user-driven Step. The interval reads it
  // through a live ref, so callers don't need to memoize it — a fresh
  // function each render is fine and updates take effect immediately
  // without forcing a reschedule.
  onTick: (forward: boolean) => TickResult;
}

export interface UseReplayResult {
  state: PlaybackState;
  startPlayback: (forward: boolean) => void;
  pause: () => void;
  step: (forward: boolean) => void;
}

// Owns the play/pause/step state machine and the timer that drives playback.
// The actual "what changes on each tick" is delegated via onTick — its two
// consumers are `useGlobalRangeReplay` (Basic mode, shifts the dashboard's
// global range) and `useWindowedReplay` (Sliding + Event, write a pair of
// template variables).
export const useReplay = ({ tickIntervalMs, onTick }: UseReplayOptions): UseReplayResult => {
  const [state, setState] = useState<PlaybackState>('paused');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Both deps live in refs so the running interval always reads the latest
  // values rather than the closure captured when setInterval started —
  // otherwise changing tickIntervalMs or onTick mid-playback would have no
  // effect until the user paused and resumed.
  const onTickRef = useLiveRef(onTick);
  const tickIntervalMsRef = useLiveRef(tickIntervalMs);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    clearTimer();
    setState('paused');
  }, [clearTimer]);

  const runTick = useCallback(
    (forward: boolean) => {
      const { boundaryHit } = onTickRef.current(forward);
      if (boundaryHit) {
        clearTimer();
        setState('paused');
      }
    },
    [clearTimer, onTickRef]
  );

  const startPlayback = useCallback(
    (forward: boolean) => {
      clearTimer();
      timerRef.current = setInterval(() => runTick(forward), tickIntervalMsRef.current);
      setState(forward ? 'playing-forward' : 'playing-back');
    },
    [clearTimer, runTick, tickIntervalMsRef]
  );

  const step = useCallback(
    (forward: boolean) => {
      // Stepping while playing implicitly pauses — otherwise the user would
      // need to pause before stepping, which feels redundant. We don't route
      // through runTick because boundary-on-step doesn't need to change state
      // (we're already pausing) and the mode-side write has its own clamp.
      pause();
      onTickRef.current(forward);
    },
    [pause, onTickRef]
  );

  // Stop any active interval on unmount so an out-of-tree tick can't fire
  // (which would try to setState on an unmounted component).
  useEffect(() => clearTimer, [clearTimer]);

  return { state, startPlayback, pause, step };
};
